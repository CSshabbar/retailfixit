import type { JobDocument } from '../types/job.js';
import { sendToGroup, sendToUser } from './signalr.js';
import { logger } from '../middleware/requestLogger.js';

/** Broadcasts a JobCreated event to vendor + admin groups */
export function broadcastJobCreated(job: JobDocument, triggeredBy: string): void {
  const payload = { job, triggeredBy };
  Promise.allSettled([
    sendToGroup(`vendor-${job.vendorId}`, 'JobCreated', payload),
    sendToGroup('admin', 'JobCreated', payload),
  ]).catch((err) => logger.error({ err }, 'broadcastJobCreated failed'));
}

/** Broadcasts a JobStatusChanged event to vendor + admin groups + assigned user */
export function broadcastJobStatusChanged(
  job: JobDocument,
  previousStatus: string,
  triggeredBy: string,
): void {
  const payload = { job, previousStatus, triggeredBy };
  const promises: Promise<void>[] = [
    sendToGroup(`vendor-${job.vendorId}`, 'JobStatusChanged', payload),
    sendToGroup('admin', 'JobStatusChanged', payload),
  ];
  if (job.assignedTo) {
    promises.push(sendToUser(job.assignedTo, 'JobStatusChanged', payload));
  }
  Promise.allSettled(promises).catch((err) => logger.error({ err }, 'broadcastJobStatusChanged failed'));
}

/** Broadcasts a JobAssigned event to vendor + admin groups + assigned user */
export function broadcastJobAssigned(job: JobDocument, triggeredBy: string): void {
  const payload = { job, triggeredBy };
  const promises: Promise<void>[] = [
    sendToGroup(`vendor-${job.vendorId}`, 'JobAssigned', payload),
    sendToGroup('admin', 'JobAssigned', payload),
  ];
  if (job.assignedTo) {
    promises.push(sendToUser(job.assignedTo, 'JobAssigned', payload));
  }
  Promise.allSettled(promises).catch((err) => logger.error({ err }, 'broadcastJobAssigned failed'));
}

/** Broadcasts a JobDeleted event to vendor + admin groups + assigned user */
export function broadcastJobDeleted(job: JobDocument, triggeredBy: string): void {
  const payload = { job, triggeredBy };
  const promises: Promise<void>[] = [
    sendToGroup(`vendor-${job.vendorId}`, 'JobDeleted', payload),
    sendToGroup('admin', 'JobDeleted', payload),
  ];
  if (job.assignedTo) {
    promises.push(sendToUser(job.assignedTo, 'JobDeleted', payload));
  }
  Promise.allSettled(promises).catch((err) => logger.error({ err }, 'broadcastJobDeleted failed'));
}
