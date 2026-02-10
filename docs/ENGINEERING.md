# Part 3: Engineering Reasoning

## 1. Autonomy & Risk

**Which actions should never be fully automatic on mobile, and why?**

Several actions in RetailFixIt must require explicit human confirmation, even when the system could theoretically automate them:

**Forced vendor reassignment** should never be automatic. Reassigning a job from one vendor to another has cascading effects — the original vendor loses visibility, the new vendor's dispatchers and technicians gain access, and any in-progress work may be disrupted. Our implementation restricts this to admin-only with explicit PATCH requests. On mobile, the UI intentionally requires the dispatcher to select a technician from a list and confirm, rather than auto-assigning based on proximity or availability algorithms. The reasoning is that dispatchers possess contextual knowledge (technician skill sets, customer preferences, ongoing relationships) that algorithms cannot capture reliably.

**Job cancellation** is restricted to admin and dispatcher roles and is only available when the device is online. Technicians cannot cancel jobs — this prevents a field worker from accidentally or intentionally cancelling work that's already been scheduled and communicated to the customer. The online-only restriction ensures the cancellation is immediately confirmed by the server, preventing a scenario where a locally-cancelled job continues to appear as active for other users.

**Job deletion** is the most destructive action and is restricted to admin-only. It permanently removes the job and all associated attachments from Cosmos DB and Blob Storage. The UI surfaces this as a red "Delete Job" button, clearly communicating the severity. If we were to add bulk operations (delete all jobs for a vendor), these would require a secondary confirmation dialog and should never be triggered by automated rules.

**Data purges and bulk operations** are not implemented in the current system, and deliberately so. Any future implementation of data retention policies or bulk cleanup should require admin confirmation with an explicit count of affected records, a preview of what will be deleted, and ideally a soft-delete grace period before permanent removal.

The general principle: any action that is irreversible, affects multiple users, or has financial/operational consequences beyond the acting user's scope should require explicit human confirmation. Speed of execution matters less than correctness for these operations.

## 2. Sync Safety & Conflict Handling

**How will you detect sync/conflict problems from offline clients? Explain your conflict resolution strategy.**

RetailFixIt uses **optimistic concurrency control via Cosmos DB eTags** as the foundation for conflict detection. Every job document has a server-managed `_etag` field that changes on any write. When a mobile client updates a job status, it sends the last-known `_etag` with the request. If the server's current eTag doesn't match (meaning someone else modified the job since the client last synced), the server returns HTTP 409 Conflict.

**Detection flow in the sync engine:**

1. The client makes an offline status change (e.g., "Start Work" while in a dead zone)
2. The change is stored in the `pending_actions` SQLite table with the job's current eTag
3. When connectivity returns, the sync engine processes the queue FIFO
4. For each `UPDATE_STATUS` action, it sends `PATCH /api/jobs/:id/status { status, _etag }`
5. If the server returns 409, the sync engine marks the local job as `syncStatus: 'conflict'`
6. The action is removed from the queue (to prevent infinite retry of a stale eTag)

**Resolution strategy — user-assisted, not last-writer-wins:**

We rejected last-writer-wins because for job status transitions, silently overwriting is dangerous. Consider: Technician A marks a job "completed" offline while Dispatcher B cancels the same job. Last-writer-wins would depend on who syncs second, which is non-deterministic and could result in a cancelled job appearing as completed (or vice versa).

Instead, the UI surfaces conflicts explicitly:
- A red "Conflict Detected" banner appears on the job detail screen
- Tapping it presents two options: "Use Server Version" (accept what others did) or "Retry My Change" (re-attempt with fresh data)
- "Use Server Version" fetches the latest job state from the API and overwrites the local copy
- "Retry My Change" triggers a fresh sync cycle, which will pull the latest eTag before attempting the update again

**Prevention measures:**
- SignalR real-time events reduce the window for conflicts by keeping clients up-to-date
- The sync engine drains writes before reads, preventing the client from pulling server state that would overwrite queued local changes
- The `skipPending` flag in `upsertJobs()` ensures that delta sync results don't overwrite jobs with pending local actions
- Max retry count (3) prevents indefinite retry loops for persistently conflicting actions

**Monitoring conflicts:** The Activity screen shows pending action count and last sync error, giving technicians visibility into sync health. Future improvements could include server-side conflict metrics (count of 409s per user/vendor) to identify systematic issues.

## 3. Instrumentation & Events

**What event instrumentation is required to keep mobile workflows reliable over time?**

Reliable mobile workflows require instrumentation at three levels: application events, performance metrics, and distributed traces.

**Application Events (structured logs via Pino):**

| Event | When Emitted | Why It Matters |
|-------|-------------|---------------|
| `JobCreated` | New job stored in Cosmos | Tracks job volume, validates dispatch pipeline |
| `JobAssigned` | Technician assigned | Measures assignment latency (created → assigned) |
| `JobStatusChanged` | Any status transition | Core workflow progression; detects stuck jobs |
| `ClientSync` | Mobile sync completes | Tracks sync frequency, payload size, duration |
| `SyncConflict` | 409 detected by sync engine | Early warning for concurrency issues |
| `OverrideEvent` | Dispatcher overrides technician action | Audit trail for disputed decisions |
| `AttachmentUploaded` | Photo successfully stored | Tracks attachment usage and failure rate |
| `SignalRConnect/Disconnect` | Client WebSocket lifecycle | Monitors real-time reliability |
| `AuthLogin/Logout` | Session boundaries | Security auditing, active user tracking |

**Critical Performance Metrics:**

- **API latency (p50, p95, p99) per endpoint** — the most important metric for mobile UX. If `GET /api/jobs` p95 exceeds 500ms, users perceive lag. Pino-HTTP logs request duration on every response.
- **Sync cycle duration** — time from sync start to completion. If this consistently exceeds 5s, the background sync becomes noticeable. Break down into: pending action drain time + delta pull time.
- **SignalR connection uptime** — percentage of time the mobile client maintains a WebSocket connection. Drops below 95% indicate reconnection issues or network instability.
- **Conflict rate** — 409 responses / total PATCH requests. A rate above 5% suggests the sync interval is too wide or multiple users are editing the same jobs frequently.
- **Pending action queue depth** — if this grows over time, actions are failing faster than they drain. Alert when depth exceeds 10 for any user.
- **Cosmos DB RU consumption** — tracks cost and identifies expensive queries. Cross-partition queries (admin job listings) consume more RUs.

**Distributed Traces:** Each API request carries a correlation ID linking mobile → API request log → Cosmos DB query → SignalR broadcast → Blob Storage operation. Currently, Pino-HTTP provides per-request logging with automatic request IDs. For production, Azure Application Insights would add end-to-end distributed tracing with dependency tracking, custom events, and alerting dashboards.

## 4. Failure Modes & Graceful Degradation

**How should the mobile app behave when backend services are unavailable or slow?**

RetailFixIt's offline-first architecture means most failure modes are handled by design — the app is always functional because it reads from SQLite, not from the network.

**When the backend is completely unreachable:**

- The `@react-native-community/netinfo` listener detects loss of connectivity and sets `isOnline: false` in OfflineContext
- The NetworkBanner component turns red, displaying "Offline — using cached data" or "Offline — X changes pending"
- All read operations continue from SQLite with zero degradation
- Write operations (status changes, job creation) are queued in `pending_actions` with optimistic UI updates — the user sees immediate feedback
- The sync engine stops attempting network calls until connectivity returns
- Photo uploads are disabled (too large to queue reliably), and the UI disables the camera button with a tooltip explaining why
- Actions requiring online confirmation (cancel, delete, assign) show disabled buttons with "Requires connection" text

**When the backend is slow (but reachable):**

- API calls have a 10-second timeout (30s for photo uploads)
- If a sync cycle times out, the error is logged and the next cycle retries
- The UI continues to show cached data — slow API responses don't block the user
- The Activity screen shows "Last sync error" to surface persistent issues
- The sync engine uses exponential backoff for failed requests (built into the retry logic)

**When SignalR disconnects:**

- The client has built-in auto-reconnect with exponential backoff: 0s, 2s, 4s, 8s, 16s, 30s
- During disconnection, the polling interval tightens from 30s to 10s to compensate
- The NetworkBanner changes from "Live" (green) to "Online" (no SignalR indicator)
- The Activity screen shows "Real-time: Disconnected"
- No data is lost — the delta sync catches up on any missed events when the next poll runs

**When Cosmos DB is degraded:**

- The `GET /api/health` endpoint checks Cosmos DB connectivity and returns 503 if degraded
- API endpoints that fail due to Cosmos errors return 500 with structured error messages
- The mobile client treats these as transient errors and retries on the next sync cycle
- Read operations fall back to cached SQLite data

**Operator response playbook:**

1. **High conflict rate alert:** Check if multiple dispatchers are editing the same jobs. Consider adding a "locked by" indicator to prevent concurrent edits.
2. **Growing pending queue:** Check backend health. If healthy, investigate individual failing actions (auth expired? invalid state transition?). The `lastError` field on pending_actions records the failure reason.
3. **SignalR connection drops:** Check Azure SignalR Service health in Azure Portal. Verify the negotiate endpoint is returning valid tokens. Check client-side logs for WebSocket errors.
4. **Slow sync cycles:** Profile Cosmos DB RU consumption. Check if cross-partition queries are dominating. Consider adding a composite index on frequently-filtered fields.
