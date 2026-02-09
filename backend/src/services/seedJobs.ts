import { randomUUID } from 'node:crypto';
import { getJobsContainer } from './cosmosDb.js';
import { logger } from '../middleware/requestLogger.js';
import type { JobDocument, JobStatus, JobPriority } from '../types/job.js';

interface SeedJob {
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  vendorId: string;
  assignedTo: string | null;
  location: {
    storeName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

const DEMO_JOBS: SeedJob[] = [
  // vendor-001 (Cool Air) — 5 jobs
  {
    title: 'HVAC compressor replacement',
    description: 'Main compressor unit failed in Store #12. Needs full replacement.',
    status: 'pending',
    priority: 'high',
    vendorId: 'vendor-001',
    assignedTo: null,
    location: { storeName: 'MegaMart Store #12', address: '400 Commerce St', city: 'Dallas', state: 'TX', zipCode: '75201' },
  },
  {
    title: 'Thermostat calibration',
    description: 'Thermostat reading 5°F higher than actual. Needs recalibration.',
    status: 'pending',
    priority: 'medium',
    vendorId: 'vendor-001',
    assignedTo: null,
    location: { storeName: 'FreshMart Downtown', address: '220 Main St', city: 'Dallas', state: 'TX', zipCode: '75202' },
  },
  {
    title: 'Air duct cleaning',
    description: 'Annual duct cleaning for produce section cooling system.',
    status: 'assigned',
    priority: 'low',
    vendorId: 'vendor-001',
    assignedTo: 'AHMED_ID',
    location: { storeName: 'MegaMart Store #7', address: '800 Elm St', city: 'Fort Worth', state: 'TX', zipCode: '76102' },
  },
  {
    title: 'Walk-in cooler repair',
    description: 'Walk-in cooler door seal broken, temperature not holding.',
    status: 'in-progress',
    priority: 'urgent',
    vendorId: 'vendor-001',
    assignedTo: 'AHMED_ID',
    location: { storeName: 'QuickStop #3', address: '150 Oak Ave', city: 'Arlington', state: 'TX', zipCode: '76010' },
  },
  {
    title: 'Freezer defrost cycle fix',
    description: 'Auto-defrost cycle not triggering. Ice buildup on evaporator coils.',
    status: 'completed',
    priority: 'high',
    vendorId: 'vendor-001',
    assignedTo: 'AHMED_ID',
    location: { storeName: 'FreshMart Uptown', address: '900 McKinney Ave', city: 'Dallas', state: 'TX', zipCode: '75204' },
  },
  // vendor-002 (Spark Electric) — 3 jobs
  {
    title: 'Emergency lighting replacement',
    description: 'Exit sign and emergency lighting batteries expired. Fire code compliance issue.',
    status: 'pending',
    priority: 'urgent',
    vendorId: 'vendor-002',
    assignedTo: null,
    location: { storeName: 'ValueMart Store #5', address: '600 Lamar St', city: 'Austin', state: 'TX', zipCode: '78701' },
  },
  {
    title: 'POS system wiring',
    description: 'New checkout lane needs dedicated 20A circuit for POS terminals.',
    status: 'assigned',
    priority: 'medium',
    vendorId: 'vendor-002',
    assignedTo: 'SARA_ID',
    location: { storeName: 'ValueMart Store #2', address: '300 Congress Ave', city: 'Austin', state: 'TX', zipCode: '78702' },
  },
  {
    title: 'Panel upgrade inspection',
    description: 'Post-upgrade inspection of 400A panel. Verify all breakers labeled and torqued.',
    status: 'in-progress',
    priority: 'low',
    vendorId: 'vendor-002',
    assignedTo: 'SARA_ID',
    location: { storeName: 'ShopRight Central', address: '1200 S 1st St', city: 'Austin', state: 'TX', zipCode: '78704' },
  },
];

/** Seeds demo jobs into the Jobs container if empty */
export async function seedDemoJobs(userIdMap: Record<string, string>): Promise<void> {
  const container = getJobsContainer();

  // Check if jobs already exist
  const { resources: existing } = await container.items
    .query<number>({ query: 'SELECT VALUE COUNT(1) FROM c' })
    .fetchAll();

  if ((existing[0] ?? 0) > 0) {
    logger.debug('Jobs already seeded, skipping');
    return;
  }

  const now = new Date().toISOString();
  const oneDay = 24 * 60 * 60 * 1000;

  for (let i = 0; i < DEMO_JOBS.length; i++) {
    const seed = DEMO_JOBS[i];

    // Resolve technician placeholder IDs to real user IDs
    let assignedTo = seed.assignedTo;
    if (assignedTo === 'AHMED_ID') assignedTo = userIdMap['ahmed@coolair.com'] ?? null;
    if (assignedTo === 'SARA_ID') assignedTo = userIdMap['sara@sparkelectric.com'] ?? null;

    const createdAt = new Date(Date.now() - (DEMO_JOBS.length - i) * oneDay).toISOString();

    const job: JobDocument = {
      id: randomUUID(),
      title: seed.title,
      description: seed.description,
      status: seed.status,
      priority: seed.priority,
      tenantId: seed.vendorId,
      vendorId: seed.vendorId,
      createdBy: userIdMap['admin@retailfixit.com'] ?? 'system',
      assignedTo,
      location: seed.location,
      createdAt,
      updatedAt: now,
    };

    await container.items.create(job);
  }

  logger.info({ count: DEMO_JOBS.length }, 'Seeded demo jobs');
}
