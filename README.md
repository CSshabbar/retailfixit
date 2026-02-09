# RetailFixIt

Mobile-first retail repair management platform built with React Native (Expo) and Node.js (Express), backed by Azure cloud services.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Part 1: System Design & Architecture](#part-1-system-design--architecture)
  - [High-Level Architecture Diagram](#high-level-architecture-diagram)
  - [Data Flow Diagrams](#data-flow-diagrams)
  - [Azure Service Choices](#azure-service-choices)
  - [Mobile Sync & Offline Strategy](#mobile-sync--offline-strategy)
  - [Event-Driven Dispatch: End-to-End](#event-driven-dispatch-end-to-end)
  - [RBAC Model](#rbac-model)
  - [Automation vs Manual Controls](#automation-vs-manual-controls)
  - [Key Tradeoffs](#key-tradeoffs)
  - [Encryption & PII Handling](#encryption--pii-handling)
- [Part 2: Hands-On Implementation](#part-2-hands-on-implementation)
  - [Project Structure](#project-structure)
  - [API Endpoints](#api-endpoints)
  - [Demo Walkthrough & Example Payloads](#demo-walkthrough--example-payloads)
  - [Testing & Verification](#testing--verification)
  - [Performance Notes](#performance-notes)
  - [Observability & Instrumentation Plan](#observability--instrumentation-plan)
  - [Deployment Guide](#deployment-guide)
- [Part 3: Engineering Reasoning](#part-3-engineering-reasoning)
  - [1. Autonomy & Risk](#1-autonomy--risk)
  - [2. Sync Safety & Conflict Handling](#2-sync-safety--conflict-handling)
  - [3. Instrumentation & Events](#3-instrumentation--events)
  - [4. Failure Modes & Graceful Degradation](#4-failure-modes--graceful-degradation)

---

## Overview

RetailFixIt operates a multi-portal platform that coordinates service jobs between customers and ~1,000 vendors. The system provides a mobile-first experience where repair technicians and dispatchers use native mobile apps, with full offline support for field workers with intermittent connectivity.

**Key features:**
- Job creation, assignment, and status tracking with optimistic UI
- Role-based access control (admin, dispatcher, technician)
- Offline-first architecture with automatic sync and conflict resolution
- Real-time updates via Azure SignalR Service
- Photo attachments with Azure Blob Storage
- Delta sync protocol for minimal data transfer

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native, Expo SDK 54, expo-router v6 |
| Backend | Express 5, TypeScript, Pino logging |
| Database | Azure Cosmos DB (NoSQL, Serverless) |
| Auth | JWT + bcrypt |
| Real-time | Azure SignalR Service (Serverless mode) |
| Storage | Azure Blob Storage |
| Offline | expo-sqlite, @react-native-community/netinfo |

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env   # configure Azure credentials
npm run dev             # starts on http://localhost:3000
```

### Mobile

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start          # scan QR with Expo Go
```

Update `API_BASE_URL` in `mobile/services/api.ts` to point to your backend.

### Demo Credentials

| Role | Email | Password | Vendor |
|------|-------|----------|--------|
| Admin | admin@retailfixit.com | admin123 | — (sees all) |
| Dispatcher | dispatcher@coolair.com | dispatch123 | Cool Air (vendor-001) |
| Technician | ahmed@coolair.com | tech123 | Cool Air (vendor-001) |
| Dispatcher | dispatcher@sparkelectric.com | dispatch123 | Spark Electric (vendor-002) |
| Technician | sara@sparkelectric.com | tech123 | Spark Electric (vendor-002) |

---

# Part 1: System Design & Architecture

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENT                                │
│                   React Native (Expo SDK 54)                        │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Job List │  │Job Detail│  │Create Job│  │ Activity/Profile │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │              │                  │             │
│  ┌────┴──────────────┴──────────────┴──────────────────┴─────────┐  │
│  │                    expo-router v6 (Tabs + Stacks)             │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
│                             │                                       │
│  ┌──────────────────────────┴────────────────────────────────────┐  │
│  │                      AuthContext + OfflineContext              │  │
│  │              (SecureStore tokens, network state)               │  │
│  └────────┬──────────────┬──────────────────┬────────────────────┘  │
│           │              │                  │                       │
│  ┌────────▼──────┐ ┌────▼───────┐  ┌──────▼──────────────┐        │
│  │  SQLite DB    │ │ Sync Engine│  │  SignalR Client      │        │
│  │ (expo-sqlite) │ │ + Action   │  │  (@microsoft/signalr)│        │
│  │               │ │   Queue    │  │  WebSocket transport │        │
│  │ - jobs table  │ │            │  │  Auto-reconnect      │        │
│  │ - pending_    │ │ - Delta    │  └──────────┬───────────┘        │
│  │   actions     │ │   sync     │             │                    │
│  │ - sync_meta   │ │ - Conflict │             │                    │
│  └───────────────┘ │   detect   │             │                    │
│                    └──────┬─────┘             │                    │
└───────────────────────────┼───────────────────┼────────────────────┘
                            │ HTTPS             │ WSS
                            │ REST API          │ WebSocket
                            ▼                   ▼
┌───────────────────────────────────────────────────────────────────┐
│                     AZURE CLOUD SERVICES                          │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Express 5 Backend (Node.js 18+)               │   │
│  │                    TypeScript + ESM                         │   │
│  │                                                            │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌─────────────┐  │   │
│  │  │ Helmet  │  │   CORS   │  │  Gzip  │  │ Pino Logger │  │   │
│  │  │Security │  │          │  │Compress│  │ (Structured)│  │   │
│  │  └────┬────┘  └────┬─────┘  └───┬────┘  └──────┬──────┘  │   │
│  │       └────────────┬┘            │              │          │   │
│  │                    ▼             │              │          │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │                 JWT Auth Middleware                  │  │   │
│  │  │          + RBAC (admin/dispatcher/technician)        │  │   │
│  │  └──────────────────────┬──────────────────────────────┘  │   │
│  │                         │                                  │   │
│  │  ┌──────────┬───────────┼────────────┬─────────────────┐  │   │
│  │  │          │           │            │                 │  │   │
│  │  ▼          ▼           ▼            ▼                 ▼  │   │
│  │ /api/    /api/auth   /api/jobs    /api/jobs/:id    /api/  │   │
│  │ health   /login      (CRUD+Sync)  /attachments   signalr │   │
│  │          /technicians              (Upload/Del)  /negot.  │   │
│  └────────┬───────────────┬────────────────┬─────────────────┘   │
│           │               │                │                      │
│           ▼               ▼                ▼                      │
│  ┌────────────────┐ ┌──────────────┐ ┌───────────────────┐       │
│  │  Azure Cosmos  │ │ Azure Blob   │ │  Azure SignalR    │       │
│  │     DB         │ │   Storage    │ │    Service        │       │
│  │                │ │              │ │  (Serverless)     │       │
│  │ DB: RetailFix- │ │ Account:     │ │                   │       │
│  │   ItDB         │ │ attachments- │ │ Hub: retailfixit  │       │
│  │                │ │ job          │ │                   │       │
│  │ Containers:    │ │              │ │ Groups:           │       │
│  │ ├─ Jobs        │ │ Container:   │ │ ├─ vendor-{id}   │       │
│  │ │  /tenantId   │ │ job-         │ │ ├─ user-{id}     │       │
│  │ └─ Users       │ │ attachments  │ │ └─ admin         │       │
│  │    /tenantId   │ │              │ │                   │       │
│  │                │ │ Blob path:   │ │ Events:           │       │
│  │ Features:      │ │ {tenant}/    │ │ ├─ JobCreated     │       │
│  │ ├─ eTag for    │ │ {job}/       │ │ ├─ JobAssigned    │       │
│  │ │  optimistic  │ │ {attach}.ext │ │ ├─ StatusChanged  │       │
│  │ │  concurrency │ │              │ │ └─ JobDeleted     │       │
│  │ ├─ Cross-      │ │ SAS URLs:    │ │                   │       │
│  │ │  partition   │ │ 1hr read-    │ │ REST API v2022-   │       │
│  │ │  queries     │ │ only expiry  │ │ 11-01 broadcast   │       │
│  │ └─ Patch ops   │ │              │ │                   │       │
│  │    for arrays  │ │              │ │                   │       │
│  └────────────────┘ └──────────────┘ └───────────────────┘       │
└───────────────────────────────────────────────────────────────────┘
```

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

---

# Part 2: Hands-On Implementation

## Project Structure

```
retailfixit/
├── backend/                        # Express + TypeScript REST API
│   ├── src/
│   │   ├── config.ts               # Environment vars + validation
│   │   ├── index.ts                # Express app setup + startup
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT verification
│   │   │   ├── rbac.ts             # Role-based access control
│   │   │   └── requestLogger.ts    # Pino HTTP logging
│   │   ├── routes/
│   │   │   ├── health.ts           # Health check
│   │   │   ├── auth.ts             # Login + technician listing
│   │   │   ├── jobs.ts             # Jobs CRUD + sync
│   │   │   ├── attachments.ts      # Photo upload/delete
│   │   │   └── signalr.ts          # SignalR negotiate
│   │   ├── services/
│   │   │   ├── cosmosDb.ts         # Cosmos DB client
│   │   │   ├── jobsDb.ts           # Job document operations
│   │   │   ├── usersDb.ts          # User document operations
│   │   │   ├── blobStorage.ts      # Azure Blob operations
│   │   │   ├── signalrBroadcast.ts # SignalR REST broadcaster
│   │   │   ├── seedUsers.ts        # Demo user seeding
│   │   │   └── seedJobs.ts         # Demo job seeding
│   │   └── types/
│   │       ├── auth.ts             # JWT payload types
│   │       └── job.ts              # Job + Attachment types
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── mobile/                         # React Native Expo app
    ├── app/
    │   ├── _layout.tsx             # Root (ErrorBoundary → Auth → Offline)
    │   ├── index.tsx               # Root redirect
    │   ├── (auth)/
    │   │   └── login.tsx           # Login screen
    │   └── (app)/
    │       ├── _layout.tsx         # Tab navigator
    │       ├── activity.tsx        # Sync status dashboard
    │       ├── profile.tsx         # User profile + logout
    │       └── (jobs)/
    │           ├── index.tsx       # Job list + filters
    │           ├── [id].tsx        # Job detail + actions
    │           └── create.tsx      # Create job form
    ├── components/
    │   ├── JobCard.tsx             # Job list item
    │   ├── StatusBadge.tsx         # Status display
    │   ├── PriorityBadge.tsx       # Priority display
    │   ├── StatusFilterBar.tsx     # Filter chips
    │   ├── NetworkBanner.tsx       # Connection status
    │   ├── PhotoSection.tsx        # Photo gallery + upload
    │   ├── ConflictAlert.ts        # Conflict resolution dialog
    │   └── ErrorBoundary.tsx       # Error catch
    ├── contexts/
    │   ├── AuthContext.tsx          # Auth state + SecureStore
    │   └── OfflineContext.tsx       # Network + sync + SignalR
    ├── services/
    │   ├── api.ts                  # HTTP client + ApiError
    │   ├── auth.ts                 # Login + token management
    │   ├── jobs.ts                 # Job API calls
    │   ├── localDb.ts              # SQLite schema + operations
    │   ├── actionQueue.ts          # Pending actions CRUD
    │   ├── syncEngine.ts           # Sync orchestrator
    │   └── signalr.ts              # SignalR client
    ├── hooks/
    │   └── useJobs.ts              # Cache-first job loading
    └── types/
        ├── auth.ts, job.ts, api.ts, sync.ts, signalr.ts
```

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (Cosmos DB connectivity) |

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with email/password, returns JWT |
| GET | `/api/auth/technicians` | List technicians (admin/dispatcher) |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List jobs (paginated, filtered by role) |
| GET | `/api/jobs/:id` | Get job by ID (with SAS URLs) |
| POST | `/api/jobs` | Create a new job |
| PATCH | `/api/jobs/:id/status` | Update status (with eTag) |
| POST | `/api/jobs/:id/assign` | Assign technician |
| DELETE | `/api/jobs/:id` | Delete job (admin only) |
| POST | `/api/jobs/sync` | Delta sync (jobs modified since timestamp) |

### Attachments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs/:id/attachments` | Upload photo (multipart, 10MB, JPEG/PNG) |
| DELETE | `/api/jobs/:id/attachments/:attachmentId` | Delete attachment |

### SignalR
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signalr/negotiate` | Get SignalR connection token |

## Demo Walkthrough & Example Payloads

### Step 1: Health Check

```bash
curl -s http://localhost:3000/api/health | jq
```
```json
{ "status": "ok", "timestamp": "2026-02-09T12:00:00.000Z", "services": { "cosmosDb": "connected" } }
```

### Step 2: Login

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@retailfixit.com", "password": "admin123"}' | jq
```
```json
{ "token": "eyJhbGciOiJIUzI1NiIs...", "user": { "id": "user-admin-001", "email": "admin@retailfixit.com", "role": "admin", "displayName": "Admin User" } }
```

### Step 3: List Jobs

```bash
TOKEN="<paste-token>"
curl -s http://localhost:3000/api/jobs -H "Authorization: Bearer $TOKEN" | jq
```
```json
{ "data": [{ "id": "job-001", "title": "HVAC Unit Replacement", "status": "pending", "priority": "high", "vendorId": "vendor-001", "location": { "storeName": "MegaMart Store #42", "address": "123 Main St", "city": "Houston", "state": "TX", "zipCode": "77001" } }], "total": 8, "limit": 25, "offset": 0 }
```

### Step 4: Create a Job

```bash
curl -s -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Emergency Cooler Repair", "description": "Walk-in cooler temperature rising", "priority": "urgent", "vendorId": "vendor-001", "location": { "storeName": "FreshMart Downtown", "address": "456 Oak Ave", "city": "Houston", "state": "TX", "zipCode": "77002" } }' | jq
```

### Step 5: Assign Technician

```bash
curl -s -X POST http://localhost:3000/api/jobs/$JOB_ID/assign \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "user-tech-001"}' | jq
```

### Step 6: Update Status (with eTag for optimistic concurrency)

```bash
curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress", "_etag": "<etag-from-previous-response>"}' | jq
```

### Step 7: Upload Photo

```bash
curl -s -X POST http://localhost:3000/api/jobs/$JOB_ID/attachments \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -F "photo=@/path/to/test-photo.jpg" | jq
```

### Step 8: Delta Sync

```bash
curl -s -X POST http://localhost:3000/api/jobs/sync \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"since": "2026-02-09T12:00:00.000Z"}' | jq
```
```json
{ "data": [{ "id": "...", "title": "Emergency Cooler Repair", "status": "completed" }], "syncTimestamp": "2026-02-09T12:16:00.000Z" }
```

### Conflict Simulation

```bash
# 1. Update job as dispatcher (eTag changes on server)
curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled", "_etag": "etag-A"}' | jq

# 2. Try with OLD eTag (simulating offline client) → 409 Conflict
curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress", "_etag": "etag-A"}' | jq
# Returns: { "error": { "code": "CONFLICT", "message": "Job has been modified by another user." } }
```

### RBAC Demonstration

```bash
# Technician cannot create jobs → 403 Forbidden
curl -s -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Test","priority":"low","vendorId":"vendor-001","location":{"storeName":"Test","address":"Test","city":"Test","state":"TX","zipCode":"77001"}}' | jq

# Dispatcher from vendor-002 cannot see vendor-001 jobs → 404 (no info leakage)
curl -s http://localhost:3000/api/jobs/$JOB_ID -H "Authorization: Bearer $V2_TOKEN" | jq
```

### Mobile App Demo Flow

1. Open the app → Redirects to login screen
2. Login as dispatcher (`dispatcher@coolair.com` / `dispatch123`)
3. Job List → Shows Cool Air jobs with status filter bar
4. Tap "+" → Create a new job with form fields
5. Tap a job → See detail with status, location, attachments
6. Tap "Mark Assigned" → Select a technician from the list
7. Turn on Airplane Mode → Banner turns red "Offline"
8. Tap "Start Work" on an assigned job → Status updates instantly (optimistic UI)
9. Check Activity tab → Shows "1 change pending"
10. Turn off Airplane Mode → Banner turns green, pending action syncs
11. Upload a photo → Camera/gallery picker, photo appears in gallery
12. Log out → Returns to login screen, local data cleared

## Testing & Verification

### Backend Smoke Test

```bash
cd backend && npm run dev
# In another terminal:
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@retailfixit.com","password":"admin123"}'
```

### Mobile App Test

```bash
cd mobile && npx expo start
# Scan QR code with Expo Go, or press 'i' for iOS simulator / 'a' for Android emulator
# Login with admin@retailfixit.com / admin123
```

### Offline Behavior Test

1. Login on the mobile app and let jobs sync
2. Enable Airplane Mode — banner turns red "Offline"
3. Tap "Start Work" on a job — status updates instantly (optimistic UI)
4. Check Activity tab — shows "1 change pending"
5. Disable Airplane Mode — pending action syncs, banner turns green

## Performance Notes

### Where Latency Matters

**1. Job List Loading (Most Critical) — Target: < 200ms**
- SQLite-first rendering: loads from local cache in ~10-20ms, network sync in background
- Delta sync: only returns modified jobs (~2-10KB vs ~100KB+ full list)
- Gzip compression: reduces JSON payloads by 60-80%
- Pagination: `limit`/`offset` prevents large initial payloads

**2. Job Detail Screen — Target: < 150ms content, < 500ms photos**
- Local cache hit: reads from SQLite without network call
- SAS URLs: photos fetched directly from Blob Storage, bypassing Express
- Lazy photo loading: text appears instantly, images load asynchronously

**3. Status Transitions — Target: < 50ms perceived**
- Optimistic local update: SQLite write + React state update in same frame (~16ms)
- Background sync: API call happens asynchronously via sync engine
- Action queue: survives app restarts, retries automatically

**4. Real-Time Events — Target: < 2 seconds end-to-end**
- SignalR WebSocket: events pushed within ~100-200ms of broadcast
- Immediate cache update: event handlers upsert to SQLite, trigger re-render
- Adaptive polling: 30s when SignalR connected (vs 10s without)

### Payload Size Optimization

| Endpoint | Typical Payload | Optimization |
|----------|----------------|-------------|
| `GET /api/jobs` (page) | ~15-30KB (25 jobs) | Gzip → ~5-8KB |
| `POST /api/jobs/sync` (delta) | ~2-10KB (1-5 jobs) | Only changed jobs since timestamp |
| `GET /api/jobs/:id` | ~1-3KB | Single document, SAS URLs are short strings |
| `POST /attachments` | 1-10MB (photo) | JPEG compression; 10MB limit |
| SignalR event | ~200-500 bytes | Minimal: just job ID + changed fields |

### Battery & Data Usage

- Adaptive sync intervals: 10s polling-only, 30s with SignalR — reduces wake-ups
- No sync when offline: preserves battery
- Delta sync: ~50-100KB total over an 8-hour shift (vs ~2-5MB with full refresh every 30s)
- Photo upload is user-initiated: no unexpected background data consumption

### Database Performance

- Cosmos DB partition key (`/tenantId`): single-partition queries cost 3-5 RUs
- Cross-partition queries (admin only): ~10-20 RUs, bounded by pagination
- eTag-based concurrency: single atomic operation, no locks
- SQLite synchronous API: data available in same execution frame as query

## Observability & Instrumentation Plan

### Current: Structured Logging (Pino)

The backend uses Pino for structured JSON logging and Pino-HTTP for automatic request/response logging. Every HTTP request logs method, URL, status code, response time. Job lifecycle events, sync requests, SignalR broadcasts, and attachment operations are all logged with structured context.

```json
{
  "level": 30, "time": 1707480000000,
  "req": { "id": "req-abc-123", "method": "PATCH", "url": "/api/jobs/abc/status" },
  "res": { "statusCode": 200 }, "responseTime": 45
}
```

### Production: Azure Application Insights

For production, integrate Application Insights for automatic dependency tracking, custom events, live metrics, and application map visualization.

### Key Metrics & Alerting

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API latency (p95) | < 300ms | > 500ms for 5 min |
| Error rate (5xx) | < 0.1% | > 1% for 5 min |
| Sync cycle duration | < 1s | > 3s for 10 min |
| Conflict rate (409/PATCH) | < 2% | > 5% for 15 min |
| SignalR broadcast failure | < 0.1% | > 1% for 5 min |
| Cosmos DB RU consumption | < 80% provisioned | > 90% for 10 min |
| App Service CPU | < 70% | > 85% for 10 min |

### Alerting Severity

**Critical:** API 5xx > 5% for 3 min, Cosmos DB unreachable, zero SignalR connections for 10 min

**Warning:** API p95 > 500ms for 15 min, conflict rate > 5% for 30 min, RU > 80% for 1 hour

**Informational:** Daily active users, jobs created/completed per day, sync duration trends

### Distributed Tracing

Each API request carries a correlation ID (`x-request-id`) linking mobile → Express → Cosmos DB → SignalR → Blob Storage, enabling end-to-end latency troubleshooting.

## Deployment Guide

### Azure Resource Inventory

| Service | Resource Name | SKU/Tier | Purpose |
|---------|--------------|----------|---------|
| Resource Group | `retailfixit-demo` | — | Container for all resources |
| Cosmos DB | `retailfixit-cosmos` | Serverless | Primary database |
| SignalR Service | `retailfixit-signalr` | Free/Standard (Serverless) | Real-time push |
| Blob Storage | `attachmentsjob` | Standard LRS | Photo attachments |
| App Service | (deployment target) | B1/S1 | Host Express backend |

### Azure CLI Provisioning

```bash
# Resource Group
az group create --name retailfixit-demo --location chilecentral

# Cosmos DB (Serverless)
az cosmosdb create --name retailfixit-cosmos --resource-group retailfixit-demo \
  --kind GlobalDocumentDB --capabilities EnableServerless \
  --default-consistency-level Session --locations regionName=chilecentral
az cosmosdb sql database create --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo --name RetailFixItDB
az cosmosdb sql container create --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo --database-name RetailFixItDB \
  --name Jobs --partition-key-path /tenantId
az cosmosdb sql container create --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo --database-name RetailFixItDB \
  --name Users --partition-key-path /tenantId

# SignalR Service (Serverless)
az signalr create --name retailfixit-signalr --resource-group retailfixit-demo \
  --sku Free_F1 --service-mode Serverless --location chilecentral

# Blob Storage
az storage account create --name attachmentsjob --resource-group retailfixit-demo \
  --location chilecentral --sku Standard_LRS --kind StorageV2
az storage container create --name job-attachments \
  --account-name attachmentsjob --public-access off

# App Service
az appservice plan create --name retailfixit-plan --resource-group retailfixit-demo \
  --location chilecentral --sku B1 --is-linux
az webapp create --name retailfixit-api --resource-group retailfixit-demo \
  --plan retailfixit-plan --runtime "NODE:18-lts"
```

### Scaling (Production)

| Service | Dev Tier | Production Recommendation |
|---------|----------|--------------------------|
| Cosmos DB | Serverless | Autoscale 400-4000 RU/s |
| App Service | B1 (1 core) | S1 with autoscale (2-5 instances, CPU > 70%) |
| SignalR | Free (20 conn) | Standard (2-3 units, ~3000 connections) |
| Blob Storage | Standard LRS | Standard LRS + lifecycle policy (365-day cleanup) |

### Cost Estimates

| Environment | Monthly Cost |
|-------------|-------------|
| Development | ~$20-35 |
| Production (~1,000 vendors) | ~$310-730 |

### Resilience

| Failure | Mitigation |
|---------|-----------|
| Cosmos DB outage | Health check returns 503; mobile reads from SQLite cache |
| SignalR outage | Mobile falls back to 10s polling; no data loss |
| Blob Storage outage | Photo upload fails gracefully; existing SAS URLs cached |
| App Service crash | Auto-restart; multi-instance with autoscale |

---

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
