import { api } from './api';
import type { Job, JobListResponse, JobResponse, CreateJobRequest, JobStatus } from '../types/job';
import type { SyncResponse } from '../types/sync';

/** Fetches paginated job list with optional status filter */
export async function getJobs(
  options: { limit?: number; offset?: number; status?: JobStatus } = {},
): Promise<JobListResponse> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.status) params.set('status', options.status);

  const query = params.toString();
  const path = `/api/jobs${query ? `?${query}` : ''}`;

  const { data } = await api.get<JobListResponse>(path);
  return data;
}

/** Fetches a single job by ID */
export async function getJobById(id: string): Promise<JobResponse> {
  const { data } = await api.get<JobResponse>(`/api/jobs/${id}`);
  return data;
}

/** Creates a new job */
export async function createJob(body: CreateJobRequest): Promise<JobResponse> {
  const { data } = await api.post<JobResponse>('/api/jobs', body as unknown as Record<string, unknown>);
  return data;
}

/** Updates a job's status with eTag for optimistic concurrency */
export async function updateJobStatus(
  id: string,
  status: JobStatus,
  etag: string,
): Promise<JobResponse> {
  const { data } = await api.patch<JobResponse>(`/api/jobs/${id}/status`, {
    status,
    _etag: etag,
  });
  return data;
}

/** Updates editable job fields with eTag for optimistic concurrency */
export async function updateJob(
  id: string,
  fields: {
    title?: string;
    description?: string;
    priority?: string;
    location?: { storeName: string; address: string; city: string; state: string; zipCode: string };
    _etag: string;
  },
): Promise<JobResponse> {
  const { data } = await api.patch<JobResponse>(`/api/jobs/${id}`, fields as unknown as Record<string, unknown>);
  return data;
}

/** Deletes a job (admin only) */
export async function deleteJob(id: string): Promise<void> {
  await api.delete(`/api/jobs/${id}`);
}

/** Assigns a technician to a job */
export async function assignJob(id: string, technicianId: string): Promise<JobResponse> {
  const { data } = await api.post<JobResponse>(`/api/jobs/${id}/assign`, { technicianId });
  return data;
}

/** Delta sync — fetches jobs modified since `since` (null = full sync) */
export async function syncJobs(since: string | null): Promise<SyncResponse> {
  const body: Record<string, unknown> = {};
  if (since) body.since = since;
  const { data } = await api.post<SyncResponse>('/api/jobs/sync', body);
  return data;
}

/** Vendor info returned by the API */
export interface Vendor {
  vendorId: string;
  name: string;
}

/** Fetches unique vendors (admin only) */
export async function getVendors(): Promise<Vendor[]> {
  const { data } = await api.get<{ data: Vendor[] }>('/api/auth/vendors');
  return data.data;
}

/** Technician info returned by the API */
export interface Technician {
  id: string;
  displayName: string;
  email: string;
  vendorId: string;
}

/** Fetches technicians, optionally filtered by vendorId */
export async function getTechnicians(vendorId?: string): Promise<Technician[]> {
  const query = vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : '';
  const { data } = await api.get<{ data: Technician[] }>(`/api/auth/technicians${query}`);
  return data.data;
}
