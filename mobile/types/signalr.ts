import type { Job } from './job';

export type SignalREventName = 'JobCreated' | 'JobStatusChanged' | 'JobAssigned' | 'JobDeleted';

export interface JobCreatedEvent {
  job: Job;
  triggeredBy: string;
}

export interface JobStatusChangedEvent {
  job: Job;
  previousStatus: string;
  triggeredBy: string;
}

export interface JobAssignedEvent {
  job: Job;
  triggeredBy: string;
}

export interface JobDeletedEvent {
  job: Job;
  triggeredBy: string;
}

export type SignalREvent = JobCreatedEvent | JobStatusChangedEvent | JobAssignedEvent | JobDeletedEvent;
