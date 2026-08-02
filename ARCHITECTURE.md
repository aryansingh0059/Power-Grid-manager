# Architecture

## System Overview

```
IoT Devices / Simulator
        │
        ▼  POST /api/telemetry
┌─────────────────────────────────────────────────────────┐
│  Backend  (Node.js · Express · TypeScript)               │
│                                                          │
│  ┌──────────────┐   ┌──────────────────────────────┐    │
│  │  Ingestion   │──▶│  In-process event queue      │    │
│  │  · dedup     │   │  (Bull or in-memory)          │    │
│  │  · clock skew│   └────────────┬─────────────────┘    │
│  └──────────────┘                │                       │
│                                  ▼                       │
│  ┌───────────────────────────────────────────────────┐   │
│  │  Localization Engine  (pure TypeScript, no I/O)   │   │
│  │  · topology traversal (BFS/DFS on pole tree)      │   │
│  │  · fault boundary detection                       │   │
│  │  · device-anomaly classification                  │   │
│  │  · geo-inference for unknown topology             │   │
│  └─────────────────────┬─────────────────────────────┘   │
│                        │                                  │
│  ┌─────────────────────▼─────────────────────────────┐   │
│  │  Incident Store  (Mongoose)                        │   │
│  │  · group dark poles → one incident                │   │
│  │  · ticket lifecycle state machine                 │   │
│  │  · restoration monitor                            │   │
│  └─────────────────────┬─────────────────────────────┘   │
│                        │                                  │
│  ┌─────────────────────▼─────────────────────────────┐   │
│  │  REST API + Socket.IO  (Express routes)            │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
        │  HTTP + WebSocket
        ▼
┌─────────────────────────────────────────────────────────┐
│  Frontend  (React · Vite · Tailwind · Leaflet)           │
│  · Incident list  · Map  · Ticket drawer  · Simulator UI │
└─────────────────────────────────────────────────────────┘
        │
        ▼
   MongoDB (Mongoose)
```

---

## Package Responsibilities

### `packages/shared`

Pure TypeScript types — no runtime code, no dependencies.  
Defines: `TelemetryMessage`, `PoleRecord`, `IncidentSummary`, `FaultBoundary`, `TicketStatus`, `HealthResponse`, and related enums.

Both backend and frontend import from this package via npm workspaces.

### `packages/backend`

| Module | Responsibility |
|---|---|
| `src/ingestion/` | Accept, deduplicate (`device_id + seq`), and enqueue telemetry messages |
| `src/topology/` | Load pole registry; walk the tree; build parent→children maps |
| `src/localization/` | Core fault-localisation algorithm (deterministic, no I/O) |
| `src/incidents/` | Incident grouping, ticket CRUD, lifecycle state machine |
| `src/scheduler/` | Compare events against the scheduled-outage mock API |
| `src/simulator/` | Synthetic network generator; scenario runner |
| `src/ai/` | Incident narrative generation + deterministic fallback |
| `src/db/` | Mongoose models and seed script |
| `src/routes/` | Express route handlers |
| `src/realtime/` | Socket.IO server; pushes incident updates to the frontend |

### `packages/frontend`

| Component | Responsibility |
|---|---|
| `Map/` | Leaflet map; coloured pole markers; incident overlay |
| `IncidentList/` | Sortable list of active incidents |
| `TicketDrawer/` | Ticket detail, timeline, status transitions |
| `Simulator/` | Operator-facing scenario controls |

---

## Fault Localisation Logic

### Known topology (recorded `parent_pole_id`)

1. Receive dark-pole events for a DT.
2. Build the pole tree for that DT from the registry.
3. Walk the tree from the root (DT breaker) downward.
4. The **fault boundary** is the edge between the deepest energised pole and the first dark pole.
5. All poles in the subtree below that edge are grouped into **one incident**.
6. Confidence: **high** (`topology_source: "recorded"`).

### Unknown topology (missing `parent_pole_id`, ~60% of DTs)

1. Attempt geo-inference: sort poles by `seq_on_line` if available; otherwise infer parent by nearest upstream pole within the same DT using Euclidean distance on lat/lon.
2. Mark the resulting tree `topology_source: "inferred"`.
3. Localise as above.
4. If geo-inference produces ambiguous results (e.g. branching cannot be determined), degrade to **DT-level localisation** — report the fault as "somewhere under DT-xxx" rather than inventing a specific span.
5. Confidence: **medium** (inferred) or **low** (DT-level).

The UI always displays `topology_source` and `confidence` so operators know what to trust.

### Device anomaly detection

Before raising a power-fault ticket, the engine checks:

- Are any poles **downstream** of the reportedly dark pole **still energised**?  
  → If yes, the dark report is a **device/sensor anomaly** — no power-fault ticket raised.

---

## Data Model (key collections)

| Collection | Purpose |
|---|---|
| `poles` | Registry: all poles, coordinates, device IDs, topology links |
| `telemetry_events` | Deduplicated ingested messages (ring-buffer or capped collection) |
| `incidents` | One document per physical fault; holds ticket status, boundary, affected poles |
| `scheduled_outages` | Mock scheduled-outage windows (feeder or DT level) |

---

## Telemetry Deduplication

Primary key: `(device_id, seq)`.  
After a device `boot` event, `seq` resets. The engine treats a post-boot sequence as a new series (detected via seq drop > threshold or explicit `boot` event).  
Clock skew (±90 s) is tolerated by using `seq` for ordering and `ts` only for display.

---

## Restoration Verification

A ticket can only reach `verified` via telemetry — it cannot be manually jumped there.  
The restoration monitor:

1. Watches for `power_restored` events on poles belonging to open incidents.
2. Waits until **all affected poles** report restored (or are confirmed by heartbeat).
3. Automatically transitions the ticket: `resolved → verified → closed`.

If a ticket is marked `resolved` while poles are still dark, it stays in `resolved` until telemetry confirms restoration.

---

## Performance Benchmarks

For complete empirical benchmark results, methodology, and latency profiles across a 3,000-pole network, see [BENCHMARKS.md](file:///d:/Propel/Power-Grid-Manager/BENCHMARKS.md).

Summary of empirical performance targets:
- **Telemetry Ingestion Throughput**: ~453–1,250 msgs/sec
- **Fault Localization Engine (p50)**: < 1.0 ms (0.843 ms observed)
- **Fault Localization Engine (p95)**: < 3.0 ms (1.699 ms observed)
- **Restoration Verification Latency**: ~11.47 ms
- **Incident List REST API Latency**: ~3.50 ms
