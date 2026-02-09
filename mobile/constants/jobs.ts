import type { JobStatus, JobPriority } from '../types/job';

/** Status display configuration */
export const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; backgroundColor: string; accentColor: string }> = {
  'pending':      { label: 'Pending',     color: '#8B7355', backgroundColor: '#F5F0E6', accentColor: '#C9A96E' },
  'assigned':     { label: 'Assigned',    color: '#4A6741', backgroundColor: '#E6EDE4', accentColor: '#6B8F5E' },
  'in-progress':  { label: 'In Progress', color: '#7B5B3A', backgroundColor: '#F0E8DE', accentColor: '#A67B4B' },
  'completed':    { label: 'Completed',   color: '#3D6B4F', backgroundColor: '#E0EDDF', accentColor: '#4A7C59' },
  'cancelled':    { label: 'Cancelled',  color: '#8B3A2A', backgroundColor: '#FDEAE6', accentColor: '#C4432B' },
};

/** Priority display configuration */
export const PRIORITY_CONFIG: Record<JobPriority, { label: string; color: string; backgroundColor: string }> = {
  'low':    { label: 'Low',    color: '#6B6B60', backgroundColor: '#F0EFE9' },
  'medium': { label: 'Medium', color: '#8B7355', backgroundColor: '#F5F0E6' },
  'high':   { label: 'High',   color: '#8B4513', backgroundColor: '#FAE8DC' },
  'urgent': { label: 'Urgent', color: '#FFFFFF', backgroundColor: '#C4432B' },
};

/** Valid next status for each status (mirrors backend) */
export const NEXT_STATUS: Record<JobStatus, JobStatus | null> = {
  'pending': 'assigned',
  'assigned': 'in-progress',
  'in-progress': 'completed',
  'completed': null,
  'cancelled': null,
};

/** Button labels for status transitions */
export const STATUS_ACTION_LABELS: Record<JobStatus, string> = {
  'pending': 'Mark Assigned',
  'assigned': 'Start Work',
  'in-progress': 'Mark Complete',
  'completed': '',
  'cancelled': '',
};

/** Filter options for the status filter bar */
export const STATUS_FILTERS: Array<{ key: JobStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];
