import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { getLocalJobs } from '../services/localDb';
import { useOffline } from '../contexts/OfflineContext';
import type { Job, JobStatus } from '../types/job';
import type { JobSyncStatus } from '../types/sync';

export type JobWithSync = Job & { syncStatus?: JobSyncStatus };

interface UseJobsReturn {
  jobs: JobWithSync[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  activeFilter: JobStatus | 'all';
  setActiveFilter: (filter: JobStatus | 'all') => void;
  refresh: () => void;
}

export function useJobs(): UseJobsReturn {
  const { isOnline, db, triggerSync, lastEventTimestamp } = useOffline();
  const [jobs, setJobs] = useState<JobWithSync[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<JobStatus | 'all'>('all');

  const loadFromCache = useCallback(() => {
    const status = activeFilter === 'all' ? undefined : activeFilter;
    const cached = getLocalJobs(db, status);
    setJobs(cached);
  }, [db, activeFilter]);

  const fetchJobs = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    setError('');

    // Always load from SQLite first (instant) — never blank the screen
    const cached = getLocalJobs(db, activeFilter === 'all' ? undefined : activeFilter);
    setJobs(cached);

    // Only show full-screen spinner on first load with empty cache
    if (cached.length === 0 && !showRefresh) setIsLoading(true);

    if (isOnline) {
      try {
        // Sync in background, then refresh from cache
        await triggerSync();
        loadFromCache();
      } catch (err) {
        // If API fails, we still have cached data
        if (cached.length === 0) {
          setError(err instanceof Error ? err.message : 'Failed to sync jobs');
        }
      }
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [isOnline, db, activeFilter, loadFromCache, triggerSync]);

  // Re-fetch when screen gains focus or filter changes
  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  // Auto-refresh when a SignalR event updates the cache
  useEffect(() => {
    if (lastEventTimestamp) {
      loadFromCache();
    }
  }, [lastEventTimestamp, loadFromCache]);

  const refresh = useCallback(() => {
    fetchJobs(true);
  }, [fetchJobs]);

  return { jobs, isLoading, isRefreshing, error, activeFilter, setActiveFilter, refresh };
}
