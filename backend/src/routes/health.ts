import { Router } from 'express';
import { checkCosmosHealth } from '../services/cosmosDb.js';
import { config } from '../config.js';

/** Health check router — provides GET /health endpoint */
export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const cosmosHealthy = await checkCosmosHealth();

  const response = {
    status: cosmosHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    services: {
      api: 'ok',
      cosmosDb: cosmosHealthy ? 'ok' : 'error: unable to reach Cosmos DB',
    },
    version: '1.0.0',
  };

  const statusCode = cosmosHealthy ? 200 : 503;
  res.status(statusCode).json(response);
});
