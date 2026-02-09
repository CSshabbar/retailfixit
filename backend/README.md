# RetailFixIt — Backend

Express + TypeScript REST API backed by Azure Cosmos DB, SignalR, and Blob Storage.

## Prerequisites

- Node.js 18+
- Azure Cosmos DB account
- Azure SignalR Service (Serverless mode)
- Azure Blob Storage account

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in your Azure credentials
```

## Running

```bash
npm run dev     # development with tsx watch
npm run build   # compile TypeScript
npm start       # run compiled output
```

The server starts on `http://localhost:3000` by default.

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| GET | `/api/auth/technicians` | List technicians (admin/dispatcher) |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List jobs (filtered by role) |
| GET | `/api/jobs/:id` | Get job by ID (with SAS URLs for attachments) |
| POST | `/api/jobs` | Create a new job |
| PATCH | `/api/jobs/:id` | Update a job |
| POST | `/api/jobs/sync` | Delta sync (returns jobs modified since timestamp) |

### Attachments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs/:id/attachments` | Upload photo (multipart, 10MB max, JPEG/PNG) |
| DELETE | `/api/jobs/:id/attachments/:attachmentId` | Delete an attachment |

### SignalR
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signalr/negotiate` | Get SignalR connection token |

## Project Structure

```
src/
  config.ts           — env vars + validation
  index.ts            — Express app setup + startup
  middleware/
    auth.ts           — JWT verification middleware
    rbac.ts           — Role-based access control
    requestLogger.ts  — Pino HTTP request logging
  routes/
    health.ts         — Health check endpoint
    auth.ts           — Login + technician listing
    jobs.ts           — Jobs CRUD + sync
    attachments.ts    — Photo upload/delete
    signalr.ts        — SignalR negotiate
  services/
    cosmosDb.ts       — Cosmos DB client + initialization
    jobsDb.ts         — Job document operations
    usersDb.ts        — User document operations
    blobStorage.ts    — Azure Blob Storage operations
    seedUsers.ts      — Demo user seeding
    seedJobs.ts       — Demo job seeding
    signalrBroadcast.ts — SignalR REST API broadcaster
  types/
    auth.ts           — JWT payload types
    job.ts            — Job + Attachment document types
```

## Environment Variables

See `.env.example` for all required variables. The server will fail to start if any are missing.
