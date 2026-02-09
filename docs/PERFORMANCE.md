# RetailFixIt — Performance Notes

## Where Latency Matters

### 1. Job List Loading (Most Critical)

**Target:** < 200ms perceived load time

This is the first screen technicians see after login and the most frequently visited screen. Latency here directly impacts productivity — a slow job list means technicians wait before they can start their next task.

**Optimizations applied:**
- **SQLite-first rendering:** The job list loads from local SQLite immediately on screen focus, showing cached data in ~10-20ms. Network sync happens in the background.
- **Delta sync:** `POST /api/jobs/sync { since }` only returns jobs modified since the last sync timestamp, reducing payload size from potentially hundreds of jobs to only the changed ones. A typical delta response is 1-5 jobs (~2-10KB) vs a full list of 50+ jobs (~100KB+).
- **Gzip compression:** The `compression` middleware compresses all API responses, reducing JSON payload sizes by 60-80%.
- **Pagination:** `GET /api/jobs` supports `limit` (max 100) and `offset` parameters. The mobile client fetches one page at a time, avoiding large initial payloads.

### 2. Job Detail Screen

**Target:** < 150ms to display content, < 500ms for photos

**Optimizations applied:**
- **Local cache hit:** If the job was already synced, the detail screen reads from SQLite immediately without any network call.
- **SAS URLs for photos:** Attachment images are fetched directly from Azure Blob Storage via SAS URLs, bypassing the Express backend entirely. This eliminates a proxy hop and leverages Azure's edge network.
- **Thumbnail support:** Job cards in the list show a thumbnail SAS URL, and the detail screen shows full-size SAS URLs. Both are generated on-the-fly with 1-hour expiry.
- **Lazy photo loading:** Photos render asynchronously — the job detail text appears instantly while images load in the background.

### 3. Status Transitions (Accept/Start/Complete)

**Target:** < 50ms perceived response time

This is where optimistic UI has the biggest impact. Technicians tap "Start Work" and need to see the status change immediately — waiting for a server round-trip (~200-500ms) would feel sluggish.

**Optimizations applied:**
- **Optimistic local update:** `updateLocalJobStatus()` writes to SQLite synchronously, and the React state updates in the same frame. The button changes within one render cycle (~16ms).
- **Background sync:** The actual API call (`PATCH /api/jobs/:id/status`) happens asynchronously via the sync engine. If it succeeds, the local state is already correct. If it fails (409 conflict), the conflict UI appears.
- **Action queue:** The pending action is stored in SQLite before the API call, ensuring it survives app restarts and will retry.

### 4. Real-Time Event Delivery

**Target:** < 2 seconds from backend event to mobile UI update

**Optimizations applied:**
- **SignalR WebSocket:** Direct WebSocket connection avoids polling latency. Events are pushed within ~100-200ms of the backend broadcast.
- **Immediate cache update:** SignalR event handlers upsert the event payload directly into SQLite and update `lastEventTimestamp`, triggering a React re-render without waiting for a full sync cycle.
- **Adaptive polling:** When SignalR is connected, the polling interval widens to 30s (from 10s), reducing battery usage and unnecessary network calls.

### 5. Photo Upload

**Target:** < 5 seconds for a typical phone photo

**Optimizations applied:**
- **30-second timeout:** Photo uploads get a 3x longer timeout than regular API calls, accommodating larger payloads on slower connections.
- **Direct blob upload path:** The Express backend streams the multer buffer directly to Blob Storage using in-memory storage (no disk I/O on the server).
- **10MB limit:** Prevents excessively large uploads that would time out. JPEG/PNG only filtering avoids accidental video uploads.
- **Cosmos patch operation:** Attachment metadata is appended to the job document using Cosmos DB's `patch` API, which is more efficient than a full document replace.

## Payload Size Optimization

| Endpoint | Typical Payload | Optimization |
|----------|----------------|-------------|
| `GET /api/jobs` (page) | ~15-30KB (25 jobs) | Gzip → ~5-8KB |
| `POST /api/jobs/sync` (delta) | ~2-10KB (1-5 jobs) | Only changed jobs since timestamp |
| `GET /api/jobs/:id` | ~1-3KB | Single document, SAS URLs are short strings |
| `POST /api/jobs/:id/attachments` | 1-10MB (photo) | JPEG compression from camera; 10MB limit |
| SignalR event payload | ~200-500 bytes | Minimal: just job ID + changed fields |

## Connection Efficiency

- **HTTP Keep-Alive:** Enabled by default in Node.js/Express — TCP connections are reused across requests, avoiding the ~100ms overhead of TLS handshake per request.
- **WebSocket persistence:** The SignalR connection stays open as long as the app is foregrounded, providing sub-second event delivery without repeated connection setup.
- **Batch sync over individual fetches:** Instead of fetching each job individually, the sync endpoint returns all changed jobs in one request, reducing HTTP round-trips.

## Battery & Data Usage Considerations

- **Adaptive sync intervals:** 10s when polling-only, 30s when SignalR is active — reduces unnecessary wake-ups.
- **No sync when offline:** The sync engine checks `isOnline` before attempting any network calls, preserving battery.
- **Delta sync reduces data transfer:** Over a typical 8-hour shift, a technician with 5 assigned jobs might transfer ~50-100KB total (vs ~2-5MB with full refresh every 30s).
- **Photo upload is user-initiated:** No automatic background photo upload that would consume data unexpectedly.

## Database Performance

- **Cosmos DB partition key (`/tenantId`):** Ensures all queries for a vendor's jobs hit a single partition, minimizing RU consumption. A typical job list query costs 3-5 RUs.
- **Cross-partition queries (admin only):** Admin listing all jobs across vendors is more expensive (~10-20 RUs) but infrequent and bounded by pagination.
- **eTag-based concurrency:** No explicit locks or transactions needed — the eTag check is a single atomic operation within Cosmos DB.
- **SQLite synchronous API:** expo-sqlite's synchronous API (`getAllSync`, `runSync`) avoids callback overhead and ensures data is available in the same execution frame as the query.
