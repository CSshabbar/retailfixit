import { randomUUID } from 'node:crypto';
import { getJobsContainer } from './cosmosDb.js';
import type { JobDocument, JobStatus, CreateJobRequest } from '../types/job.js';

interface ListJobsOptions {
  role: 'admin' | 'dispatcher' | 'technician';
  vendorId: string | null;
  userId: string;
  limit?: number;
  offset?: number;
  status?: JobStatus;
}

interface ListJobsResult {
  jobs: JobDocument[];
  total: number;
}

/** Lists jobs with pagination and role-based filtering */
export async function listJobs(options: ListJobsOptions): Promise<ListJobsResult> {
  const container = getJobsContainer();
  const limit = Math.min(options.limit ?? 20, 100);
  const offset = options.offset ?? 0;

  const conditions: string[] = [];
  const parameters: { name: string; value: string }[] = [];

  if (options.role === 'technician') {
    conditions.push('c.assignedTo = @userId');
    parameters.push({ name: '@userId', value: options.userId });
  } else if (options.role === 'dispatcher') {
    conditions.push('c.vendorId = @vendorId');
    parameters.push({ name: '@vendorId', value: options.vendorId! });
  }

  if (options.status) {
    conditions.push('c.status = @status');
    parameters.push({ name: '@status', value: options.status });
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const { resources: countResult } = await container.items
    .query<number>({ query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`, parameters })
    .fetchAll();
  const total = countResult[0] ?? 0;

  // Data query with pagination
  const { resources: jobs } = await container.items
    .query<JobDocument>({
      query: `SELECT * FROM c ${whereClause} ORDER BY c.createdAt DESC OFFSET ${offset} LIMIT ${limit}`,
      parameters,
    })
    .fetchAll();

  return { jobs, total };
}

/** Retrieves a single job by id using a cross-partition query */
export async function getJobByIdCrossPartition(id: string): Promise<JobDocument | null> {
  const container = getJobsContainer();
  const { resources } = await container.items
    .query<JobDocument>({
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    })
    .fetchAll();

  return resources[0] ?? null;
}

/** Creates a new job document */
export async function createJob(data: CreateJobRequest, createdBy: string): Promise<JobDocument> {
  const container = getJobsContainer();
  const now = new Date().toISOString();

  const job: JobDocument = {
    id: randomUUID(),
    title: data.title,
    description: data.description,
    status: 'pending',
    priority: data.priority,
    tenantId: data.vendorId,
    vendorId: data.vendorId,
    createdBy,
    assignedTo: null,
    location: data.location,
    createdAt: now,
    updatedAt: now,
  };

  const { resource } = await container.items.create(job);
  return resource!;
}

/** Updates a job's status with eTag-based optimistic concurrency */
export async function updateJobStatus(
  id: string,
  tenantId: string,
  newStatus: JobStatus,
  etag: string,
): Promise<JobDocument> {
  const container = getJobsContainer();

  const { resource: existing } = await container.item(id, tenantId).read<JobDocument>();
  if (!existing) {
    throw Object.assign(new Error('Job not found'), { code: 404 });
  }

  existing.status = newStatus;
  existing.updatedAt = new Date().toISOString();

  const { resource } = await container.item(id, tenantId).replace(existing, {
    accessCondition: { type: 'IfMatch', condition: etag },
  });

  return resource!;
}

interface GetJobsSinceOptions {
  since: string | null;
  role: 'admin' | 'dispatcher' | 'technician';
  vendorId: string | null;
  userId: string;
}

/** Returns jobs modified since a given timestamp, respecting RBAC */
export async function getJobsSince(options: GetJobsSinceOptions): Promise<JobDocument[]> {
  const container = getJobsContainer();

  const conditions: string[] = [];
  const parameters: { name: string; value: string }[] = [];

  if (options.since) {
    conditions.push('c.updatedAt > @since');
    parameters.push({ name: '@since', value: options.since });
  }

  if (options.role === 'technician') {
    conditions.push('c.assignedTo = @userId');
    parameters.push({ name: '@userId', value: options.userId });
  } else if (options.role === 'dispatcher') {
    conditions.push('c.vendorId = @vendorId');
    parameters.push({ name: '@vendorId', value: options.vendorId! });
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { resources: jobs } = await container.items
    .query<JobDocument>({
      query: `SELECT * FROM c ${whereClause} ORDER BY c.updatedAt DESC`,
      parameters,
    })
    .fetchAll();

  return jobs;
}

/** Updates editable job fields with eTag-based optimistic concurrency */
export async function updateJobFields(
  id: string,
  tenantId: string,
  fields: {
    title?: string;
    description?: string;
    priority?: string;
    location?: { storeName: string; address: string; city: string; state: string; zipCode: string };
  },
  etag: string,
): Promise<JobDocument> {
  const container = getJobsContainer();

  const { resource: existing } = await container.item(id, tenantId).read<JobDocument>();
  if (!existing) {
    throw Object.assign(new Error('Job not found'), { code: 404 });
  }

  if (fields.title !== undefined) existing.title = fields.title;
  if (fields.description !== undefined) existing.description = fields.description;
  if (fields.priority !== undefined) existing.priority = fields.priority as JobDocument['priority'];
  if (fields.location !== undefined) existing.location = fields.location;
  existing.updatedAt = new Date().toISOString();

  const { resource } = await container.item(id, tenantId).replace(existing, {
    accessCondition: { type: 'IfMatch', condition: etag },
  });

  return resource!;
}

/** Deletes a job document from Cosmos DB */
export async function deleteJob(id: string, tenantId: string): Promise<void> {
  const container = getJobsContainer();
  await container.item(id, tenantId).delete();
}

/** Assigns a technician to a job. Auto-transitions pending → assigned. */
export async function assignJob(
  id: string,
  tenantId: string,
  technicianId: string,
): Promise<JobDocument> {
  const container = getJobsContainer();

  const { resource: existing } = await container.item(id, tenantId).read<JobDocument>();
  if (!existing) {
    throw Object.assign(new Error('Job not found'), { code: 404 });
  }

  existing.assignedTo = technicianId;
  if (existing.status === 'pending') {
    existing.status = 'assigned';
  }
  existing.updatedAt = new Date().toISOString();

  const { resource } = await container.item(id, tenantId).replace(existing);
  return resource!;
}
