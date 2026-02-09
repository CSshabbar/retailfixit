# RetailFixIt — Architecture Diagram & Service Overview

## High-Level Architecture

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
│  │                                                           │   │
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
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. Authentication Flow

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

### 2. Offline Sync Flow

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

### 3. Real-Time Event Flow

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

### 4. Photo Attachment Flow

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

## Azure Services Summary

| Service | Resource | Purpose | Why Chosen |
|---------|----------|---------|------------|
| **Cosmos DB** | `retailfixit-cosmos` | Primary database for Jobs & Users | Multi-model NoSQL with native partition support for multi-tenant; eTag for optimistic concurrency; sub-10ms reads at scale; serverless pricing for dev |
| **SignalR Service** | `retailfixit-signalr` | Real-time push notifications | Serverless mode = no WebSocket management on Express; managed WebSocket scaling; group-based routing for vendor/user/admin channels |
| **Blob Storage** | `attachmentsjob` | Photo attachment storage | Cost-effective binary storage; SAS URLs for time-limited direct access; CDN-ready; no database bloat from large files |
| **App Service** | (deployment target) | Host Express backend | Managed Node.js hosting with auto-scale; built-in SSL; deployment slots for zero-downtime updates |

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

## Encryption & PII Handling

| Layer | Protection |
|-------|-----------|
| In-transit | HTTPS/TLS for all API calls; WSS for SignalR |
| At-rest | Azure-managed encryption for Cosmos DB & Blob Storage |
| Tokens | SecureStore (Keychain/Keystore) on mobile devices |
| Passwords | bcrypt hashing with salt rounds |
| Attachments | SAS URLs with 1-hour read-only expiry; no permanent public access |
| PII | User email/name stored in Cosmos DB; technicians only see assigned job data |
