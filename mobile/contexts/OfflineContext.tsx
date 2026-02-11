import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { config } from '../constants/config';
import { getDatabase, upsertJobs, deleteLocalJob } from '../services/localDb';
import { getPendingCount } from '../services/actionQueue';
import { performSync } from '../services/syncEngine';
import { connectSignalR, disconnectSignalR, onSignalREvent } from '../services/signalr';
import { useAuth } from './AuthContext';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SignalREvent } from '../types/signalr';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncError: string | null;
  triggerSync: (forceFullSync?: boolean) => Promise<void>;
  db: SQLiteDatabase;
  isRealTimeConnected: boolean;
  lastEventTimestamp: string | null;
}

const OfflineContext = createContext<OfflineContextType | null>(null);

const SYNC_INTERVAL_MS = 4_000;            // 4s when no SignalR
const SYNC_INTERVAL_REALTIME_MS = 10_000;  // 10s when SignalR active

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const dbRef = useRef(getDatabase());
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);
  const [lastEventTimestamp, setLastEventTimestamp] = useState<string | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingCount(dbRef.current));
  }, []);

  const triggerSync = useCallback(async (forceFullSync = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      await performSync(dbRef.current, forceFullSync);
      refreshPendingCount();
      // Notify hooks that cache has new data so they reload
      setLastEventTimestamp(new Date().toISOString());
    } catch (err) {
      setLastSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  // Handle incoming SignalR events — upsert job into SQLite + trigger sync
  const handleSignalREvent = useCallback((event: SignalREvent) => {
    if (event && event.job) {
      upsertJobs(dbRef.current, [event.job], true);
      setLastEventTimestamp(new Date().toISOString());
      refreshPendingCount();
      // Also trigger a background sync to ensure full consistency
      triggerSync().catch(() => {});
    }
  }, [refreshPendingCount, triggerSync]);

  // Handle JobDeleted events — remove job from local cache
  const handleJobDeletedEvent = useCallback((event: SignalREvent) => {
    if (event && event.job) {
      deleteLocalJob(dbRef.current, event.job.id);
      setLastEventTimestamp(new Date().toISOString());
    }
  }, []);

  // Monitor network status
  const isOnlineRef = useRef(true);
  const wasOfflineRef = useRef(false);

  const goOnline = useCallback(() => {
    if (!isOnlineRef.current) {
      wasOfflineRef.current = true; // mark that we're coming back from offline
    }
    isOnlineRef.current = true;
    setIsOnline(true);
  }, []);

  const goOffline = useCallback(() => {
    isOnlineRef.current = false;
    wasOfflineRef.current = false;
    setIsOnline(false);
  }, []);

  // When transitioning offline → online, force a full sync immediately
  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      triggerSync(true); // forceFullSync = true to catch deletions + drain queue
    }
  }, [isOnline, triggerSync]);

  useEffect(() => {
    // Primary: NetInfo listener for instant offline detection
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        goOnline();
      } else {
        goOffline();
      }
    });

    // Bidirectional health poll: detect going offline AND coming back online
    let consecutiveFailures = 0;
    let lastPollState = isOnlineRef.current;
    const pollTimer = setInterval(async () => {
      // Reset counter when state changed externally (e.g. by NetInfo)
      if (isOnlineRef.current !== lastPollState) {
        consecutiveFailures = 0;
        lastPollState = isOnlineRef.current;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${config.apiBaseUrl}/api/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          consecutiveFailures = 0;
          if (!isOnlineRef.current) goOnline();
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= 2 && isOnlineRef.current) goOffline();
        }
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 2 && isOnlineRef.current) goOffline();
      }
    }, 3000);

    // Also re-check when app comes back to foreground
    const appStateSub = AppState.addEventListener('change', async (next) => {
      if (next === 'active') {
        try {
          const state = await NetInfo.fetch();
          if (state.isConnected) goOnline();
          else goOffline();
        } catch {
          // ignore
        }
      }
    });

    return () => {
      unsubscribe();
      clearInterval(pollTimer);
      appStateSub.remove();
    };
  }, [goOnline, goOffline]);

  // SignalR connection lifecycle — connect when authenticated + online, retry on failure
  useEffect(() => {
    if (!isOnline || !token) {
      disconnectSignalR();
      setIsRealTimeConnected(false);
      return;
    }

    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000];
    let attempt = 0;

    const tryConnect = () => {
      connectSignalR()
        .then(() => {
          if (mounted) {
            setIsRealTimeConnected(true);
            attempt = 0;
          }
        })
        .catch(() => {
          if (mounted) {
            setIsRealTimeConnected(false);
            const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
            attempt++;
            retryTimer = setTimeout(tryConnect, delay);
          }
        });
    };

    tryConnect();

    const unsub1 = onSignalREvent('JobCreated', handleSignalREvent);
    const unsub2 = onSignalREvent('JobStatusChanged', handleSignalREvent);
    const unsub3 = onSignalREvent('JobAssigned', handleSignalREvent);
    const unsub4 = onSignalREvent('JobDeleted', handleJobDeletedEvent);

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      disconnectSignalR();
      setIsRealTimeConnected(false);
    };
  }, [isOnline, token, handleSignalREvent, handleJobDeletedEvent]);

  // Periodic sync — wider interval when SignalR is active
  useEffect(() => {
    if (isOnline) {
      const interval = isRealTimeConnected ? SYNC_INTERVAL_REALTIME_MS : SYNC_INTERVAL_MS;
      syncIntervalRef.current = setInterval(() => {
        triggerSync();
      }, interval);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isOnline, isRealTimeConnected, triggerSync]);

  // Refresh pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncError,
        triggerSync,
        db: dbRef.current,
        isRealTimeConnected,
        lastEventTimestamp,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

/** Hook to access offline/sync state. Must be used inside OfflineProvider. */
export function useOffline(): OfflineContextType {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
