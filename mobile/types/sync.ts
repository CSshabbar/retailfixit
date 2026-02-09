import type { Job } from './job';

/** Response from POST /api/jobs/sync */
export interface SyncResponse {
  data: Job[];
  syncTimestamp: string;
}

/** Possible sync status values for a locally cached job */
export type JobSyncStatus = 'synced' | 'pending' | 'conflict';
