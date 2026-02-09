import type { SQLiteDatabase } from 'expo-sqlite';
import type { JobStatus } from '../types/job';
import type { CreateJobRequest } from '../types/job';

// ── Action types ────────────────────────────────────────────

export type PendingAction =
  | { actionType: 'CREATE_JOB'; payload: CreateJobRequest }
  | { actionType: 'UPDATE_STATUS'; payload: { jobId: string; status: JobStatus; etag: string } };

interface PendingActionRow {
  id: number;
  actionType: string;
  payload: string;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

// ── Queue operations ────────────────────────────────────────

/** Adds an action to the offline queue */
export function enqueueAction(database: SQLiteDatabase, action: PendingAction): void {
  database.runSync(
    'INSERT INTO pending_actions (actionType, payload, createdAt) VALUES (?, ?, ?)',
    [action.actionType, JSON.stringify(action.payload), new Date().toISOString()],
  );
}

/** Returns the number of pending actions */
export function getPendingCount(database: SQLiteDatabase): number {
  const row = database.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM pending_actions',
  );
  return row?.count ?? 0;
}

/** Returns all pending actions in FIFO order */
export function getPendingActions(database: SQLiteDatabase): (PendingAction & { id: number; retryCount: number })[] {
  const rows = database.getAllSync<PendingActionRow>(
    'SELECT * FROM pending_actions ORDER BY id ASC',
  );
  return rows.map((row) => ({
    id: row.id,
    actionType: row.actionType as PendingAction['actionType'],
    payload: JSON.parse(row.payload),
    retryCount: row.retryCount,
  }));
}

/** Removes a successfully processed action */
export function dequeueAction(database: SQLiteDatabase, actionId: number): void {
  database.runSync('DELETE FROM pending_actions WHERE id = ?', [actionId]);
}

/** Increments retry count and records the error */
export function markActionFailed(database: SQLiteDatabase, actionId: number, error: string): void {
  database.runSync(
    'UPDATE pending_actions SET retryCount = retryCount + 1, lastError = ? WHERE id = ?',
    [error, actionId],
  );
}

/** Removes an action that has exceeded max retries */
export function removeAction(database: SQLiteDatabase, actionId: number): void {
  database.runSync('DELETE FROM pending_actions WHERE id = ?', [actionId]);
}
