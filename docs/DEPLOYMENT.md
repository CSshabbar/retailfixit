# RetailFixIt — Deployment Guide & Infrastructure Configuration

## Azure Resource Inventory

| Service | Resource Name | Region | SKU/Tier | Purpose |
|---------|--------------|--------|----------|---------|
| Resource Group | `retailfixit-demo` | Chile Central | — | Container for all resources |
| Cosmos DB | `retailfixit-cosmos` | Chile Central | Serverless | Primary database |
| SignalR Service | `retailfixit-signalr` | Chile Central | Free/Standard (Serverless mode) | Real-time push |
| Blob Storage | `attachmentsjob` | Chile Central | Standard LRS | Photo attachments |
| App Service | (deployment target) | Chile Central | B1/S1 | Host Express backend |

## Azure CLI Provisioning Commands

The following commands replicate the infrastructure. Run them in order:

### 1. Resource Group

```bash
az group create \
  --name retailfixit-demo \
  --location chilecentral
```

### 2. Cosmos DB (Serverless)

```bash
# Create account
az cosmosdb create \
  --name retailfixit-cosmos \
  --resource-group retailfixit-demo \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --default-consistency-level Session \
  --locations regionName=chilecentral

# Create database
az cosmosdb sql database create \
  --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo \
  --name RetailFixItDB

# Create Jobs container (partition key: /tenantId)
az cosmosdb sql container create \
  --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo \
  --database-name RetailFixItDB \
  --name Jobs \
  --partition-key-path /tenantId

# Create Users container (partition key: /tenantId)
az cosmosdb sql container create \
  --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo \
  --database-name RetailFixItDB \
  --name Users \
  --partition-key-path /tenantId
```

### 3. Azure SignalR Service (Serverless Mode)

```bash
az signalr create \
  --name retailfixit-signalr \
  --resource-group retailfixit-demo \
  --sku Free_F1 \
  --service-mode Serverless \
  --location chilecentral

# Get connection string
az signalr key list \
  --name retailfixit-signalr \
  --resource-group retailfixit-demo \
  --query primaryConnectionString -o tsv
```

### 4. Blob Storage

```bash
# Create storage account
az storage account create \
  --name attachmentsjob \
  --resource-group retailfixit-demo \
  --location chilecentral \
  --sku Standard_LRS \
  --kind StorageV2

# Create container
az storage container create \
  --name job-attachments \
  --account-name attachmentsjob \
  --public-access off

# Get connection string
az storage account show-connection-string \
  --name attachmentsjob \
  --resource-group retailfixit-demo \
  --query connectionString -o tsv
```

### 5. App Service (Backend Hosting)

```bash
# Create App Service Plan
az appservice plan create \
  --name retailfixit-plan \
  --resource-group retailfixit-demo \
  --location chilecentral \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --name retailfixit-api \
  --resource-group retailfixit-demo \
  --plan retailfixit-plan \
  --runtime "NODE:18-lts"

# Configure environment variables
az webapp config appsettings set \
  --name retailfixit-api \
  --resource-group retailfixit-demo \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    COSMOS_ENDPOINT="https://retailfixit-cosmos.documents.azure.com:443/" \
    COSMOS_KEY="<your-cosmos-key>" \
    COSMOS_DATABASE="RetailFixItDB" \
    COSMOS_CONTAINER_JOBS="Jobs" \
    COSMOS_CONTAINER_USERS="Users" \
    JWT_SECRET="<your-jwt-secret>" \
    JWT_EXPIRES_IN="24h" \
    SIGNALR_CONNECTION_STRING="<your-signalr-connection-string>" \
    STORAGE_CONNECTION_STRING="<your-storage-connection-string>"

# Deploy from local build
cd backend
npm run build
zip -r deploy.zip dist/ package.json package-lock.json node_modules/
az webapp deploy \
  --name retailfixit-api \
  --resource-group retailfixit-demo \
  --src-path deploy.zip \
  --type zip
```

## Scaling Configuration

### Cosmos DB Scaling

**Current (Development):** Serverless — pay-per-request, no provisioned throughput.

**Production recommendation:**
```bash
# Switch to provisioned throughput with autoscale
az cosmosdb sql container throughput update \
  --account-name retailfixit-cosmos \
  --resource-group retailfixit-demo \
  --database-name RetailFixItDB \
  --name Jobs \
  --max-throughput 4000  # Autoscale: 400-4000 RU/s
```

| Workload | Estimated RU/s | Notes |
|----------|---------------|-------|
| Job list query (single vendor) | 3-5 RU | Partition-scoped, efficient |
| Job list query (admin, cross-partition) | 10-20 RU | Paginated, bounded |
| Single job read | 1 RU | Point read by id + tenantId |
| Job create/update | 5-10 RU | Single document write |
| Delta sync (5 changed jobs) | 5-15 RU | Query + read |
| Patch (add attachment) | 5-10 RU | Partial update |

**Sizing for ~1,000 vendors, ~5,000 technicians:**
- Peak concurrent users: ~500
- Estimated peak RU/s: ~500-1000
- Autoscale max: 4000 RU/s handles 4x spikes

### App Service Scaling

**Current:** B1 (1 core, 1.75GB RAM) — sufficient for development.

**Production recommendation:**
```bash
# Scale up to S1 (production tier with autoscale)
az appservice plan update \
  --name retailfixit-plan \
  --resource-group retailfixit-demo \
  --sku S1

# Enable autoscale (2-5 instances based on CPU)
az monitor autoscale create \
  --resource-group retailfixit-demo \
  --resource retailfixit-plan \
  --resource-type Microsoft.Web/serverfarms \
  --name retailfixit-autoscale \
  --min-count 2 \
  --max-count 5 \
  --count 2

az monitor autoscale rule create \
  --resource-group retailfixit-demo \
  --autoscale-name retailfixit-autoscale \
  --condition "CpuPercentage > 70 avg 5m" \
  --scale out 1

az monitor autoscale rule create \
  --resource-group retailfixit-demo \
  --autoscale-name retailfixit-autoscale \
  --condition "CpuPercentage < 30 avg 10m" \
  --scale in 1
```

### SignalR Service Scaling

**Current:** Free tier (20 concurrent connections, 20K messages/day).

**Production recommendation:**
```bash
# Upgrade to Standard tier
az signalr update \
  --name retailfixit-signalr \
  --resource-group retailfixit-demo \
  --sku Standard_S1 \
  --unit-count 1  # 1 unit = 1000 concurrent connections
```

| Tier | Concurrent Connections | Messages/Day | Cost |
|------|----------------------|-------------|------|
| Free | 20 | 20,000 | $0 |
| Standard (1 unit) | 1,000 | Unlimited | ~$50/mo |
| Standard (5 units) | 5,000 | Unlimited | ~$250/mo |

For ~5,000 technicians (not all online simultaneously), 2-3 units should suffice.

### Blob Storage Scaling

Blob Storage auto-scales. No manual configuration needed.

**Cost optimization:**
```bash
# Enable lifecycle management (delete blobs older than 365 days)
az storage account management-policy create \
  --account-name attachmentsjob \
  --resource-group retailfixit-demo \
  --policy '{
    "rules": [{
      "name": "cleanup-old-attachments",
      "type": "Lifecycle",
      "definition": {
        "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["job-attachments/"] },
        "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 365 } } }
      }
    }]
  }'
```

## Environment Variables Reference

Create `backend/.env` from this template:

```bash
# Server
PORT=3000
NODE_ENV=development

# Cosmos DB
COSMOS_ENDPOINT=https://retailfixit-cosmos.documents.azure.com:443/
COSMOS_KEY=<primary-key-from-azure-portal>
COSMOS_DATABASE=RetailFixItDB
COSMOS_CONTAINER_JOBS=Jobs
COSMOS_CONTAINER_USERS=Users

# Authentication
JWT_SECRET=<random-256-bit-secret>
JWT_EXPIRES_IN=24h

# Azure SignalR
SIGNALR_CONNECTION_STRING=Endpoint=https://retailfixit-signalr.service.signalr.net;AccessKey=<key>;Version=1.0;

# Azure Blob Storage
STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=attachmentsjob;AccountKey=<key>;EndpointSuffix=core.windows.net
```

**Retrieving secrets from Azure:**
```bash
# Cosmos DB key
az cosmosdb keys list --name retailfixit-cosmos --resource-group retailfixit-demo --query primaryMasterKey -o tsv

# SignalR connection string
az signalr key list --name retailfixit-signalr --resource-group retailfixit-demo --query primaryConnectionString -o tsv

# Storage connection string
az storage account show-connection-string --name attachmentsjob --resource-group retailfixit-demo --query connectionString -o tsv
```

## CI/CD Pipeline (GitHub Actions)

Example workflow for automated deployment:

```yaml
# .github/workflows/deploy.yml
name: Deploy Backend
on:
  push:
    branches: [main]
    paths: [backend/**]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install & Build
        working-directory: backend
        run: |
          npm ci
          npm run build

      - name: Deploy to Azure
        uses: azure/webapps-deploy@v3
        with:
          app-name: retailfixit-api
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: backend/
```

## Resilience & Failure Handling

| Failure Scenario | Mitigation |
|-----------------|-----------|
| Cosmos DB outage | Health check returns 503; mobile reads from SQLite cache |
| SignalR outage | Mobile falls back to 10s polling; no data loss |
| Blob Storage outage | Photo upload fails gracefully; existing SAS URLs cached |
| App Service crash | Auto-restart; multi-instance with autoscale |
| Region outage | Future: Cosmos DB multi-region writes; Azure Front Door for failover |

## Cost Estimate (Development)

| Service | Tier | Estimated Monthly Cost |
|---------|------|----------------------|
| Cosmos DB | Serverless | ~$5-15 (low usage) |
| SignalR | Free | $0 |
| Blob Storage | Standard LRS | ~$1-5 |
| App Service | B1 | ~$13 |
| **Total** | | **~$20-35/month** |

## Cost Estimate (Production, ~1,000 vendors)

| Service | Tier | Estimated Monthly Cost |
|---------|------|----------------------|
| Cosmos DB | Autoscale 400-4000 RU/s | ~$50-200 |
| SignalR | Standard (2 units) | ~$100 |
| Blob Storage | Standard LRS + lifecycle | ~$10-50 |
| App Service | S1 (2-5 instances) | ~$140-350 |
| Application Insights | Basic | ~$10-30 |
| **Total** | | **~$310-730/month** |
