import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../middleware/auth.js';
import { rbacMiddleware } from '../middleware/rbac.js';
import { getJobByIdCrossPartition } from '../services/jobsDb.js';
import { getJobsContainer } from '../services/cosmosDb.js';
import { uploadBlob, deleteBlobByName, generateSasUrl } from '../services/blobStorage.js';
import type { Attachment } from '../types/job.js';

export const attachmentsRouter = Router({ mergeParams: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
});

// All routes require authentication
attachmentsRouter.use(authMiddleware);

// ── POST /api/jobs/:id/attachments ──────────────────────────
attachmentsRouter.post(
  '/',
  rbacMiddleware(['admin', 'dispatcher', 'technician']),
  (req: Request, res: Response, next) => {
    upload.single('photo')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: { code: 'FILE_TOO_LARGE', message: 'File must be under 10 MB' },
          });
          return;
        }
        res.status(400).json({
          error: { code: 'UPLOAD_ERROR', message: err.message },
        });
        return;
      }
      if (err) {
        res.status(400).json({
          error: { code: 'UPLOAD_ERROR', message: err.message },
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const user = req.user!;
    const jobId = req.params.id as string;

    if (!req.file) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'photo field is required' },
      });
      return;
    }

    // Fetch job and check access
    const job = await getJobByIdCrossPartition(jobId);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }
    if (user.role === 'dispatcher' && job.vendorId !== user.vendorId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }
    if (user.role === 'technician' && job.assignedTo !== user.userId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Build blob name and upload
    const attachmentId = randomUUID();
    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const blobName = `${job.tenantId}/${jobId}/${attachmentId}.${ext}`;

    await uploadBlob(blobName, req.file.buffer, req.file.mimetype);

    // Build attachment metadata
    const attachment: Attachment = {
      id: attachmentId,
      fileName: req.file.originalname || `photo.${ext}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      blobName,
      uploadedBy: user.userId,
      uploadedAt: new Date().toISOString(),
    };

    // Append to job document in Cosmos
    const container = getJobsContainer();
    const attachments = [...(job.attachments ?? []), attachment];
    const updatedAt = new Date().toISOString();

    await container.item(job.id, job.tenantId).patch([
      { op: 'set', path: '/attachments', value: attachments },
      { op: 'set', path: '/updatedAt', value: updatedAt },
    ]);

    // Generate SAS URL for the response
    const sasUrl = await generateSasUrl(blobName);

    res.status(201).json({
      data: { ...attachment, sasUrl },
    });
  },
);

// ── DELETE /api/jobs/:id/attachments/:attachmentId ──────────
attachmentsRouter.delete(
  '/:attachmentId',
  rbacMiddleware(['admin', 'dispatcher', 'technician']),
  async (req: Request, res: Response) => {
    const user = req.user!;
    const jobId = req.params.id as string;
    const attachmentId = req.params.attachmentId as string;

    const job = await getJobByIdCrossPartition(jobId);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    const attachment = job.attachments?.find((a) => a.id === attachmentId);
    if (!attachment) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
      return;
    }

    // Only admin, dispatcher (same vendor), or the uploader can delete
    if (user.role === 'technician' && attachment.uploadedBy !== user.userId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You can only delete your own attachments' },
      });
      return;
    }
    if (user.role === 'dispatcher' && job.vendorId !== user.vendorId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Delete blob from storage
    await deleteBlobByName(attachment.blobName);

    // Remove from job document
    const container = getJobsContainer();
    const attachments = (job.attachments ?? []).filter((a) => a.id !== attachmentId);
    const updatedAt = new Date().toISOString();

    await container.item(job.id, job.tenantId).patch([
      { op: 'set', path: '/attachments', value: attachments },
      { op: 'set', path: '/updatedAt', value: updatedAt },
    ]);

    res.json({ data: { deleted: true } });
  },
);
