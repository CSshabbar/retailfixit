# Part 1: System Design & Architecture

## High-Level Architecture Diagram

![RetailFixIt Architecture](../architecture-diagram.png)

## Data Flow Diagrams

### Authentication Flow

```
Mobile                    Backend                  Cosmos DB
  │                         │                         │
  │  POST /api/auth/login   │                         │
  │  {email, password}      │                         │
  │ ───────────────────────>│                         │
  │                         │  findUserByEmail()      │
  │                         │ ───────────────────────>│
  │                         │  <───── user doc ───────│
  │                         │                         │
  │                         │  bcrypt.compare()       │
  │                         │  jwt.sign(payload)      │
  │                         │                         │
  │  <── { token, user } ──│                         │
  │                         │                         │
  │  Store in SecureStore   │                         │
  │  Set API auth header    │                         │
```

### Offline Sync Flow

```
Mobile (SQLite)          Backend                 Cosmos DB
  │                        │                        │
  │  1. Drain pending_actions queue (writes first)  │
  │                        │                        │
  │  POST /api/jobs        │                        │
  │  {title, desc, ...}    │                        │
  │  ──────────────────── >│                        │
  │                        │  createJob()           │
  │                        │  ─────────────────────>│
  │                        │  <── job doc ──────────│
  │  <── 201 Created ─────│                        │
  │  Cache in SQLite       │                        │
  │  Dequeue action        │                        │
  │                        │                        │
  │  PATCH /api/jobs/:id/status                     │
  │  {status, _etag}       │                        │
  │  ──────────────────── >│                        │
  │                        │  eTag check            │
  │                        │  ─────────────────────>│
  │  <── 200 OK ──────────│  <── updated doc ──────│
  │  Cache in SQLite       │                        │
  │  Dequeue action        │                        │
  │                        │                        │
  │  ── OR on 409 ────────│  (eTag mismatch)       │
  │  Mark job 'conflict'   │                        │
  │  Show conflict UI      │                        │
  │                        │                        │
  │  2. Delta sync (reads after writes)             │
  │                        │                        │
  │  POST /api/jobs/sync   │                        │
  │  {since: timestamp}    │                        │
  │  ──────────────────── >│                        │
  │                        │  WHERE updatedAt >     │
  │                        │    since + RBAC filter  │
  │                        │  ─────────────────────>│
  │                        │  <── job docs[] ───────│
  │  <── {data, syncTs} ──│                        │
  │  Upsert (skip pending) │                        │
  │  Update lastSyncTs     │                        │
```

### Real-Time Event Flow

```
Mobile A          Backend            SignalR Service       Mobile B
(Dispatcher)                                              (Technician)
  │                  │                     │                   │
  │ PATCH status     │                     │                   │
  │ ────────────────>│                     │                   │
  │                  │ Update Cosmos DB    │                   │
  │                  │ ···················>│                   │
  │ <── 200 OK ─────│                     │                   │
  │                  │                     │                   │
  │                  │ REST API broadcast  │                   │
  │                  │ sendToGroup(vendor) │                   │
  │                  │ ───────────────────>│                   │
  │                  │ sendToUser(techId)  │  WSS push         │
  │                  │ ───────────────────>│ ─────────────────>│
  │                  │                     │                   │
  │                  │                     │ JobStatusChanged  │
  │                  │                     │ {jobId, status,   │
  │                  │                     │  updatedAt}       │
  │                  │                     │                   │
  │                  │                     │         Upsert to │
  │                  │                     │         SQLite    │
  │                  │                     │         Refresh UI│
```

### Photo Attachment Flow

```
Mobile                    Backend              Blob Storage    Cosmos DB
  │                         │                      │               │
  │ expo-image-picker       │                      │               │
  │ (camera/gallery)        │                      │               │
  │                         │                      │               │
  │ POST /jobs/:id/attach.  │                      │               │
  │ FormData (multipart)    │                      │               │
  │ ───────────────────────>│                      │               │
  │                         │  multer (in-memory)  │               │
  │                         │  validate MIME/size  │               │
  │                         │                      │               │
  │                         │  uploadBlob()        │               │
  │                         │  ───────────────────>│               │
  │                         │  <── success ────────│               │
  │                         │                      │               │
  │                         │  patch(attachments)  │               │
  │                         │  ────────────────────────────────── >│
  │                         │  <── updated doc ───────────────────│
  │                         │                      │               │
  │                         │  generateSasUrl()    │               │
  │                         │  ───────────────────>│               │
  │                         │  <── SAS URL (1hr) ──│               │
  │                         │                      │               │
  │  <── {attachment+URL} ──│                      │               │
  │  Display in gallery     │                      │               │
```

## Azure Service Choices

**Cosmos DB (NoSQL)** was chosen over Azure SQL for several reasons: the job document model (with embedded attachments array and flexible location fields) maps naturally to JSON documents; the `tenantId` partition key provides built-in vendor data isolation; native eTag support enables optimistic concurrency without application-level version tracking; and sub-10ms point reads ensure the mobile experience feels instant. The tradeoff is higher cost per write and weaker ad-hoc querying compared to SQL, but for a job-management workload that's predominantly read-heavy with known access patterns, this is acceptable.

**Azure SignalR Service (Serverless mode)** was selected over implementing WebSocket handling directly in Express. Serverless mode means the backend uses REST API calls to broadcast events — the SignalR service handles all WebSocket connection management, scaling, and reconnection. This avoids the complexity of maintaining persistent connections on the backend and allows the Express server to remain stateless and horizontally scalable. The tradeoff is a slight increase in broadcast latency (~50-100ms for the REST call) compared to direct WebSocket, but this is imperceptible for job status updates.

**Azure Blob Storage** stores photo attachments separately from Cosmos DB. Embedding binary data in documents would inflate RU costs and hit the 2MB document size limit quickly. Instead, attachment metadata is stored in Cosmos (small JSON), while the actual file lives in Blob Storage. SAS (Shared Access Signature) URLs provide time-limited, read-only access directly from the client, bypassing the backend for photo downloads and reducing server load.

**Express 5 (Node.js)** was chosen as the backend framework for its native async error handling (no need for `express-async-errors` wrappers), mature ecosystem, and team familiarity. TypeScript with strict mode catches type errors at compile time. ESM modules provide modern import/export syntax compatible with the latest Node.js features.

| Service | Resource | Purpose | Why Chosen |
|---------|----------|---------|------------|
| **Cosmos DB** | `retailfixit-cosmos` | Primary database for Jobs & Users | Multi-model NoSQL with native partition support for multi-tenant; eTag for optimistic concurrency; sub-10ms reads at scale; serverless pricing for dev |
| **SignalR Service** | `retailfixit-signalr` | Real-time push notifications | Serverless mode = no WebSocket management on Express; managed WebSocket scaling; group-based routing for vendor/user/admin channels |
| **Blob Storage** | `attachmentsjob` | Photo attachment storage | Cost-effective binary storage; SAS URLs for time-limited direct access; CDN-ready; no database bloat from large files |
| **App Service** | (deployment target) | Host Express backend | Managed Node.js hosting with auto-scale; built-in SSL; deployment slots for zero-downtime updates |

## Mobile Sync & Offline Strategy

### Architecture: SQLite-First

Every screen reads from a local SQLite database first, providing instant display regardless of network state. The sync engine runs in the background, with two distinct phases:

1. **Drain writes (pending_actions queue):** Offline mutations are stored as action records with type (`CREATE_JOB`, `UPDATE_STATUS`) and payload. On sync, these are processed FIFO — writes always execute before reads to prevent stale server data from overwriting the user's intent.

2. **Delta pull (server → local):** After writes drain, `POST /api/jobs/sync { since: lastSyncTimestamp }` fetches only jobs modified since the last sync. The `skipPending` flag prevents server responses from overwriting jobs that have local pending changes.

### Conflict Resolution Strategy

The system uses **optimistic concurrency with user-assisted resolution**:

- Every job status update includes the Cosmos DB `_etag` field
- If another user modified the job concurrently, the server returns 409 Conflict
- The sync engine marks the local job as `syncStatus: 'conflict'`
- The UI shows a red conflict banner with two options:
  - **"Use Server Version"** — fetches the latest version from the API, discards local changes
  - **"Retry My Change"** — re-queues the action with a fresh eTag

This approach avoids silent data loss (unlike last-writer-wins) while remaining simple for field technicians who need quick resolution. Automatic merge was considered but rejected — for status transitions, there's no sensible merge (you can't merge "completed" and "cancelled").

### Sync Scheduling

| Condition | Sync Interval |
|-----------|--------------|
| Offline | No sync (actions queue locally) |
| Online, no SignalR | Every 10 seconds |
| Online, SignalR connected | Every 30 seconds (real-time events fill gaps) |
| Network restored (offline → online) | Immediate sync |
| SignalR event received | Immediate cache update + background full sync |

## Event-Driven Dispatch: End-to-End

### JobCreated → Assignment → Confirmation

```
1. Dispatcher creates job via POST /api/jobs
   └─ Backend stores in Cosmos DB (status: 'pending')
   └─ Broadcasts 'JobCreated' to vendor-{vendorId} + admin groups

2. Dispatcher assigns technician via POST /api/jobs/:id/assign
   └─ Backend updates assignedTo, transitions status to 'assigned'
   └─ Broadcasts 'JobAssigned' to:
      ├─ vendor-{vendorId} group (all dispatchers see it)
      ├─ user-{technicianId} (assigned tech gets notified)
      └─ admin group

3. Technician opens app → SignalR event or sync picks up assignment
   └─ Job appears in their list with "Start Work" button

4. Technician taps "Start Work" → PATCH /api/jobs/:id/status
   └─ Optimistic UI: immediately shows 'in-progress' locally
   └─ Backend validates transition, checks eTag
   └─ Broadcasts 'JobStatusChanged' to vendor + admin + tech

5. Technician completes → PATCH status to 'completed'
   └─ Same broadcast pattern; job moves to completed list
```

### Event Routing via Groups

SignalR groups eliminate unnecessary broadcasts:
- `vendor-{vendorId}`: All dispatchers and technicians in a vendor see relevant job changes
- `user-{userId}`: Personal notifications (e.g., job assigned to you)
- `admin`: Platform operators see everything

The backend uses `Promise.allSettled()` for broadcast calls — if one group delivery fails, others still proceed. Broadcast failures are logged but never block the API response.

## RBAC Model

```
                    ┌──────────────┐
                    │    Admin     │
                    │ (full access)│
                    └──────┬───────┘
                           │ sees all vendors, all jobs
                           │
              ┌────────────┴────────────┐
              │                         │
      ┌───────▼──────┐         ┌───────▼──────┐
      │  Dispatcher   │         │  Dispatcher   │
      │ (vendor-001)  │         │ (vendor-002)  │
      └───────┬───────┘         └───────┬───────┘
              │ manages own              │ manages own
              │ vendor's jobs            │ vendor's jobs
        ┌─────┴─────┐             ┌─────┴─────┐
        │           │             │           │
   ┌────▼────┐ ┌───▼─────┐  ┌───▼─────┐ ┌───▼─────┐
   │  Tech   │ │  Tech   │  │  Tech   │ │  Tech   │
   │(assigned│ │(assigned│  │(assigned│ │(assigned│
   │ jobs)   │ │ jobs)   │  │ jobs)   │ │ jobs)   │
   └─────────┘ └─────────┘  └─────────┘ └─────────┘
```

**Data Partitioning:** Jobs and Users are partitioned by `tenantId` (= `vendorId`), ensuring vendor data isolation at the database level. Admin uses cross-partition queries to aggregate across vendors.

## Automation vs Manual Controls

| Action | Automated? | Rationale |
|--------|-----------|-----------|
| Job creation | Manual (dispatcher) | Requires human judgment on priority, location, description |
| Technician assignment | Manual (dispatcher/admin) | Dispatcher knows technician availability, skills, proximity |
| Status transitions | Manual (technician) | Technician confirms actual work state |
| Conflict detection | Automated | eTag comparison happens server-side |
| Conflict resolution | Manual (user chooses) | Avoids silent data loss; user decides intent |
| Sync scheduling | Automated | Background engine with adaptive intervals |
| SignalR reconnection | Automated | Exponential backoff: 0, 2s, 4s, 8s, 16s, 30s |
| Job cancellation | Manual + RBAC restricted | Only admin/dispatcher; technicians cannot cancel |
| Job deletion | Manual (admin only) | Destructive action requires highest privilege |
| Data purges | Never automated | Not implemented; would require explicit admin action with confirmation |

## Key Tradeoffs

**Speed vs Consistency:** Optimistic UI updates provide instant feedback. The tradeoff is temporary inconsistency — a user might briefly see a status they set locally that later gets rejected (409 conflict). The conflict resolution UI mitigates this by making the inconsistency visible and actionable.

**Simplicity vs Feature-Richness:**
- No Service Bus / Event Grid: Direct REST API broadcasting from Express is simpler and sufficient for ~1,000 vendors. Service Bus would add complexity and cost without clear benefit at this scale.
- No Redis cache: Cosmos DB sub-10ms reads are fast enough. Redis would add an infrastructure component to manage.
- No Azure AD B2C: Custom JWT auth is simpler for a demo and avoids external identity provider configuration. Production would likely migrate to B2C for SSO and MFA.

**Cost vs Performance:**
- Cosmos DB serverless mode (pay-per-request) keeps costs low during development. Production would switch to provisioned throughput with autoscale for predictable costs.
- SAS URLs allow direct blob access from mobile, offloading download traffic from the Express server.
- Delta sync (`since` timestamp) reduces data transfer compared to full refresh — only changed jobs are sent.

**Offline-First vs Real-Time:** Both coexist: SQLite provides offline resilience while SignalR provides real-time push when connected. The sync engine bridges the gap — it processes queued actions when connectivity returns and pulls latest state from the server. This dual approach ensures the app is usable in basements, warehouses, and other connectivity-challenged environments that field technicians operate in.

## Encryption & PII Handling

| Layer | Protection |
|-------|-----------|
| In-transit | HTTPS/TLS for all API calls; WSS for SignalR |
| At-rest | Azure-managed encryption for Cosmos DB & Blob Storage |
| Tokens | SecureStore (Keychain/Keystore) on mobile devices |
| Passwords | bcrypt hashing with salt rounds |
| Attachments | SAS URLs with 1-hour read-only expiry; no permanent public access |
| PII | User email/name stored in Cosmos DB; technicians only see assigned job data |
