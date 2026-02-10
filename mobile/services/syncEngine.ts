import type { SQLiteDatabase } from 'expo-sqlite';
import { syncJobs, createJob, updateJobStatus } from './jobs';
import {
  getPendingActions,
  dequeueAction,
  markActionFailed,
  removeAction,
} from './actionQueue';
import {
  upsertJobs,
  markJobSyncStatus,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from './localDb';
import { ApiError } from './api';

const MAX_RETRIES = 3;
const FULL_SYNC_EVERY = 5; // Force a full resync every N cycles to catch deletions
let syncCycleCount = 0;

export interface SyncResult {
  actionsProcessed: number;
  actionsFailed: number;
  jobsSynced: number;
  conflicts: string[]; // job IDs that hit 409
}

/**
 * Full sync cycle:
 * 1. Drain the offline action queue (writes before reads)
 * 2. Delta sync from server into SQLite
 *    Every Nth cycle, force a full resync to catch deleted jobs
 */
export async function performSync(database: SQLiteDatabase): Promise<SyncResult> {
  const result: SyncResult = {
    actionsProcessed: 0,
    actionsFailed: 0,
    jobsSynced: 0,
    conflicts: [],
  };

  // ── Step 1: Drain pending actions ───────────────────────────
  const actions = getPendingActions(database);

  for (const action of actions) {
    try {
      if (action.actionType === 'CREATE_JOB') {
        const { data: created } = await createJob(action.payload);
        // Cache the newly created job locally
        upsertJobs(database, [created], false);
        dequeueAction(database, action.id);
        result.actionsProcessed++;
      } else if (action.actionType === 'UPDATE_STATUS') {
        const { jobId, status, etag } = action.payload;
        const { data: updated } = await updateJobStatus(jobId, status, etag);
        upsertJobs(database, [updated], false);
        dequeueAction(database, action.id);
        result.actionsProcessed++;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Conflict — mark the job so UI can show conflict resolution
        if (action.actionType === 'UPDATE_STATUS') {
          markJobSyncStatus(database, action.payload.jobId, 'conflict');
          result.conflicts.push(action.payload.jobId);
        }
        removeAction(database, action.id);
        result.actionsFailed++;
      } else if (err instanceof Error && err.message.includes('timed out')) {
        // Network error — stop processing queue, retry next sync
        break;
      } else {
        // Other error — increment retry, remove after MAX_RETRIES
        const errorMsg = err instanceof Error ? err.message : String(err);
        markActionFailed(database, action.id, errorMsg);

        if (action.retryCount + 1 >= MAX_RETRIES) {
          if (action.actionType === 'UPDATE_STATUS') {
            markJobSyncStatus(database, action.payload.jobId, 'conflict');
            result.conflicts.push(action.payload.jobId);
          }
          removeAction(database, action.id);
        }
        result.actionsFailed++;
      }
    }
  }

  // ── Step 2: Delta sync from server ──────────────────────────
  try {
    syncCycleCount++;
    let since = getLastSyncTimestamp(database);

    // Every Nth cycle, force a full resync to catch deleted jobs
    if (since && syncCycleCount % FULL_SYNC_EVERY === 0) {
      since = null;
    }

    const syncResponse = await syncJobs(since);

    if (!since) {
      // Full sync — remove jobs that no longer exist on server
      database.runSync("DELETE FROM jobs WHERE syncStatus = 'synced'");
    }

    if (syncResponse.data.length > 0) {
      upsertJobs(database, syncResponse.data, true);
    }

    setLastSyncTimestamp(database, syncResponse.syncTimestamp);
    result.jobsSynced = syncResponse.data.length;
  } catch {
    // Delta sync failed — not critical, will retry next cycle
  }

  return result;
}
