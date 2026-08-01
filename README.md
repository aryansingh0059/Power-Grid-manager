# Power-Grid-Manager

Real-time fault detection and incident management system for the **Karnataka State Power Distribution Board (KSDB)**.

IoT devices mounted on low-tension (LT) poles report whether each pole is energised. This system ingests that telemetry, localises faults to a specific span or asset, raises one incident per physical fault, and guides field crews through a structured ticket workflow — all within two minutes of a fault occurring.

---

## Quick Start (Docker)

```bash
git clone <repo-url>
cd Power-Grid-Manager
cp .env.example .env        # safe defaults — no changes required to run
docker compose up
```

- **Frontend** → http://localhost:3000  
- **Backend API** → http://localhost:4000/api/health  
- **MongoDB** → localhost:27017

The stack seeds itself on first boot.

---

## Local Development (without Docker)

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| MongoDB | ≥ 7 (or Docker for MongoDB only) |

### Setup

```bash
# Install all workspace dependencies
npm install

# Copy environment file
cp .env.example .env

# (Optional) run only MongoDB in Docker
docker compose up mongo -d
```

### Run

```bash
# Start both backend (port 4000) and frontend (port 3000) with hot-reload
npm run dev
```

Or individually:

```bash
npm run dev -w packages/backend
npm run dev -w packages/frontend
```

### Typecheck, Lint, Test

```bash
npm run typecheck   # tsc --noEmit in all packages
npm run lint        # eslint in all packages
npm run test        # vitest run in all packages
npm run format      # prettier --write
```

---

## Repository Structure

```
Power-Grid-Manager/
├── packages/
│   ├── shared/     # TypeScript types shared between backend and frontend
│   ├── backend/    # Node.js · Express · Mongoose
│   └── frontend/   # React · Vite · Tailwind CSS
├── docker-compose.yml
├── .env.example
├── README.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── DEPLOYMENT.md
└── AI-WORKFLOW.md
```

---

## Documentation Index

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component responsibilities |
| [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records (ADRs) |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker deployment and configuration reference |
| [AI-WORKFLOW.md](./AI-WORKFLOW.md) | How and where AI is used; fallback behaviour |

---

## Status

> **Task 1 — Foundation complete.**  
> Fault detection, topology engine, simulator, and operator console are implemented in subsequent tasks.
