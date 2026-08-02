# Architecture Decision Records (ADRs) & Engineering Tradeoffs

This document records architectural decisions in reverse chronological order (newest first), detailing the context, options considered, decisions made, tradeoffs accepted, and future roadmap.

---

## 1. AI Placement & Strict Boundary Architecture

- **Date**: 2026-08-01
- **Decision**: Restrict AI (LLM) strictly to generating concise natural-language operational summaries (`POST /api/incidents/:id/explain`) from structured facts extracted by backend.
- **Alternatives Considered**:
  - Using LLM for fault localization or boundary prediction.
  - Exposing OpenAI API key directly to frontend browser.
- **Reasoning**: Fault localization requires 100% deterministic graph logic. An LLM can hallucinate false topology boundaries, leading to incorrect field crew dispatch. Restricting LLM to narrative synthesis guarantees mathematical correctness.
- **Tradeoffs**: Narrative text cannot invent new diagnostic insights beyond facts provided in the input prompt.
- **Deterministic Fallback**: If `OPENAI_API_KEY` is missing or LLM call fails/times out (5s limit), system seamlessly returns a structured template summary.

---

## 2. Real-Time Transport: Socket.IO WebSockets vs Polling

- **Date**: 2026-08-01
- **Decision**: Use Socket.IO for server-sent real-time updates (`incident:created`, `incident:updated`, `network:state_changed`).
- **Alternatives Considered**: HTTP Long-Polling, Server-Sent Events (SSE).
- **Reasoning**: Control-room operators working under high pressure require instantaneous feedback when physical outages occur or field repairs are verified. Socket.IO provides automatic reconnection, fallback polling, and rooms out of the box.
- **Tradeoffs**: Slightly higher memory overhead per connected client compared to stateless HTTP polling.

---

## 3. Explainable 7-Factor Confidence Scoring Model (0–100)

- **Date**: 2026-08-01
- **Decision**: Implement a transparent, deterministic 7-factor scoring model that returns both numerical score (`0–100`) and human-readable reasons (`confidenceReasons[]`).
- **Alternatives Considered**: Opaque machine learning probability outputs or arbitrary percentage heuristics.
- **Reasoning**: Control-room operators must understand *why* confidence is high or low (e.g. recorded topology vs MST inference vs silent devices).
- **Tradeoffs**: Weightings (e.g. +40% recorded, +25% upstream live) are fixed domain heuristics requiring manual tuning if network topology characteristics change.

---

## 4. Missing Topology Strategy: MST Geo-Distance Inference

- **Date**: 2026-08-01
- **Decision**: Reconstruct missing parent-child topology links (~60% of DTs) using Euclidean distance MST and line sequence hints, while degrading precision (`EXACT_SPAN` $\rightarrow$ `ESTIMATED_SPAN` $\rightarrow$ `RANGE` $\rightarrow$ `DT_LEVEL`).
- **Alternatives Considered**: Rejecting telemetry from DTs with missing topology records or silently assuming complete topology.
- **Reasoning**: Real-world power grids contain incomplete GIS records. The localization engine must remain functional under partial topology.
- **Tradeoffs**: Inferred tree paths may misattribute parentage if physical lines loop around obstacles or follow non-Euclidean road paths.

---

## 5. Radial Tree Graph Representation (`TopologyIndex`)

- **Date**: 2026-08-01
- **Decision**: Represent physical distribution grid as an immutable directed acyclic tree `TopologyIndex` rooted at Distribution Transformers (`DT_ROOT`).
- **Alternatives Considered**: Full mesh cyclic graph representation or ad-hoc SQL joins.
- **Reasoning**: Low-tension (LT) distribution networks operate physically as radial trees. Tree properties allow $O(V + E)$ BFS/DFS traversal and $O(1)$ subtree pole set lookups.
- **Tradeoffs**: Ring-main feeders or dual-fed tie switches would require dynamic graph cycle breaking.

---

## 6. Database Selection: MongoDB with Mongoose

- **Date**: 2026-08-01
- **Decision**: Use MongoDB 7 as the primary datastore for poles, telemetry events, incidents, and devices.
- **Alternatives Considered**: PostgreSQL with PostGIS.
- **Reasoning**: Telemetry event ingestion and incident timeline audit arrays benefit from MongoDB's flexible document schema and indexed array queries.
- **Tradeoffs**: Lack of multi-table ACID transactions across collections requires careful atomic document updates (`updateOne`).

---

## 7. Technology Stack Selection: TypeScript Monorepo

- **Date**: 2026-08-01
- **Decision**: Build monorepo using npm workspaces (`@pgm/shared`, `@pgm/backend`, `@pgm/frontend`).
- **Alternatives Considered**: Separate independent repositories or Python backend.
- **Reasoning**: End-to-end TypeScript provides complete type safety across API request/response payloads, domain models, and Socket.IO events.

---

## 8. What Was Intentionally Excluded

1. **User Authentication & Role-Based Access Control (RBAC)**: Excluded to keep demo startup frictionless.
2. **Complex Multi-Layer GIS Maps**: Standard Leaflet OSM tile layer with high-performance canvas markers selected instead of heavy ArcGIS servers.
3. **Heavy Message Queues (Kafka / RabbitMQ)**: In-process event handling selected for lightweight single-node deployment simplicity.

---

## 9. What I Would Do With Two More Weeks

1. **Advanced Geo-Spatial Road Routing**: Integrate OSRM or OpenStreetMap road segment data into topology inference so MST links follow physical roads rather than straight Euclidean lines.
2. **Redis Ingestion Queue & Caching**: Add Redis stream processing for telemetry ingestion to scale burst throughput beyond `10,000 msgs/sec`.
3. **Historical Heatmaps & Predictive Maintenance**: Add geospatial heatmap overlays of historical line fault frequency to identify aging conductor spans before failure.

---

## 10. Known Weaknesses & Fragile Areas

1. **Ring-Main / Mesh Tie Switches**: Currently assumes strict radial tree structure. Dual-fed tie switches would require active loop-breaking logic.
2. **Euclidean Distance Inference**: Inferred topology assumes poles close in Euclidean space are connected, which can fail across wide rivers or highway dividers.
3. **Single-Node Ingestion Concurrency**: Heavy concurrent telemetry bursts (>2,000 msgs/sec) on a single Node.js thread can experience Mongoose write lock contention.
