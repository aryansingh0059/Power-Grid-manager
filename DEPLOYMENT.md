# Deployment & Operations Guide

This guide provides instructions for deploying, running, verifying, and troubleshooting the **Power Grid Manager** containerized stack using Docker Compose.

---

## Prerequisites

To run the complete system locally, the host machine requires only:

- **Git** ($\ge 2.30$)
- **Docker Engine** ($\ge 24.0$)
- **Docker Compose** ($\ge 2.20$)

*No local installations of Node.js, npm, MongoDB, or MongoDB Compass are required.*

---

## Local Deployment (Docker Compose)

The primary command to start the entire system (database, backend API, frontend web server, and synthetic network initialization) is:

```bash
git clone https://github.com/aryansingh0059/Power-Grid-manager.git
cd Power-Grid-Manager
docker compose up
```

### Access Endpoints
- **Operator Console (Frontend)**: [http://localhost:3000](http://localhost:3000)
- **Backend API Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **MongoDB Instance**: `localhost:27017`

---

## What Docker Starts

`docker-compose.yml` orchestrates three container services on a shared internal network (`pgm-network`):

1. **`mongo`** (`mongo:7`): Official MongoDB 7 image with volume `mongo_data` mounted at `/data/db`.
2. **`backend`** (`packages/backend/Dockerfile`): Node.js 20 Express REST API and Socket.IO server. Listens on port `4000`.
3. **`frontend`** (`packages/frontend/Dockerfile`): Multi-stage build producing static React SPA assets served by Nginx. Listens on port `80` (mapped to host port `3000`). Reverse-proxies `/api/` and `/socket.io/` requests to `http://backend:4000`.

---

## Automatic Network Initialization

On initial startup, `packages/backend/src/db/seed.ts` automatically detects if MongoDB is empty. If no pole records exist, it seeds the synthetic power network:
- 3 Substations
- 9 Feeders (11kV)
- 108 Distribution Transformers (DTs)
- 2,943 Poles (~9% without devices)
- 2,682 Smart meters & fault indicators

*Idempotency*: Subsequent container restarts detect existing records and skip re-seeding cleanly.

---

## Environment Variables

All environment variables have safe defaults built into `docker-compose.yml`. No manual editing of `.env` is required for evaluation.

| Variable | Service | Required / Optional | Default Value | Purpose |
|---|---|---|---|---|
| `PORT` | backend | Required | `4000` | Backend HTTP API port |
| `NODE_ENV` | backend | Required | `production` | Node.js execution mode |
| `MONGO_URI` | backend | Required | `mongodb://mongo:27017/pgm` | MongoDB connection string |
| `OPENAI_API_KEY` | backend | Optional | `""` | OpenAI API key for operational summaries (degrades to deterministic fallback) |
| `OPENAI_MODEL` | backend | Optional | `gpt-4o-mini` | OpenAI model identifier |
| `VITE_API_BASE_URL` | frontend | Optional | `""` | Base URL for API requests (empty lets Nginx proxy) |

---

## Production Deployment (Optional Cloud Hosting)

- **Frontend Static Host**: Vercel / Netlify / AWS S3 + CloudFront (or containerized Nginx on Render/Fly.io).
- **Backend API Host**: Render / Fly.io / AWS ECS (Node.js container on port 4000).
- **Managed Database**: MongoDB Atlas cluster (MongoDB 7+).

*Note: For public cloud deployments on free-tier services, configure `MONGO_URI` to point to MongoDB Atlas and set `OPENAI_API_KEY` as a secret environment variable.*

---

## Verification & Health Checklist

After running `docker compose up`, verify system health using:

### 1. Check Container Status
```bash
docker compose ps
```
*Expected Status*: All three containers (`mongo`, `backend`, `frontend`) report `STATUS: healthy`.

### 2. Verify Backend API Health
```bash
curl http://localhost:4000/api/health
```
*Expected Output*:
```json
{"success":true,"data":{"status":"ok","db":"connected","polesCount":2943,"dtsCount":108}}
```

### 3. Verify Operator Dashboard
Open `http://localhost:3000` in a browser. Confirm that:
- The top header shows status `LIVE`.
- The Leaflet GIS map renders pole markers across Bengaluru.
- The simulator launcher bar is accessible at the bottom of the screen.

---

## Clean Reset vs Normal Restart

### Normal Restart (Preserves Database Data)
```bash
docker compose down
docker compose up
```

### Clean Slate Reset (Purges Volume & Re-Seeds Database)
To purge existing MongoDB data, force container rebuild, and re-seed synthetic dataset:
```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

---

## Real Troubleshooting & Operational Gotchas

### Issue 1: Frontend Docker Healthcheck IPv6 `localhost` Resolution Failure
- **Symptom**: `http://localhost:3000` loaded cleanly in host browser, but Docker marked `frontend` container as `unhealthy`.
- **Cause**: Inside the Alpine Nginx container, `wget http://localhost:80/` resolved `localhost` to IPv6 `::1`. Nginx was listening exclusively on IPv4 (`0.0.0.0:80`).
- **Fix**: Updated `frontend/Dockerfile` and `docker-compose.yml` healthcheck command to explicitly target IPv4 loopback:
  ```yaml
  healthcheck:
    test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1"]
  ```

### Issue 2: Database Connection Startup Race Condition
- **Symptom**: Backend container crashed on initial boot because MongoDB required 3–5 seconds to initialize data files.
- **Cause**: `depends_on: [mongo]` in Docker Compose without health checks starts containers concurrently.
- **Fix**: Configured `depends_on: { mongo: { condition: service_healthy } }` in `docker-compose.yml` and implemented exponential retry backoff in `packages/backend/src/db/connection.ts`.

### Issue 3: Workspace Type Build Order in Multi-Stage Dockerfile
- **Symptom**: Docker build failed during `npm run build -w packages/frontend` with `Cannot find module '@pgm/shared'`.
- **Cause**: Mono-repo TypeScript dependencies require building `@pgm/shared` declaration files before compiling dependent workspaces.
- **Fix**: Added explicit `RUN npm run build -w packages/shared` step prior to building backend and frontend stages in Dockerfiles.
