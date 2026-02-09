import { CosmosClient, Database, Container } from '@azure/cosmos';
import { config } from '../config.js';

let database: Database;
let jobsContainer: Container;
let usersContainer: Container;
let initialized = false;

/** Initializes the Cosmos DB client, creates database/container if needed, and verifies connectivity */
export async function initializeCosmosDb(): Promise<void> {
  const client = new CosmosClient({
    endpoint: config.cosmos.endpoint,
    key: config.cosmos.key,
  });

  // Create database if it doesn't exist
  const { database: db } = await client.databases.createIfNotExists({
    id: config.cosmos.database,
  });
  database = db;

  // Create container if it doesn't exist
  const { container } = await database.containers.createIfNotExists({
    id: config.cosmos.containerJobs,
    partitionKey: { paths: ['/tenantId'] },
  });
  jobsContainer = container;

  // Create Users container if it doesn't exist
  const { container: users } = await database.containers.createIfNotExists({
    id: config.cosmos.containerUsers,
    partitionKey: { paths: ['/tenantId'] },
  });
  usersContainer = users;

  // Verify connectivity
  await database.read();
  initialized = true;
}

/** Returns the Jobs container reference. Throws if not initialized. */
export function getJobsContainer(): Container {
  if (!jobsContainer) {
    throw new Error('Cosmos DB not initialized. Call initializeCosmosDb() first.');
  }
  return jobsContainer;
}

/** Returns the Users container reference. Throws if not initialized. */
export function getUsersContainer(): Container {
  if (!usersContainer) {
    throw new Error('Cosmos DB not initialized. Call initializeCosmosDb() first.');
  }
  return usersContainer;
}

/** Checks if Cosmos DB is reachable. Returns true if healthy, false otherwise. */
export async function checkCosmosHealth(): Promise<boolean> {
  if (!initialized) {
    return false;
  }
  try {
    await database.read();
    return true;
  } catch {
    return false;
  }
}
