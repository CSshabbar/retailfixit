import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { getUsersContainer } from './cosmosDb.js';
import { findUserByEmail } from './usersDb.js';
import { logger } from '../middleware/requestLogger.js';
import type { UserRole } from '../types/auth.js';

interface SeedUser {
  email: string;
  password: string;
  role: UserRole;
  vendorId: string | null;
  tenantId: string;
  displayName: string;
}

const DEMO_USERS: SeedUser[] = [
  {
    email: 'admin@retailfixit.com',
    password: 'admin123',
    role: 'admin',
    vendorId: null,
    tenantId: 'system',
    displayName: 'System Admin',
  },
  {
    email: 'dispatcher@coolair.com',
    password: 'dispatch123',
    role: 'dispatcher',
    vendorId: 'vendor-001',
    tenantId: 'vendor-001',
    displayName: 'Cool Air Dispatcher',
  },
  {
    email: 'ahmed@coolair.com',
    password: 'tech123',
    role: 'technician',
    vendorId: 'vendor-001',
    tenantId: 'vendor-001',
    displayName: 'Ahmed (Technician)',
  },
  {
    email: 'dispatcher@sparkelectric.com',
    password: 'dispatch123',
    role: 'dispatcher',
    vendorId: 'vendor-002',
    tenantId: 'vendor-002',
    displayName: 'Spark Electric Dispatcher',
  },
  {
    email: 'sara@sparkelectric.com',
    password: 'tech123',
    role: 'technician',
    vendorId: 'vendor-002',
    tenantId: 'vendor-002',
    displayName: 'Sara (Technician)',
  },
];

/** Seeds demo users into the Users container if they don't already exist.
 *  Returns a map of email → userId for all demo users. */
export async function seedDemoUsers(): Promise<Record<string, string>> {
  const container = getUsersContainer();
  const now = new Date().toISOString();
  const userIdMap: Record<string, string> = {};

  for (const user of DEMO_USERS) {
    const existing = await findUserByEmail(user.email);
    if (existing) {
      userIdMap[user.email] = existing.id;
      logger.debug({ email: user.email }, 'Seed user already exists, skipping');
      continue;
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(user.password, 10);

    await container.items.create({
      id,
      email: user.email,
      passwordHash,
      role: user.role,
      vendorId: user.vendorId,
      tenantId: user.tenantId,
      displayName: user.displayName,
      createdAt: now,
      updatedAt: now,
    });

    userIdMap[user.email] = id;
    logger.info({ email: user.email, role: user.role }, 'Seeded demo user');
  }

  return userIdMap;
}
