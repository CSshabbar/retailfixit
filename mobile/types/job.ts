/** Valid job statuses in lifecycle order */
export type JobStatus = 'pending' | 'assigned' | 'in-progress' | 'completed' | 'cancelled';

/** Valid job priority levels */
export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Attachment metadata returned by the API */
export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  blobName: string;
  uploadedBy: string;
  uploadedAt: string;
  sasUrl?: string;
}

/** Job as returned by the API */
export interface Job {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  tenantId: string;
  vendorId: string;
  createdBy: string;
  createdByName?: string;
  assignedTo: string | null;
  assignedToName?: string | null;
  location: {
    storeName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  createdAt: string;
  attachments?: Attachment[];
  thumbnailUrl?: string;
  updatedAt: string;
  _etag?: string;
}

/** Response shape for GET /api/jobs */
export interface JobListResponse {
  data: Job[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/** Response shape for single job endpoints */
export interface JobResponse {
  data: Job;
}

/** Request body for POST /api/jobs */
export interface CreateJobRequest {
  title: string;
  description: string;
  priority: JobPriority;
  vendorId: string;
  location: {
    storeName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
}
