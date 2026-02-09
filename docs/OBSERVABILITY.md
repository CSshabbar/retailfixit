# RetailFixIt — Observability & Instrumentation Plan

## Overview

This document defines the observability strategy for RetailFixIt, covering structured logging, distributed tracing, key metrics, and alerting thresholds. The goal is fast triage of production issues — particularly latency spikes and sync failures that directly impact mobile UX.

## Current Implementation

### Structured Logging (Pino)

The backend uses **Pino** for structured JSON logging and **Pino-HTTP** for automatic request/response logging.

**What's logged today:**
- Every HTTP request: method, URL, status code, response time, user agent
- Authentication events: login success/failure, token validation errors
- Job lifecycle events: created, assigned, status changed, deleted
- Sync requests: timestamp parameter, number of jobs returned
- SignalR broadcasts: target group/user, event type, success/failure
- Attachment operations: upload size/type, blob path, delete operations
- Cosmos DB errors: connection failures, RU consumption warnings
- Global error handler: unhandled exceptions with stack traces

**Log format:**
```json
{
  "level": 30,
  "time": 1707480000000,
  "pid": 12345,
  "hostname": "retailfixit-api",
  "req": { "id": "req-abc-123", "method": "PATCH", "url": "/api/jobs/abc/status" },
  "res": { "statusCode": 200 },
  "responseTime": 45,
  "msg": "request completed"
}
```

## Proposed Production Instrumentation

### Azure Application Insights Integration

For production, integrate with Azure Application Insights to add:

1. **Automatic dependency tracking** — traces from Express → Cosmos DB, Blob Storage, SignalR
2. **Custom events** — application-level events beyond HTTP requests
3. **Live metrics stream** — real-time view of request rates, failures, dependencies
4. **Application map** — visual dependency graph between services

**Integration approach:**
```typescript
// Add to backend startup (src/index.ts)
import { setup } from 'applicationinsights';
setup(process.env.APPINSIGHTS_CONNECTION_STRING)
  .setAutoCollectRequests(true)
  .setAutoCollectDependencies(true)
  .setAutoCollectExceptions(true)
  .start();
```

### Distributed Tracing

**Trace propagation model:**

```
Mobile Client                    Express Backend              Azure Services
┌──────────────┐                ┌──────────────┐            ┌──────────────┐
│ Generate      │    HTTP        │ Extract       │   SDK      │ Cosmos DB    │
│ x-request-id ────────────────> x-request-id  ──────────── > query trace  │
│              │                │ Log with      │            │              │
│ Log client   │                │ correlation   │   REST     │ Blob Storage │
│ timing       │                │ ID            ──────────── > op trace    │
│              │                │               │            │              │
│              │                │               │   REST     │ SignalR      │
│              │                │               ──────────── > broadcast   │
└──────────────┘                └──────────────┘            └──────────────┘
```

**Correlation ID flow:**
1. Mobile client generates a UUID for each API call (or sync cycle)
2. Sent as `x-request-id` header
3. Backend logs all operations for that request with the same ID
4. Enables end-to-end trace: "This sync took 3s — 2.5s was Cosmos query, 0.3s was JSON serialization, 0.2s was network"

### Key Metrics Dashboard

#### API Performance Metrics

| Metric | Calculation | Target | Alert Threshold |
|--------|------------|--------|-----------------|
| Request latency (p50) | Pino-HTTP responseTime | < 100ms | > 200ms for 5 min |
| Request latency (p95) | Pino-HTTP responseTime | < 300ms | > 500ms for 5 min |
| Request latency (p99) | Pino-HTTP responseTime | < 1000ms | > 2000ms for 5 min |
| Error rate (5xx) | 5xx responses / total | < 0.1% | > 1% for 5 min |
| Error rate (4xx) | 4xx responses / total | < 5% | > 15% for 5 min |
| Throughput | Requests / second | Baseline dependent | > 3x baseline (DDoS?) |

#### Sync-Specific Metrics

| Metric | Source | Target | Alert Threshold |
|--------|--------|--------|-----------------|
| Sync cycle duration | POST /api/jobs/sync responseTime | < 1s | > 3s for 10 min |
| Delta payload size | Response content-length | < 50KB typical | > 500KB (indicates stale sync) |
| Conflict rate | 409 responses / PATCH requests | < 2% | > 5% for 15 min |
| Pending queue depth (per user) | Client-reported or inferred | < 5 | > 10 for any user |

#### SignalR Metrics

| Metric | Source | Target | Alert Threshold |
|--------|--------|--------|-----------------|
| Connected clients | SignalR Service metrics | Baseline dependent | < 50% of expected users |
| Broadcast latency | Time from REST call to ACK | < 200ms | > 1s for 5 min |
| Broadcast failure rate | Failed REST calls / total | < 0.1% | > 1% for 5 min |
| Reconnection rate | onreconnecting events / hour | < 5/user/hour | > 20/user/hour |

#### Infrastructure Metrics

| Metric | Source | Target | Alert Threshold |
|--------|--------|--------|-----------------|
| Cosmos DB RU consumption | Azure Portal / SDK | < 80% of provisioned | > 90% for 10 min |
| Cosmos DB latency (p99) | Azure Portal | < 10ms (point reads) | > 50ms for 5 min |
| Blob Storage availability | Azure Portal | 99.9% | < 99.5% |
| App Service CPU | Azure Portal | < 70% | > 85% for 10 min |
| App Service memory | Azure Portal | < 80% | > 90% for 5 min |

### Custom Events to Emit

Beyond HTTP request logs, emit structured events for business logic:

```typescript
// Job lifecycle events
logger.info({ event: 'job.created', jobId, vendorId, priority, createdBy });
logger.info({ event: 'job.assigned', jobId, technicianId, assignedBy });
logger.info({ event: 'job.status_changed', jobId, from: oldStatus, to: newStatus, changedBy });
logger.info({ event: 'job.deleted', jobId, deletedBy });

// Sync events
logger.info({ event: 'sync.request', userId, since, role });
logger.info({ event: 'sync.response', userId, jobCount, durationMs });
logger.info({ event: 'sync.conflict', jobId, userId, attemptedStatus });

// Auth events
logger.info({ event: 'auth.login', userId, role, vendorId });
logger.warn({ event: 'auth.failed', email, reason: 'invalid_password' });

// SignalR events
logger.info({ event: 'signalr.negotiate', userId });
logger.warn({ event: 'signalr.broadcast_failed', group, eventType, error });

// Attachment events
logger.info({ event: 'attachment.uploaded', jobId, size, mimeType, uploadedBy });
logger.info({ event: 'attachment.deleted', jobId, attachmentId, deletedBy });
```

### Alerting Rules

**Critical (PagerDuty / immediate response):**
- API error rate (5xx) > 5% for 3 minutes
- Cosmos DB unreachable (health check returns 503)
- Zero SignalR connections for 10 minutes during business hours

**Warning (Slack / next-business-day):**
- API p95 latency > 500ms for 15 minutes
- Conflict rate > 5% for 30 minutes
- SignalR broadcast failure rate > 1% for 30 minutes
- Cosmos DB RU consumption > 80% of provisioned for 1 hour

**Informational (dashboard only):**
- Daily active users count
- Jobs created/completed per day
- Average sync cycle duration trend
- Attachment storage growth rate

### Mobile Client Instrumentation (Future)

For production, add client-side telemetry:

- **Screen render time:** Measure time from navigation to content visible
- **Sync cycle timing:** Record duration of each sync (drain + pull phases)
- **Offline duration:** Track how long users spend offline per session
- **Conflict resolution choice:** Track which option users choose (server vs retry)
- **API call timing:** Record client-perceived latency for each endpoint
- **Crash reporting:** Integrate with Sentry or App Insights for crash analytics

Report these as custom events to Application Insights or a dedicated analytics service, respecting user privacy (no PII in telemetry).
