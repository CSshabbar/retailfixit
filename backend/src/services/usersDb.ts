import { getUsersContainer } from './cosmosDb.js';
import type { UserDocument } from '../types/auth.js';

/** Lists technicians, optionally filtered by vendorId */
export async function listTechnicians(vendorId?: string | null): Promise<Pick<UserDocument, 'id' | 'displayName' | 'email' | 'vendorId'>[]> {
  const container = getUsersContainer();

  const parameters: { name: string; value: string }[] = [
    { name: '@role', value: 'technician' },
  ];
  let query = "SELECT c.id, c.displayName, c.email, c.vendorId FROM c WHERE c.role = @role";

  if (vendorId) {
    query += " AND c.vendorId = @vendorId";
    parameters.push({ name: '@vendorId', value: vendorId });
  }

  const { resources } = await container.items
    .query<Pick<UserDocument, 'id' | 'displayName' | 'email' | 'vendorId'>>({ query, parameters })
    .fetchAll();

  return resources;
}

/** Finds users by their IDs and returns a map of id → displayName */
export async function getUserDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const container = getUsersContainer();
  const placeholders = userIds.map((_, i) => `@id${i}`).join(', ');
  const parameters = userIds.map((id, i) => ({ name: `@id${i}`, value: id }));

  const { resources } = await container.items
    .query<Pick<UserDocument, 'id' | 'displayName'>>({
      query: `SELECT c.id, c.displayName FROM c WHERE c.id IN (${placeholders})`,
      parameters,
    })
    .fetchAll();

  const map: Record<string, string> = {};
  for (const user of resources) {
    map[user.id] = user.displayName;
  }
  return map;
}

/** Finds a user by email address. Returns null if not found. */
export async function findUserByEmail(email: string): Promise<UserDocument | null> {
  const container = getUsersContainer();

  const { resources } = await container.items
    .query<UserDocument>({
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email.toLowerCase() }],
    })
    .fetchAll();

  return resources[0] ?? null;
}
