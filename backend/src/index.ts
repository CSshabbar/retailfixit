import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config.js';
import { requestLogger, logger } from './middleware/requestLogger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { jobsRouter } from './routes/jobs.js';
import { signalrRouter } from './routes/signalr.js';
import { attachmentsRouter } from './routes/attachments.js';
import { initializeCosmosDb } from './services/cosmosDb.js';
import { seedDemoUsers } from './services/seedUsers.js';
import { seedDemoJobs } from './services/seedJobs.js';

const app = express();

// Middleware (order matters)
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(requestLogger);

// Routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/signalr', signalrRouter);
app.use('/api/jobs/:id/attachments', attachmentsRouter);

// 404 handler for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${_req.method} ${_req.path} not found` },
  });
});

// Global error handler (must be last)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: _req.path, method: _req.method }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.nodeEnv === 'development' ? err.message : 'An unexpected error occurred',
    },
  });
});

/** Starts the server and initializes external service connections */
async function startServer(): Promise<void> {
  try {
    await initializeCosmosDb();
    logger.info('Cosmos DB connected successfully');
    const userIdMap = await seedDemoUsers();
    logger.info('Demo users seeded');
    await seedDemoJobs(userIdMap);
    logger.info('Demo jobs seeded');
  } catch (error) {
    logger.warn({ error }, 'Cosmos DB connection failed at startup — health endpoint will report degraded status');
  }

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });
}

startServer().catch((error) => {
  logger.fatal({ error }, 'Fatal error during server startup');
  process.exit(1);
});
