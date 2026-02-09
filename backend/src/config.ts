import 'dotenv/config';

interface CosmosConfig {
  endpoint: string;
  key: string;
  database: string;
  containerJobs: string;
  containerUsers: string;
}

interface JwtConfig {
  secret: string;
  expiresIn: string;
}

interface SignalRConfig {
  endpoint: string;
  accessKey: string;
  hubName: string;
}

interface StorageConfig {
  connectionString: string;
  containerName: string;
}

interface Config {
  port: number;
  nodeEnv: string;
  cosmos: CosmosConfig;
  jwt: JwtConfig;
  signalr: SignalRConfig;
  storage: StorageConfig;
}

/** Validates that all required environment variables are set */
function validateConfig(): void {
  const required = [
    'COSMOS_ENDPOINT',
    'COSMOS_KEY',
    'COSMOS_DATABASE',
    'COSMOS_CONTAINER_JOBS',
    'COSMOS_CONTAINER_USERS',
    'JWT_SECRET',
    'SIGNALR_CONNECTION_STRING',
    'STORAGE_CONNECTION_STRING',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/** Extracts endpoint and accessKey from Azure SignalR connection string */
function parseSignalRConnectionString(cs: string): { endpoint: string; accessKey: string } {
  const endpointMatch = cs.match(/Endpoint=(https?:\/\/[^;]+)/);
  const accessKeyMatch = cs.match(/AccessKey=([^;]+)/);
  if (!endpointMatch || !accessKeyMatch) {
    throw new Error('Invalid SIGNALR_CONNECTION_STRING format — expected Endpoint=...;AccessKey=...');
  }
  return { endpoint: endpointMatch[1], accessKey: accessKeyMatch[1] };
}

validateConfig();

/** Application configuration loaded from environment variables */
export const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
    database: process.env.COSMOS_DATABASE!,
    containerJobs: process.env.COSMOS_CONTAINER_JOBS!,
    containerUsers: process.env.COSMOS_CONTAINER_USERS!,
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  signalr: {
    ...parseSignalRConnectionString(process.env.SIGNALR_CONNECTION_STRING!),
    hubName: 'jobs',
  },
  storage: {
    connectionString: process.env.STORAGE_CONNECTION_STRING!,
    containerName: 'job-attachments',
  },
};
