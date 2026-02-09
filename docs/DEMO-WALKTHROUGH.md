# RetailFixIt — Demo Walkthrough & Example Payloads

## Prerequisites

1. Backend running on `http://localhost:3000` (`cd backend && npm run dev`)
2. Azure Cosmos DB, SignalR, and Blob Storage configured in `.env`
3. Demo users seeded (happens automatically on first startup)
4. Mobile app running via `npx expo start` in the `mobile/` directory

## Demo Credentials

| Role | Email | Password | Vendor |
|------|-------|----------|--------|
| Admin | admin@retailfixit.com | admin123 | — (sees all) |
| Dispatcher | dispatcher@coolair.com | dispatch123 | Cool Air (vendor-001) |
| Technician | ahmed@coolair.com | tech123 | Cool Air (vendor-001) |
| Dispatcher | dispatcher@sparkelectric.com | dispatch123 | Spark Electric (vendor-002) |
| Technician | sara@sparkelectric.com | tech123 | Spark Electric (vendor-002) |

## Step-by-Step Demo Sequence

### Step 1: Health Check

```bash
curl -s http://localhost:3000/api/health | jq
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-09T12:00:00.000Z",
  "services": {
    "cosmosDb": "connected"
  }
}
```

### Step 2: Login as Admin

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@retailfixit.com", "password": "admin123"}' | jq
```

**Expected response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-admin-001",
    "email": "admin@retailfixit.com",
    "role": "admin",
    "displayName": "Admin User",
    "vendorId": null,
    "tenantId": "system"
  }
}
```

**Save the token for subsequent requests:**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."  # paste your token here
```

### Step 3: List All Jobs (Admin sees all vendors)

```bash
curl -s http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected response:**
```json
{
  "data": [
    {
      "id": "job-001",
      "title": "HVAC Unit Replacement",
      "description": "Replace failing HVAC unit in Store #42",
      "status": "pending",
      "priority": "high",
      "vendorId": "vendor-001",
      "tenantId": "vendor-001",
      "createdBy": "user-dispatcher-001",
      "createdByName": "Cool Air Dispatcher",
      "assignedTo": null,
      "assignedToName": null,
      "location": {
        "storeName": "MegaMart Store #42",
        "address": "123 Main St",
        "city": "Houston",
        "state": "TX",
        "zipCode": "77001"
      },
      "createdAt": "2026-02-08T10:00:00.000Z",
      "updatedAt": "2026-02-08T10:00:00.000Z"
    }
  ],
  "total": 8,
  "limit": 25,
  "offset": 0
}
```

### Step 4: Login as Dispatcher and Create a Job

```bash
# Login as dispatcher
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dispatcher@coolair.com", "password": "dispatch123"}' | jq

# Save dispatcher token
DISPATCHER_TOKEN="..."  # paste token

# Create a new job
curl -s -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Emergency Cooler Repair",
    "description": "Walk-in cooler temperature rising, needs immediate attention",
    "priority": "urgent",
    "vendorId": "vendor-001",
    "location": {
      "storeName": "FreshMart Downtown",
      "address": "456 Oak Ave",
      "city": "Houston",
      "state": "TX",
      "zipCode": "77002"
    }
  }' | jq
```

**Expected response (201 Created):**
```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "title": "Emergency Cooler Repair",
    "status": "pending",
    "priority": "urgent",
    "vendorId": "vendor-001",
    "tenantId": "vendor-001",
    "createdAt": "2026-02-09T12:05:00.000Z",
    "updatedAt": "2026-02-09T12:05:00.000Z",
    "_etag": "\"00000000-0000-0000-...\""
  }
}
```

### Step 5: List Available Technicians

```bash
curl -s http://localhost:3000/api/auth/technicians \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" | jq
```

**Expected response:**
```json
{
  "data": [
    {
      "id": "user-tech-001",
      "displayName": "Ahmed (Cool Air)",
      "email": "ahmed@coolair.com",
      "role": "technician",
      "vendorId": "vendor-001"
    }
  ]
}
```

### Step 6: Assign Technician to Job

```bash
JOB_ID="a1b2c3d4-..."  # from Step 4

curl -s -X POST http://localhost:3000/api/jobs/$JOB_ID/assign \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"technicianId": "user-tech-001"}' | jq
```

**Expected response:**
```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "assigned",
    "assignedTo": "user-tech-001",
    "assignedToName": "Ahmed (Cool Air)",
    "updatedAt": "2026-02-09T12:06:00.000Z",
    "_etag": "\"00000000-0000-0000-...\""
  }
}
```

### Step 7: Login as Technician and Start Work

```bash
# Login as technician
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "ahmed@coolair.com", "password": "tech123"}' | jq

TECH_TOKEN="..."  # paste token

# Get job detail (includes full attachments with SAS URLs)
curl -s http://localhost:3000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $TECH_TOKEN" | jq

# Start work (transition: assigned → in-progress)
ETAG="..."  # from the _etag field of the job

curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"in-progress\", \"_etag\": \"$ETAG\"}" | jq
```

**Expected response:**
```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "in-progress",
    "updatedAt": "2026-02-09T12:10:00.000Z",
    "_etag": "\"new-etag-value\""
  }
}
```

### Step 8: Upload a Photo Attachment

```bash
curl -s -X POST http://localhost:3000/api/jobs/$JOB_ID/attachments \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -F "photo=@/path/to/test-photo.jpg" | jq
```

**Expected response (201 Created):**
```json
{
  "data": {
    "id": "att-uuid-...",
    "fileName": "test-photo.jpg",
    "mimeType": "image/jpeg",
    "size": 245760,
    "blobName": "vendor-001/a1b2c3d4-.../att-uuid-....jpg",
    "uploadedBy": "user-tech-001",
    "uploadedAt": "2026-02-09T12:12:00.000Z",
    "sasUrl": "https://attachmentsjob.blob.core.windows.net/job-attachments/vendor-001/...?sv=2024-11-04&se=2026-02-09T13:12:00Z&sr=b&sp=r&sig=..."
  }
}
```

### Step 9: Complete the Job

```bash
NEW_ETAG="..."  # from Step 7 response

curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"completed\", \"_etag\": \"$NEW_ETAG\"}" | jq
```

### Step 10: Delta Sync (Mobile Sync Endpoint)

```bash
# Initial sync (no timestamp — returns all jobs for this user)
curl -s -X POST http://localhost:3000/api/jobs/sync \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"since": null}' | jq

# Subsequent sync (only jobs modified after this timestamp)
curl -s -X POST http://localhost:3000/api/jobs/sync \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"since": "2026-02-09T12:00:00.000Z"}' | jq
```

**Expected response:**
```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "title": "Emergency Cooler Repair",
      "status": "completed",
      "updatedAt": "2026-02-09T12:15:00.000Z"
    }
  ],
  "syncTimestamp": "2026-02-09T12:16:00.000Z"
}
```

### Step 11: SignalR Negotiate (Real-Time Token)

```bash
curl -s -X POST http://localhost:3000/api/signalr/negotiate \
  -H "Authorization: Bearer $TECH_TOKEN" | jq
```

**Expected response:**
```json
{
  "url": "https://retailfixit-signalr.service.signalr.net/client/?hub=retailfixit",
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

The mobile client uses this URL + token to establish a WebSocket connection directly to Azure SignalR Service.

## Demonstrating Conflict Detection

To simulate a conflict scenario:

```bash
# 1. Get a job's current eTag
curl -s http://localhost:3000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" | jq '._etag'
# Returns: "etag-A"

# 2. Update the job as dispatcher (changes the eTag on server)
curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled", "_etag": "etag-A"}' | jq
# Succeeds, server eTag is now "etag-B"

# 3. Try to update with the OLD eTag (simulating an offline client)
curl -s -X PATCH http://localhost:3000/api/jobs/$JOB_ID/status \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress", "_etag": "etag-A"}' | jq
# Returns 409 Conflict
```

**409 Response:**
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Job has been modified by another user. Please refresh and try again."
  }
}
```

## Demonstrating RBAC Restrictions

```bash
# Technician cannot create jobs (403)
curl -s -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "description": "Test", "priority": "low", "vendorId": "vendor-001", "location": {"storeName": "Test", "address": "Test", "city": "Test", "state": "TX", "zipCode": "77001"}}' | jq
# Returns 403 Forbidden

# Dispatcher from vendor-002 cannot see vendor-001 jobs (404)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dispatcher@sparkelectric.com", "password": "dispatch123"}' | jq
V2_TOKEN="..."

curl -s http://localhost:3000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $V2_TOKEN" | jq
# Returns 404 Not Found (not 403, to avoid information leakage)
```

## Mobile App Demo Flow

1. **Open the app** → Redirects to login screen
2. **Login as dispatcher** (`dispatcher@coolair.com` / `dispatch123`)
3. **Job List** → Shows Cool Air jobs with status filter bar
4. **Tap "+"** → Create a new job with form fields
5. **Tap a job** → See detail with status, location, attachments
6. **Tap "Mark Assigned"** → Select a technician from the list
7. **Turn on Airplane Mode** → Banner turns red "Offline"
8. **Tap "Start Work"** on an assigned job → Status updates instantly (optimistic UI)
9. **Check Activity tab** → Shows "1 change pending"
10. **Turn off Airplane Mode** → Banner turns green, pending action syncs
11. **Upload a photo** → Camera/gallery picker, photo appears in gallery
12. **Log out** → Returns to login screen, local data cleared
