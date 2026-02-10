# RetailFixIt

Mobile-first retail repair management platform built with React Native (Expo) and Node.js (Express), backed by Azure cloud services.

---

## Overview

RetailFixIt coordinates service jobs between customers and ~1,000 vendors. Technicians and dispatchers use native mobile apps with full offline support for field workers with intermittent connectivity.

**Key features:**
- Job creation, assignment, and status tracking with optimistic UI
- Role-based access control (admin, dispatcher, technician)
- Offline-first architecture with automatic sync and conflict resolution
- Real-time updates via Azure SignalR Service
- Photo attachments with Azure Blob Storage
- Delta sync protocol for minimal data transfer

## Architecture

![RetailFixIt Architecture](architecture-diagram.png)

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

### Prerequisites

- Node.js 18+
- Expo Go app on your phone (iOS / Android)
- Azure credentials (`.env` file — see below)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in Azure credentials
npm run dev             # starts on http://localhost:3000
```

### Mobile

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start          # scan QR with Expo Go
```

Update `API_BASE_URL` in `mobile/constants/config.ts` to point to your backend IP.

### Demo Credentials

| Role | Email | Password | Vendor |
|------|-------|----------|--------|
| Admin | admin@retailfixit.com | admin123 | — (sees all) |
| Dispatcher | dispatcher@coolair.com | dispatch123 | Cool Air (vendor-001) |
| Technician | ahmed@coolair.com | tech123 | Cool Air (vendor-001) |
| Dispatcher | dispatcher@sparkelectric.com | dispatch123 | Spark Electric (vendor-002) |
| Technician | sara@sparkelectric.com | tech123 | Spark Electric (vendor-002) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/technicians` | List technicians |
| GET | `/api/jobs` | List jobs (paginated, role-filtered) |
| GET | `/api/jobs/:id` | Job detail (with SAS URLs) |
| POST | `/api/jobs` | Create job |
| PATCH | `/api/jobs/:id` | Edit job fields (with eTag) |
| PATCH | `/api/jobs/:id/status` | Update status (with eTag) |
| POST | `/api/jobs/:id/assign` | Assign technician |
| DELETE | `/api/jobs/:id` | Delete job (admin only) |
| POST | `/api/jobs/sync` | Delta sync |
| POST | `/api/jobs/:id/attachments` | Upload photo |
| DELETE | `/api/jobs/:id/attachments/:aid` | Delete photo |
| POST | `/api/signalr/negotiate` | SignalR connection token |

## Project Structure

```
retailfixit/
├── backend/
│   └── src/
│       ├── middleware/        # auth.ts, rbac.ts, requestLogger.ts
│       ├── routes/            # health, auth, jobs, attachments, signalr
│       ├── services/          # cosmosDb, jobsDb, usersDb, blobStorage, signalr
│       └── types/             # auth.ts, job.ts
│
└── mobile/
    ├── app/
    │   ├── (auth)/login.tsx
    │   └── (app)/
    │       ├── (jobs)/        # index, [id], create, edit
    │       └── profile.tsx
    ├── components/            # JobCard, StatusBadge, PhotoSection, etc.
    ├── contexts/              # AuthContext, OfflineContext
    ├── services/              # api, jobs, localDb, syncEngine, signalr
    └── hooks/useJobs.ts
```

## Testing

```bash
# Backend smoke test
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@retailfixit.com","password":"admin123"}'

# Mobile — scan QR with Expo Go after `npx expo start`

# Offline test — enable Airplane Mode, change a job status,
# then disable Airplane Mode and watch it sync
```

## Documentation

Detailed documentation is split into focused documents:

| Document | Contents |
|----------|----------|
| [System Design & Architecture](docs/DESIGN.md) | Architecture diagrams, data flows, Azure service choices, offline/sync strategy, RBAC model, tradeoffs |
| [Implementation & Deployment](docs/IMPLEMENTATION.md) | Project structure, API details, demo walkthrough, performance notes, observability, deployment guide |
| [Engineering Reasoning](docs/ENGINEERING.md) | Autonomy & risk, conflict handling, instrumentation, failure modes & graceful degradation |
