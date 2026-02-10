# Part 3: Engineering Reasoning

## 1. Autonomy & Risk

**Which actions should never be fully automatic on mobile, and why?**

Some actions are too risky to happen automatically. A human should always confirm them first. Here's what we protect and why:

**Reassigning a job to a different vendor** — Only admins can do this. If the system auto-assigned jobs, it could send a plumber to an electrical job. Dispatchers know their technicians' skills, schedules, and who works best with which customer. An algorithm can't know these things.

**Cancelling a job** — Only admins and dispatchers can cancel, and only when online. Technicians can't cancel because they might accidentally cancel a job that a customer is waiting for. We also require an internet connection so the cancellation is confirmed immediately on the server. Without this, a cancelled job could still show as "active" to other users.

**Deleting a job** — Only admins can delete. This permanently removes the job and all its photos. The button is red to show it's dangerous. We don't allow bulk deletes — each job must be deleted one by one to prevent accidents.

**Bulk operations and data cleanup** — Not built yet, on purpose. If we add these later, they should show exactly how many records will be affected, let the admin preview what will be deleted, and use a "soft delete" period before permanently removing anything.

**The rule of thumb:** If an action can't be undone, affects other users, or could cause real problems — always ask the human to confirm first.

## 2. Sync Safety & Conflict Handling

**How do you detect and handle conflicts when offline clients try to sync?**

### How we detect conflicts

Every job in the database has a version tag called `_etag`. This tag changes every time someone edits the job. When your phone tries to update a job, it sends the `_etag` it last saw. If the tag on the server is different, it means someone else changed the job while you were offline. The server rejects the update with a **409 Conflict** error.

### What happens step by step

1. A technician is offline and taps "Start Work" on a job
2. The app saves this action locally in SQLite (with the job's current `_etag`)
3. When internet comes back, the app tries to send this change to the server
4. The server checks: does the `_etag` match? If yes, the update goes through. If no, it means someone else already changed this job
5. On conflict, the app marks the job with a red "Conflict" badge
6. The failed action is removed from the queue (retrying with an old tag would always fail)

### How we resolve conflicts — the user decides

We don't use "last writer wins" because that's dangerous. Imagine: a technician marks a job "completed" while offline, but a dispatcher cancels the same job. If we just pick whoever syncs last, we could end up with a cancelled job showing as completed.

Instead, the user sees a clear choice:
- **"Use Server Version"** — Accept what the other person did, discard your local change
- **"Retry My Change"** — Get the latest version from the server and try your change again

### How we prevent conflicts in the first place

- **Real-time updates (SignalR)** keep everyone's data fresh, so conflicts are rare
- **Writes go first, then reads** — the app sends your changes before downloading new data, so server data doesn't overwrite your pending changes
- **Jobs with pending changes are protected** — the sync engine skips updating jobs that have local changes waiting to be sent

## 3. Instrumentation & Events

**What do you track to keep the mobile app reliable?**

We track three things: **what happened** (events), **how fast it happened** (performance), and **where it happened** (traces).

### Events we log

| Event | When it fires | Why we track it |
|-------|--------------|-----------------|
| `JobCreated` | New job saved | Know how many jobs are created daily |
| `JobAssigned` | Technician assigned to a job | See how long jobs wait before assignment |
| `JobStatusChanged` | Status changes (e.g. pending → in-progress) | Spot stuck jobs that never move forward |
| `ClientSync` | Phone finishes syncing | Check if sync is working and how fast |
| `SyncConflict` | Two people edited the same job | Catch problems early — too many conflicts = something is wrong |
| `OverrideEvent` | Dispatcher changes a technician's action | Keep a record for disputes |
| `AttachmentUploaded` | Photo uploaded successfully | Track upload success/failure rate |
| `SignalR Connect/Disconnect` | Real-time connection starts or drops | Monitor if live updates are working |
| `AuthLogin/Logout` | User logs in or out | Security tracking, active user count |

### Performance numbers we watch

- **API response time** — If loading jobs takes more than 500ms, users notice. We log every request's duration.
- **Sync duration** — How long does a full sync take? If it grows past 5 seconds, something needs fixing.
- **SignalR uptime** — What percentage of the time is the real-time connection alive? Below 95% means connection problems.
- **Conflict rate** — How many updates fail due to conflicts? Above 5% means too many people are editing the same jobs.
- **Pending queue size** — How many offline actions are waiting to sync? If this keeps growing, actions are failing.
- **Database cost (RU usage)** — Cosmos DB charges per operation. We watch this to avoid surprise bills.

### Tracing requests end-to-end

Every API request has a unique ID that follows it from the phone → backend → database → SignalR → blob storage. If something is slow, we can trace exactly where the delay happened. In production, Azure Application Insights would give us dashboards and alerts for all of this.

## 4. Failure Modes & Graceful Degradation

**What happens when the backend goes down or the network is slow?**

The app is built **offline-first**, so it keeps working even when the server is down. Here's how each failure scenario is handled:

### No internet at all

- The status dot turns **red** and shows "Offline"
- The app still works — it reads everything from the local SQLite database
- You can still change job statuses — changes are saved locally and will sync later
- Photo uploads are disabled (photos are too large to queue offline)
- Dangerous actions (cancel, delete, assign) are disabled — they need server confirmation
- When internet comes back, everything syncs automatically

### Internet is slow

- API calls timeout after 10 seconds (30 seconds for photo uploads)
- If a sync fails, it retries on the next cycle
- The app shows cached data immediately — you never wait for a slow server
- The Activity screen shows error details so you can see what's wrong

### Real-time connection drops (SignalR)

- The app automatically tries to reconnect: waits 2s, then 4s, then 8s, then 15s, then 30s
- While disconnected, the app polls the server every 10 seconds instead of relying on push updates
- The status dot turns **amber** (online but no live updates)
- No data is lost — the next sync catches up on everything missed

### Database issues (Cosmos DB)

- The health check endpoint returns an error so we know immediately
- The mobile app just keeps using cached data from SQLite
- Failed requests are retried on the next sync cycle

### Quick troubleshooting guide

| Problem | What to check |
|---------|--------------|
| Too many conflicts | Are multiple dispatchers editing the same jobs? Consider adding a "locked by" indicator |
| Pending queue keeps growing | Is the backend healthy? Check if individual actions are failing (expired login? invalid status change?) |
| SignalR keeps disconnecting | Check Azure SignalR Service in Azure Portal. Is the negotiate endpoint returning valid tokens? |
| Sync is slow | Check Cosmos DB usage. Are admin queries (which scan all vendors) using too many resources? |
