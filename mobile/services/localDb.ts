import * as SQLite from 'expo-sqlite';
import type { Job, JobStatus } from '../types/job';
import type { JobSyncStatus } from '../types/sync';

let db: SQLite.SQLiteDatabase | null = null;

/** Opens (or returns cached) database and initializes schema */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('retailfixit.db');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: SQLite.SQLiteDatabase): void {
  database.execSync(`
    CREATE TABLE IF NOT EXISTS jobs (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      status          TEXT NOT NULL,
      priority        TEXT NOT NULL,
      tenantId        TEXT NOT NULL,
      vendorId        TEXT NOT NULL,
      createdBy       TEXT NOT NULL,
      createdByName   TEXT,
      assignedTo      TEXT,
      assignedToName  TEXT,
      location        TEXT NOT NULL,
      createdAt       TEXT NOT NULL,
      updatedAt       TEXT NOT NULL,
      etag            TEXT,
      syncStatus      TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      actionType  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      createdAt   TEXT NOT NULL,
      retryCount  INTEGER DEFAULT 0,
      lastError   TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add columns if missing (existing installs)
  try {
    database.runSync('ALTER TABLE jobs ADD COLUMN createdByName TEXT');
  } catch { /* column already exists */ }
  try {
    database.runSync('ALTER TABLE jobs ADD COLUMN assignedToName TEXT');
  } catch { /* column already exists */ }
  try {
    database.runSync('ALTER TABLE jobs ADD COLUMN thumbnailUrl TEXT');
  } catch { /* column already exists */ }

  // One-time migration: force full resync so thumbnailUrl gets populated
  const migrated = database.getFirstSync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'migration_thumbnailUrl'",
  );
  if (!migrated) {
    database.runSync("DELETE FROM sync_meta WHERE key = 'lastSyncTimestamp'");
    database.runSync(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('migration_thumbnailUrl', '1')",
    );
  }
}

// ── Job helpers ──────────────────────────────────────────────

interface JobRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tenantId: string;
  vendorId: string;
  createdBy: string;
  createdByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  location: string;
  createdAt: string;
  updatedAt: string;
  etag: string | null;
  syncStatus: string;
  thumbnailUrl: string | null;
}

function rowToJob(row: JobRow): Job & { syncStatus: JobSyncStatus } {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as JobStatus,
    priority: row.priority as Job['priority'],
    tenantId: row.tenantId,
    vendorId: row.vendorId,
    createdBy: row.createdBy,
    createdByName: row.createdByName ?? undefined,
    assignedTo: row.assignedTo,
    assignedToName: row.assignedToName,
    location: JSON.parse(row.location),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    _etag: row.etag ?? undefined,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    syncStatus: row.syncStatus as JobSyncStatus,
  };
}

/** Upsert jobs from API into local cache. Skips jobs with syncStatus='pending'. */
export function upsertJobs(database: SQLite.SQLiteDatabase, jobs: Job[], skipPending = true): void {
  for (const job of jobs) {
    if (skipPending) {
      const existing = database.getFirstSync<{ syncStatus: string }>(
        'SELECT syncStatus FROM jobs WHERE id = ?',
        [job.id],
      );
      if (existing && existing.syncStatus === 'pending') continue;
    }

    database.runSync(
      `INSERT OR REPLACE INTO jobs (id, title, description, status, priority, tenantId, vendorId, createdBy, createdByName, assignedTo, assignedToName, location, createdAt, updatedAt, etag, thumbnailUrl, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        job.id, job.title, job.description, job.status, job.priority,
        job.tenantId, job.vendorId, job.createdBy, job.createdByName ?? null,
        job.assignedTo ?? null, job.assignedToName ?? null,
        JSON.stringify(job.location), job.createdAt, job.updatedAt,
        job._etag ?? null, job.thumbnailUrl ?? null,
      ],
    );
  }
}

/** Get all cached jobs, optionally filtered by status */
export function getLocalJobs(database: SQLite.SQLiteDatabase, status?: JobStatus): (Job & { syncStatus: JobSyncStatus })[] {
  if (status) {
    const rows = database.getAllSync<JobRow>(
      'SELECT * FROM jobs WHERE status = ? ORDER BY updatedAt DESC',
      [status],
    );
    return rows.map(rowToJob);
  }

  const rows = database.getAllSync<JobRow>(
    'SELECT * FROM jobs ORDER BY updatedAt DESC',
  );
  return rows.map(rowToJob);
}

/** Get a single job from cache */
export function getLocalJobById(database: SQLite.SQLiteDatabase, id: string): (Job & { syncStatus: JobSyncStatus }) | null {
  const row = database.getFirstSync<JobRow>(
    'SELECT * FROM jobs WHERE id = ?',
    [id],
  );
  return row ? rowToJob(row) : null;
}

/** Update a job's status locally (optimistic update) */
export function updateLocalJobStatus(database: SQLite.SQLiteDatabase, id: string, status: JobStatus): void {
  database.runSync(
    'UPDATE jobs SET status = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [status, new Date().toISOString(), 'pending', id],
  );
}

/** Delete a job from local cache */
export function deleteLocalJob(database: SQLite.SQLiteDatabase, id: string): void {
  database.runSync('DELETE FROM jobs WHERE id = ?', [id]);
}

/** Mark a job's syncStatus */
export function markJobSyncStatus(database: SQLite.SQLiteDatabase, id: string, syncStatus: JobSyncStatus): void {
  database.runSync(
    'UPDATE jobs SET syncStatus = ? WHERE id = ?',
    [syncStatus, id],
  );
}

// ── Sync metadata ────────────────────────────────────────────

/** Get the last sync timestamp */
export function getLastSyncTimestamp(database: SQLite.SQLiteDatabase): string | null {
  const row = database.getFirstSync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'lastSyncTimestamp'",
  );
  return row?.value ?? null;
}

/** Set the last sync timestamp */
export function setLastSyncTimestamp(database: SQLite.SQLiteDatabase, timestamp: string): void {
  database.runSync(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncTimestamp', ?)",
    [timestamp],
  );
}

/** Clear all local data (for logout) */
export function clearLocalData(database: SQLite.SQLiteDatabase): void {
  database.execSync('DELETE FROM jobs; DELETE FROM pending_actions; DELETE FROM sync_meta;');
}
