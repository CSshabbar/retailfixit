/** Valid job statuses in lifecycle order */
export type JobStatus = 'pending' | 'assigned' | 'in-progress' | 'completed' | 'cancelled';

/** Valid job priority levels */
export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Attachment metadata stored on a job document */
export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  blobName: string;
  uploadedBy: string;
  uploadedAt: string;
}

/** Job document as stored in Cosmos DB Jobs container */
export interface JobDocument {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  tenantId: string;
  vendorId: string;
  createdBy: string;
  assignedTo: string | null;
  location: {
    storeName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  createdAt: string;
  attachments?: Attachment[];
  updatedAt: string;
  _etag?: string;
}

/** Valid status transitions: current → allowed next statuses */
export const VALID_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  'pending': ['assigned', 'cancelled'],
  'assigned': ['in-progress', 'cancelled'],
  'in-progress': ['completed', 'cancelled'],
  'completed': [],
  'cancelled': [],
};

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

/** Request body for PATCH /api/jobs/:id/status */
export interface UpdateStatusRequest {
  status: JobStatus;
  _etag: string;
}

/** Request body for POST /api/jobs/:id/assign */
export interface AssignJobRequest {
  technicianId: string;
}
