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
| PATCH | `/api/jobs/:id` | Edit job fields (admin/dispatcher, with eTag) |
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
| App Service CPU (production) | < 70% | > 85% for 10 min |

### Distributed Tracing

Each API request carries a correlation ID (`x-request-id`) linking mobile → Express → Cosmos DB → SignalR → Blob Storage, enabling end-to-end latency troubleshooting.

## Deployment Guide

### Current Setup (Development)

The backend runs locally on your machine (`localhost:3000`) and connects to Azure cloud services over the internet. No App Service is used.

| Service | Resource Name | Status | Purpose |
|---------|--------------|--------|---------|
| Cosmos DB | `retailfixit-cosmos` | **Active** | Stores jobs and users |
| SignalR Service | `retailfixit-signalr` | **Active** | Real-time push updates |
| Blob Storage | `attachmentsjob` | **Active** | Stores job photos |

### Azure CLI — Provisioning the active services

These are the commands used to create the Azure resources this project connects to:

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
```

### Production Deployment Plan

For production, the Express backend would be deployed to **Azure App Service** instead of running locally. This is the recommended setup:

```bash
# App Service (production only — not used in development)
az appservice plan create --name retailfixit-plan --resource-group retailfixit-demo \
  --location chilecentral --sku B1 --is-linux
az webapp create --name retailfixit-api --resource-group retailfixit-demo \
  --plan retailfixit-plan --runtime "NODE:18-lts"
```

### Scaling Recommendations (Production)

| Service | Current (Dev) | Production Recommendation |
|---------|--------------|--------------------------|
| Cosmos DB | Serverless (pay-per-use) | Autoscale 400-4000 RU/s |
| App Service | Not used (local dev) | S1 with autoscale (2-5 instances, CPU > 70%) |
| SignalR | Free (20 connections) | Standard (2-3 units, ~3000 connections) |
| Blob Storage | Standard LRS | Standard LRS + lifecycle policy (365-day cleanup) |

### Cost Estimates

| Environment | Monthly Cost |
|-------------|-------------|
| Development (current) | ~$20-35 (Cosmos + SignalR + Blob only) |
| Production (~1,000 vendors) | ~$310-730 (adds App Service + scaled tiers) |

### Resilience

| Failure | What happens |
|---------|-------------|
| Cosmos DB outage | Health check returns error; mobile app keeps working from SQLite cache |
| SignalR outage | App falls back to polling every 10 seconds; no data is lost |
| Blob Storage outage | Photo upload fails with a message; existing photos still load from cached URLs |
| Backend down (production) | App Service auto-restarts; mobile app uses cached data until it recovers |
