# Power Grid Manager (PGM)

Power Grid Manager is a control-room application that ingests pole-level power telemetry and localizes low-tension (LT) distribution network faults to an exact line span, transformer, or feeder while filtering hardware sensor failures and scheduled maintenance outages.

Developed for electricity distribution utilities (demonstrated on Karnataka State Power Distribution Board / KSDB topology specifications for Bengaluru: 3 substations, 9 feeders, 108 Distribution Transformers, and ~3,000 poles).

---

## Live Demo & Links

- **Live Application**: [https://power-grid-manager-frontend.vercel.app/](https://power-grid-manager-frontend.vercel.app/)
- **Demo Video**: [https://youtu.be/Yx-bW1IpISs](https://youtu.be/Yx-bW1IpISs)
- **Repository**: [https://github.com/aryansingh0059/Power-Grid-manager.git](https://github.com/aryansingh0059/Power-Grid-manager.git)

*Note: If accessing a public deployment on a free-tier hosting platform, a cold start delay of 30–60 seconds may occur on initial API request.*

---

## The Problem

Low-tension (LT) distribution networks operate as radial trees under Distribution Transformers (DTs). When a line conductor snaps or trips between two poles:

```
DT (Transformer)
 │
 ├── P1  [LIVE]
 ├── P2  [LIVE]  <-- Fault Boundary (P2 → P3)
 ├── P3  [DARK]
 └── P4  [DARK]
```

All downstream poles lose power while upstream poles remain energized. The goal of this system is to identify the exact live/dark boundary span (`P2 → P3`) immediately from telemetry rather than waiting for manual customer complaint calls and pole-by-pole line walking.

---

## What the System Does

- **Telemetry Ingestion**: Ingests raw HTTP telemetry (`power_lost`, `power_restored`, `boot`, `heartbeat`) with sequence tracking, boot-reset handling, and stale/out-of-order packet suppression.
- **Deterministic Fault Localization**: Traverses tree graph to isolate line breaks down to the specific span (`P2 → P3`), transformer (`DT`), or feeder (`FDR`).
- **Incident Deduplication**: Correlates multiple dark pole alerts from the same outage into a single incident ticket (`faultKey`), preventing ticket duplication.
- **Hardware Sensor Failure Filtering**: Detects isolated dead sensors (`device_anomaly`) when downstream poles report live power, suppressing false line-fault tickets.
- **Scheduled Outage Suppression**: Matches feeder-level outages against active maintenance windows to prevent unnecessary crew dispatch.
- **Missing Topology Strategy**: Uses Minimum Spanning Tree (MST) geo-proximity inference for the ~60% of DTs lacking recorded parent/sequence metadata.
- **Explainable 7-Factor Confidence Model**: Computes a deterministic 0–100 score with human-readable reasoning factors for every incident.
- **Operator Console**: Interactive Leaflet GIS map with dark mode tiles, queue filters, inspector panel, and timeline log.
- **Physical Grid Simulator**: Interactive panel to inject span faults, DT outages, feeder trips, device silences, and physical grid repairs.
- **Telemetry-Based Restoration Verification**: Enforces strict lifecycle rules where marking a ticket `RESOLVED` does not close it until live telemetry confirms electrical power recovery.
- **Optional AI Operational Summaries**: Integrates OpenAI (`gpt-4o-mini`) to generate operator summaries, with a zero-dependency deterministic fallback if no API key is set.

---

## Quick Start (Docker Compose)

The primary method to run the complete system (MongoDB + Backend API + Frontend Console) is Docker Compose:

```bash
git clone https://github.com/aryansingh0059/Power-Grid-manager.git
cd Power-Grid-Manager
docker compose up
```

### Access Endpoints
- **Operator Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend API Health**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **MongoDB**: `localhost:27017`

*Note: Database seeding occurs automatically on initial startup (2,943 poles and 108 DTs). No manual database installation, migrations, or `.env` editing are required.*

---

## Try the Simulator (5-Minute Walkthrough)

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. Click **Open Simulator** on the bottom control bar to open the simulation panel.
3. Click **Pick Recommended Demo Target** to select a valid recorded tree span target.
4. Click **Inject Span Fault**.
5. Observe the new incident card (`INC-XXXX`) appear in the queue and the dark boundary highlight on the Leaflet map in real time over WebSockets.
6. Click the incident card to inspect the deterministic boundary evidence and confidence score.
7. Click **Acknowledge** $\rightarrow$ **Assign Crew** $\rightarrow$ **Mark Resolved**.
8. Notice the timeline warning: `Restoration verification pending`.
9. Click **Repair Fault** in the simulator bar.
10. Live restoration telemetry emits (`boot` + `power_restored`), verifying 100% of observable poles and transitioning the ticket to `VERIFIED` $\rightarrow$ `CLOSED`.

---

## How Localization Works

Fault localization is **100% deterministic** and executed via graph traversal in TypeScript. **No LLM or machine learning is used for fault localization.**

```
Telemetry Stream
  │
  ▼
Ingestion Pipeline (Sequence & Stale Check)
  │
  ▼
Runtime Pole Energization State
  │
  ▼
TopologyIndex (Radial Tree Graph Traversal)
  │
  ▼
LocalizationEngine (Live/Dark Edge Isolation)
  │
  ▼
Incident Correlation (faultKey Deduplication)
  │
  ▼
Operator Console (Socket.IO Real-Time Push)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full algorithmic details and state machine diagrams.

---

## Missing Topology Strategy

In real utility operations, complete GIS records are often unavailable. In the KSDB network dataset, approximately 60% of DTs lack recorded parent-child pole relationships.

- **Recorded Topology (`recorded`)**: Directed graph edges `parentPoleId → child` are stored in registry. Fault pinpointing is exact to span `P2 → P3`.
- **Missing Topology (`inferred`)**: For unrecorded DT trees, PGM constructs an estimated radial tree using Euclidean Minimum Spanning Tree (MST) distance and line sequence hints. Precision degrades gracefully (`EXACT_SPAN` $\rightarrow$ `ESTIMATED_SPAN` $\rightarrow$ `RANGE` $\rightarrow$ `DT_LEVEL`), and confidence scores are reduced accordingly.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Leaflet GIS, Socket.IO Client, Lucide Icons.
- **Backend**: Node.js 20, Express, Socket.IO, Mongoose, Vitest.
- **Database**: MongoDB 7.
- **Containerization**: Docker, Docker Compose, Nginx.
- **AI Integration**: OpenAI API (`gpt-4o-mini`) with local deterministic template fallback.

---

## Repository Structure

```
Power-Grid-Manager/
├── packages/
│   ├── backend/        # Express REST API, Socket.IO, Ingestion & Localization Engine
│   ├── frontend/       # React SPA, Leaflet Map, Simulator Panel, Nginx config
│   └── shared/         # Common TypeScript interfaces and domain schemas
├── docker-compose.yml  # Multi-container orchestration
├── README.md           # Repository overview & quickstart
├── ARCHITECTURE.md     # In-depth technical architecture & algorithms
├── DEPLOYMENT.md       # Docker configuration & operational troubleshooting
├── DECISIONS.md        # Architecture Decision Records (ADRs) & trade-offs
└── AI-WORKFLOW.md      # AI tool usage transparency & error corrections
```

---

## Verification & Testing

The repository contains 144 unit and integration tests across 14 test files:

```bash
# Run core backend and simulator test suite
npm run test:core

# Run type checks across all workspaces
npm run typecheck

# Run full monorepo test suite
npm run test
```

### Measured Performance Benchmarks
- **Telemetry Ingestion Sustained Burst**: 5,000 messages processed in 9.5s (~525 msgs/sec with MongoDB writes).
- **Fault Localization Engine Latency**: p50 = 0.73 ms, p95 = 1.53 ms.
- **Restoration Verification Latency**: 9.95 ms.

---

## Known Limitations

- **Euclidean MST Approximation**: Inferred topology assumes spatial proximity correlates with electrical connection, which can misattribute parentage around physical barriers or parallel roads.
- **Single-Node Event Loop**: Ingestion processes telemetry synchronously on a single Node.js process; production at scale would require an MQTT broker (e.g., EMQX) and Redis stream workers.
- **Single Subdivision Scope**: Currently configured for KSDB Subdivision 04 (~3,000 poles).
- **Mock Scheduled Outage Feed**: Feeder maintenance windows are stored in DB rather than integrated with a live utility ERP/SCADA system.

---

## Documentation Index

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture, data flow, graph algorithms, confidence model, API endpoints |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker Compose instructions, environment variables, Nginx proxying, troubleshooting |
| [DECISIONS.md](./DECISIONS.md) | Architectural Decision Records (ADRs), assumptions, trade-offs, roadmap |
| [AI-WORKFLOW.md](./AI-WORKFLOW.md) | AI coding usage transparency, prompt patterns, human review, AI correction history |

---

## Assessment Scope Clarifications

The following capabilities were intentionally excluded from scope to focus on core fault localization correctness:
- Field crew GPS tracking and automated dispatch routing.
- Multi-tenant authentication and role-based access control (RBAC).
- Long-term historical analytics and predictive degradation modeling.
- Mobile application for field line crews.
