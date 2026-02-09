import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../middleware/requestLogger.js';

export type SignalREventName = 'JobCreated' | 'JobStatusChanged' | 'JobAssigned' | 'JobDeleted';

export interface NegotiateResponse {
  url: string;
  accessToken: string;
}

// ── Token generation ────────────────────────────────────────

/** Generates a client access token for Azure SignalR Service */
export function generateNegotiateToken(userId: string): NegotiateResponse {
  const { endpoint, accessKey, hubName } = config.signalr;
  const hubUrl = `${endpoint}/client/?hub=${hubName}`;

  const token = jwt.sign(
    { aud: hubUrl, sub: userId },
    accessKey,
    { expiresIn: '1h' },
  );

  return { url: hubUrl, accessToken: token };
}

// ── REST API broadcasting ───────────────────────────────────

const API_VERSION = '2022-11-01';

/** Generates a server-side REST API token */
function generateRestApiToken(url: string): string {
  return jwt.sign(
    { aud: url },
    config.signalr.accessKey,
    { expiresIn: '5m' },
  );
}

/** Sends a message to all connections in a SignalR group */
export async function sendToGroup(
  group: string,
  eventName: SignalREventName,
  payload: unknown,
): Promise<void> {
  const { endpoint, hubName } = config.signalr;
  const apiUrl = `${endpoint}/api/v1/hubs/${hubName}/groups/${group}/:send`;
  const fullUrl = `${apiUrl}?api-version=${API_VERSION}`;
  const token = generateRestApiToken(apiUrl);

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ target: eventName, arguments: [payload] }),
    });

    if (!response.ok) {
      logger.error({ status: response.status, group, eventName }, 'SignalR sendToGroup failed');
    }
  } catch (error) {
    logger.error({ error, group, eventName }, 'SignalR sendToGroup error');
  }
}

/** Sends a message to a specific user (all their connections) */
export async function sendToUser(
  userId: string,
  eventName: SignalREventName,
  payload: unknown,
): Promise<void> {
  const { endpoint, hubName } = config.signalr;
  const apiUrl = `${endpoint}/api/v1/hubs/${hubName}/users/${userId}/:send`;
  const fullUrl = `${apiUrl}?api-version=${API_VERSION}`;
  const token = generateRestApiToken(apiUrl);

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ target: eventName, arguments: [payload] }),
    });

    if (!response.ok) {
      logger.error({ status: response.status, userId, eventName }, 'SignalR sendToUser failed');
    }
  } catch (error) {
    logger.error({ error, userId, eventName }, 'SignalR sendToUser error');
  }
}

/** Adds a user to a group via the REST API */
export async function addUserToGroup(userId: string, group: string): Promise<void> {
  const { endpoint, hubName } = config.signalr;
  const apiUrl = `${endpoint}/api/v1/hubs/${hubName}/groups/${group}/users/${userId}`;
  const fullUrl = `${apiUrl}?api-version=${API_VERSION}`;
  const token = generateRestApiToken(apiUrl);

  try {
    const response = await fetch(fullUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      logger.error({ status: response.status, userId, group }, 'SignalR addUserToGroup failed');
    }
  } catch (error) {
    logger.error({ error, userId, group }, 'SignalR addUserToGroup error');
  }
}
