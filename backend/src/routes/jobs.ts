import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { rbacMiddleware } from '../middleware/rbac.js';
import {
  listJobs,
  getJobByIdCrossPartition,
  getJobsSince,
  createJob,
  updateJobFields,
  updateJobStatus,
  assignJob,
  deleteJob,
} from '../services/jobsDb.js';
import {
  VALID_STATUS_TRANSITIONS,
  type JobStatus,
  type JobPriority,
  type CreateJobRequest,
} from '../types/job.js';
import {
  broadcastJobCreated,
  broadcastJobStatusChanged,
  broadcastJobAssigned,
  broadcastJobDeleted,
} from '../services/jobBroadcasts.js';
import { generateSasUrl } from '../services/blobStorage.js';
import { getUserDisplayNames } from '../services/usersDb.js';

export const jobsRouter = Router();

// All routes require authentication
jobsRouter.use(authMiddleware);

const VALID_STATUSES: JobStatus[] = ['pending', 'assigned', 'in-progress', 'completed', 'cancelled'];
const VALID_PRIORITIES: JobPriority[] = ['low', 'medium', 'high', 'urgent'];

// ── GET /api/jobs ─────────────────────────────────────────────
jobsRouter.get(
  '/',
  rbacMiddleware(['admin', 'dispatcher', 'technician']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = req.query.status as JobStatus | undefined;

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({
        error: { code: 'INVALID_STATUS', message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      });
      return;
    }

    const result = await listJobs({
      role: user.role,
      vendorId: user.vendorId,
      userId: user.userId,
      limit,
      offset,
      status,
    });

    // Collect all user IDs for batch name resolution
    const allUserIds = new Set<string>();
    for (const job of result.jobs) {
      allUserIds.add(job.createdBy);
      if (job.assignedTo) allUserIds.add(job.assignedTo);
    }
    const nameMap = await getUserDisplayNames([...allUserIds]);

    // Generate thumbnail SAS URLs and enrich with display names
    const enrichedJobs = await Promise.all(
      result.jobs.map(async (job) => {
        const enriched: Record<string, unknown> = {
          ...job,
          createdByName: nameMap[job.createdBy] || job.createdBy,
          assignedToName: job.assignedTo ? (nameMap[job.assignedTo] || job.assignedTo) : null,
        };
        if (job.attachments?.length) {
          enriched.thumbnailUrl = await generateSasUrl(job.attachments[0].blobName);
        }
        return enriched;
      }),
    );

    res.json({
      data: enrichedJobs,
      pagination: { total: result.total, limit, offset },
    });
  },
);

// ── POST /api/jobs/sync ───────────────────────────────────────
// Must be declared BEFORE GET /:id to avoid "sync" matching as a job ID
jobsRouter.post(
  '/sync',
  rbacMiddleware(['admin', 'dispatcher', 'technician']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { since } = req.body as { since?: string | null };

    if (since) {
      const parsed = new Date(since);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid since timestamp' },
        });
        return;
      }
    }

    const syncTimestamp = new Date().toISOString();

    const jobs = await getJobsSince({
      since: since ?? null,
      role: user.role,
      vendorId: user.vendorId,
      userId: user.userId,
    });

    // Collect all user IDs for batch name resolution
    const allUserIds = new Set<string>();
    for (const job of jobs) {
      allUserIds.add(job.createdBy);
      if (job.assignedTo) allUserIds.add(job.assignedTo);
    }
    const nameMap = await getUserDisplayNames([...allUserIds]);

    // Generate thumbnail SAS URLs and enrich with display names
    const enrichedJobs = await Promise.all(
      jobs.map(async (job) => {
        const enriched: Record<string, unknown> = {
          ...job,
          createdByName: nameMap[job.createdBy] || job.createdBy,
          assignedToName: job.assignedTo ? (nameMap[job.assignedTo] || job.assignedTo) : null,
        };
        if (job.attachments?.length) {
          enriched.thumbnailUrl = await generateSasUrl(job.attachments[0].blobName);
        }
        return enriched;
      }),
    );

    res.json({ data: enrichedJobs, syncTimestamp });
  },
);

// ── GET /api/jobs/:id ─────────────────────────────────────────
jobsRouter.get(
  '/:id',
  rbacMiddleware(['admin', 'dispatcher', 'technician']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const id = req.params.id as string;
    const job = await getJobByIdCrossPartition(id);

    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // RBAC: dispatcher can only see own vendor, technician only own assigned
    if (user.role === 'dispatcher' && job.vendorId !== user.vendorId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }
    if (user.role === 'technician' && job.assignedTo !== user.userId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Resolve user IDs to display names
    const userIds = [job.createdBy, ...(job.assignedTo ? [job.assignedTo] : [])];
    const nameMap = await getUserDisplayNames(userIds);
    const enriched: Record<string, unknown> = {
      ...job,
      createdByName: nameMap[job.createdBy] || job.createdBy,
      assignedToName: job.assignedTo ? (nameMap[job.assignedTo] || job.assignedTo) : null,
    };

    // Generate SAS URLs for attachments
    if (job.attachments?.length) {
      const withSas = await Promise.all(
        job.attachments.map(async (att) => ({
          ...att,
          sasUrl: await generateSasUrl(att.blobName),
        })),
      );
      enriched.attachments = withSas;
    }

    res.json({ data: enriched });
  },
);

// ── POST /api/jobs ────────────────────────────────────────────
jobsRouter.post(
  '/',
  rbacMiddleware(['admin', 'dispatcher']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const body = req.body as Partial<CreateJobRequest>;

    // Validate required fields
    if (!body.title?.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } });
      return;
    }
    if (!body.description?.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'description is required' } });
      return;
    }
    if (!body.priority || !VALID_PRIORITIES.includes(body.priority)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
      });
      return;
    }
    if (!body.vendorId?.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'vendorId is required' } });
      return;
    }
    if (!body.location || !body.location.storeName || !body.location.address || !body.location.city || !body.location.state || !body.location.zipCode) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'location requires storeName, address, city, state, zipCode' },
      });
      return;
    }

    // Dispatcher can only create jobs for their own vendor
    if (user.role === 'dispatcher' && body.vendorId !== user.vendorId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Dispatchers can only create jobs for their own vendor' },
      });
      return;
    }

    const job = await createJob(body as CreateJobRequest, user.userId);
    broadcastJobCreated(job, user.userId);
    res.status(201).json({ data: job });
  },
);

// ── PATCH /api/jobs/:id ──────────────────────────────────────
jobsRouter.patch(
  '/:id',
  rbacMiddleware(['admin', 'dispatcher']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const id = req.params.id as string;
    const { title, description, priority, location, _etag } = req.body as {
      title?: string;
      description?: string;
      priority?: string;
      location?: { storeName?: string; address?: string; city?: string; state?: string; zipCode?: string };
      _etag?: string;
    };

    if (!_etag) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '_etag is required for optimistic concurrency' },
      });
      return;
    }

    // Validate fields if provided
    if (title !== undefined && !title.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'title cannot be empty' } });
      return;
    }
    if (description !== undefined && !description.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'description cannot be empty' } });
      return;
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as JobPriority)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
      });
      return;
    }
    if (location && (!location.storeName || !location.address || !location.city || !location.state || !location.zipCode)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'location requires storeName, address, city, state, zipCode' },
      });
      return;
    }

    const job = await getJobByIdCrossPartition(id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Dispatcher can only edit own vendor's jobs
    if (user.role === 'dispatcher' && job.vendorId !== user.vendorId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    const fields: Record<string, unknown> = {};
    if (title !== undefined) fields.title = title.trim();
    if (description !== undefined) fields.description = description.trim();
    if (priority !== undefined) fields.priority = priority;
    if (location) fields.location = location;

    try {
      const updated = await updateJobFields(id, job.tenantId, fields, _etag);
      res.json({ data: updated });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 412) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: 'Job was modified by another request. Refresh and retry.' },
        });
        return;
      }
      throw err;
    }
  },
);

// ── PATCH /api/jobs/:id/status ────────────────────────────────
jobsRouter.patch(
  '/:id/status',
  rbacMiddleware(['admin', 'dispatcher', 'technician']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { status: newStatus, _etag } = req.body as { status?: string; _etag?: string };

    if (!newStatus || !VALID_STATUSES.includes(newStatus as JobStatus)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      });
      return;
    }
    if (!_etag) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '_etag is required for optimistic concurrency' },
      });
      return;
    }

    // Fetch job to check access and validate transition
    const id = req.params.id as string;
    const job = await getJobByIdCrossPartition(id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // RBAC check
    if (user.role === 'dispatcher' && job.vendorId !== user.vendorId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }
    if (user.role === 'technician' && job.assignedTo !== user.userId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Technicians cannot cancel jobs
    if (user.role === 'technician' && newStatus === 'cancelled') {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Technicians cannot cancel jobs' },
      });
      return;
    }

    // Validate status transition
    const allowed = VALID_STATUS_TRANSITIONS[job.status];
    if (!allowed.includes(newStatus as JobStatus)) {
      res.status(422).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from '${job.status}' to '${newStatus}'. Allowed: ${allowed.length ? allowed.join(', ') : 'none'}`,
        },
      });
      return;
    }

    try {
      const updated = await updateJobStatus(id, job.tenantId, newStatus as JobStatus, _etag);
      broadcastJobStatusChanged(updated, job.status, user.userId);
      res.json({ data: updated });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 412) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: 'Job was modified by another request. Refresh and retry.' },
        });
        return;
      }
      throw err;
    }
  },
);

// ── POST /api/jobs/:id/assign ─────────────────────────────────
jobsRouter.post(
  '/:id/assign',
  rbacMiddleware(['admin', 'dispatcher']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { technicianId } = req.body as { technicianId?: string };

    if (!technicianId?.trim()) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'technicianId is required' },
      });
      return;
    }

    // Fetch job to check access
    const id = req.params.id as string;
    const job = await getJobByIdCrossPartition(id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Dispatcher can only assign within their vendor
    if (user.role === 'dispatcher' && job.vendorId !== user.vendorId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    const updated = await assignJob(id, job.tenantId, technicianId);
    broadcastJobAssigned(updated, user.userId);
    res.json({ data: updated });
  },
);

// ── DELETE /api/jobs/:id ──────────────────────────────────────
jobsRouter.delete(
  '/:id',
  rbacMiddleware(['admin']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const id = req.params.id as string;
    const job = await getJobByIdCrossPartition(id);

    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    await deleteJob(id, job.tenantId);
    broadcastJobDeleted(job, user.userId);
    res.json({ message: 'Job deleted' });
  },
);
