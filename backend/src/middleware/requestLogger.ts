import pino from 'pino';
import { pinoHttp } from 'pino-http';

/** Application logger instance */
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

/** HTTP request logging middleware using pino-http */
export const requestLogger = pinoHttp({ logger });
