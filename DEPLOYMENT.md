# Deployment & Operations Guide

This document covers local and production container deployment, environment configuration, database seeding, verification steps, clean resets, and troubleshooting based on actual encountered issues.

---

## 1. Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| **Docker Desktop** | $\ge 24.x$ | Recommended for single-command stack deployment |
| **Docker Compose** | $\ge 2.x$ | Included with Docker Desktop |
| **Node.js** *(Optional for host dev)* | $\ge 20.x$ | Node 20 or 24 LTS |
| **MongoDB** *(Optional for host dev)* | $\ge 7.0$ | Running on port 27017 |

---

## 2. Environment Variables & `.env.example`

Copy `.env.example` to `.env` in the root directory before running:

```bash
cp .env.example .env
```

### Environment Configuration Key Reference:

```ini
# Node Environment
NODE_ENV=production

# Server Port Settings
PORT=4000
FRONTEND_PORT=3000

# Database Connection URI
# In Docker Compose, MongoDB service hostname is 'mongo'
MONGO_URI=mongodb://mongo:27017/pgm

# (Optional) OpenAI API Key for Incident Explanation
# If omitted or left empty, system uses deterministic template fallback
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

---

## 3. Deployment Options & Exact Commands

### Option A: Single-Command Docker Compose (Recommended)

To start the complete production stack (MongoDB 7 + Node.js Backend API + Nginx React Frontend):

```bash
git clone https://github.com/aryansingh0059/Power-Grid-manager.git
cd Power-Grid-Manager
docker compose up --build
```

- **Frontend Console**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **MongoDB**: `localhost:27017`

### Option B: Local Host Development (Without Docker)

```bash
# 1. Install workspace dependencies
npm install

# 2. Build shared workspace types
npm run build -w packages/shared

# 3. Start local MongoDB instance (or run mongo in Docker)
docker compose up mongo -d

# 4. Launch backend and frontend development servers with hot-reload
npm run dev
```

---

## 4. Automatic Database Seeding & Clean Reset

### Automatic Seeding:
On startup, `seedDatabaseIfNeeded()` runs automatically. If the database is empty, it seeds ~3,000 poles, 108 DTs, 9 feeders, 3 substations, and associated IoT devices deterministically.

### Clean Data Reset:
To purge database records and force a fresh synthetic grid seed:

```bash
# Docker Compose environment reset:
docker compose down -v
docker compose up

# Host MongoDB environment reset:
npm run seed -w packages/backend
```

---

## 5. Verification & Health Checks

Verify operational status by checking these endpoints:

1. **Backend Health Check**:
   ```bash
   curl http://localhost:4000/api/health
   ```
   *Expected Response*: `{"success": true, "data": {"status": "ok", "mongodb": "connected"}}`

2. **Frontend UI Availability**:
   Open [http://localhost:3000](http://localhost:3000) in browser. Ensure Leaflet map loads Bengaluru poles and top status bar displays `Grid Status: ONLINE`.

3. **Core Correctness Test Suite**:
   ```bash
   npm run test:core
   ```
   *Expected Result*: 126/126 passed cleanly across all 12 test files.

---

## 6. Troubleshooting Encountered Issues

### Issue 1: `TS6059: File ... is not under 'rootDir'` during `npm run build`
- **Cause**: Backend `tsconfig.build.json` mapped `@pgm/shared` directly to source files `../shared/src/index.ts` instead of compiled declarations.
- **Fix**: Update `@pgm/shared` path mapping in `packages/backend/tsconfig.build.json`:
  ```json
  "paths": {
    "@pgm/shared": ["../shared/dist/index.d.ts"]
  }
  ```

### Issue 2: `MongoServerError: E11000 duplicate key error collection: test.devices index: poleId_1`
- **Cause**: Dynamic upsert of telemetry packets from unseeded hardware devices without a `poleId` violated unique index constraints.
- **Fix**: Ensure hardware devices have pre-registered pole IDs or default `poleId` handling during ingestion.

### Issue 3: `Pole validation failed: pincode: Path pincode is required`
- **Cause**: Mongoose `PoleSchema` set `pincode` as required, but synthetic generator allows ~3% missing pincodes (`pincode: ''`).
- **Fix**: Update schema definition in `packages/backend/src/db/models/Pole.ts`:
  ```typescript
  pincode: { type: String, default: '' }
  ```

### Issue 4: Docker Desktop Engine Pipe Connection Error (`open //./pipe/dockerDesktopLinuxEngine`)
- **Cause**: Docker Desktop background daemon is stopped or not running on Windows host.
- **Fix**: Launch Docker Desktop application on Windows before executing `docker compose up`.
