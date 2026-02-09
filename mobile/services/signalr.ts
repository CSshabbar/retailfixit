import * as signalR from '@microsoft/signalr';
import { api } from './api';
import type { SignalREventName, SignalREvent } from '../types/signalr';

type EventHandler = (event: SignalREvent) => void;

let connection: signalR.HubConnection | null = null;
const eventHandlers = new Map<SignalREventName, Set<EventHandler>>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Connects to Azure SignalR Service via negotiate endpoint */
export async function connectSignalR(): Promise<void> {
  if (connection?.state === signalR.HubConnectionState.Connected) {
    return;
  }

  await startConnection();
}

async function startConnection(): Promise<void> {
  // Get negotiate token from our backend
  const { data } = await api.post<{ url: string; accessToken: string }>(
    '/api/signalr/negotiate',
    {},
  );

  // Disconnect any existing connection
  if (connection) {
    try { await connection.stop(); } catch { /* ignore */ }
    connection = null;
  }

  connection = new signalR.HubConnectionBuilder()
    .withUrl(data.url, {
      accessTokenFactory: () => data.accessToken,
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: (ctx: { previousRetryCount: number }) => {
        const delays = [0, 2000, 4000, 8000, 16000, 30000];
        return delays[Math.min(ctx.previousRetryCount, delays.length - 1)] ?? 30000;
      },
    })
    .configureLogging(signalR.LogLevel.None)
    .build();

  // Register all existing event handlers on the new connection
  for (const [eventName, handlers] of eventHandlers) {
    connection.on(eventName, (payload: SignalREvent) => {
      for (const handler of handlers) {
        handler(payload);
      }
    });
  }

  connection.onclose(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      startConnection().catch(() => {});
    }, 5000);
  });

  await connection.start();
}

/** Subscribes to a SignalR event. Returns an unsubscribe function. */
export function onSignalREvent(eventName: SignalREventName, handler: EventHandler): () => void {
  if (!eventHandlers.has(eventName)) {
    eventHandlers.set(eventName, new Set());
  }
  eventHandlers.get(eventName)!.add(handler);

  // If connection already exists, register immediately
  if (connection) {
    connection.on(eventName, handler as (...args: unknown[]) => void);
  }

  return () => {
    eventHandlers.get(eventName)?.delete(handler);
    if (connection) {
      connection.off(eventName, handler as (...args: unknown[]) => void);
    }
  };
}

/** Disconnects from SignalR and cleans up */
export async function disconnectSignalR(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (connection) {
    try { await connection.stop(); } catch { /* ignore */ }
    connection = null;
  }
  eventHandlers.clear();
}

/** Returns true if currently connected */
export function isSignalRConnected(): boolean {
  return connection?.state === signalR.HubConnectionState.Connected;
}
