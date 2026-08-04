# Architecture Decision Records (ADRs) & Engineering Trade-Offs

This document records architectural decisions in reverse chronological order (newest decision first), detailing context, alternatives considered, decision rationale, accepted trade-offs, documented assumptions, known fragile areas, and roadmap priorities.

---

## 1. Incident Correlation via Deterministic `faultKey` Across Non-Closed Statuses

- **Date**: 2026-08-04
- **Decision**: Assign every localized fault a deterministic `faultKey` (e.g. `DT_FAULT:DT-011`, `SPAN_FAULT:DT-011:P1:P2`, `FEEDER_FAULT:FDR-01`) and query all non-closed tickets (`status: { $ne: 'closed' }`) during correlation.
- **Alternatives Considered**:
  - Querying active tickets using a restricted status list (`['detected', 'acknowledged', 'crew_assigned']`).
  - Allowing multiple open tickets for the same physical location if status reached `resolved`.
- **Why**: When an operator marks a ticket `RESOLVED`, the physical line fault may still be active pending field repair verification. Omitting `resolved` from deduplication caused subsequent localization runs to spawn duplicate incident tickets (`INC-XXXX`) for the same active outage.
- **Trade-Off**: If a new fault occurs on the exact same span before a previous ticket reaches `CLOSED`, the new telemetry correlates into the existing ticket rather than creating a second ticket.

---

## 2. Mandatory Telemetry Restoration Verification (`RESOLVED != VERIFIED`)

- **Date**: 2026-08-03
- **Decision**: Require live telemetry verification (`boot` + `power_restored`) before transitioning tickets to `VERIFIED` and `CLOSED`. Marking a ticket `RESOLVED` by an operator indicates crew repair completion but does not close the ticket.
- **Alternatives Considered**:
  - Automatically setting ticket status to `CLOSED` when an operator clicks "Mark Resolved".
  - Allowing manual operator verification to override live telemetry.
- **Why**: Field crew reports can be premature or inaccurate. Utility control rooms require empirical telemetry proof that physical voltage has been restored across affected downstream poles before closing an incident.
- **Trade-Off**: If telemetry devices are destroyed or uninstrumented (~9% of poles), verification must rely strictly on observable instrumented poles (`deviceId != null`).

---

## 3. Missing Topology Strategy: Minimum Spanning Tree (MST) Geo-Distance Inference

- **Date**: 2026-08-02
- **Decision**: Reconstruct missing parent-child pole relationships (~60% of DTs in KSDB dataset) using Euclidean distance MST and line sequence hints, while degrading precision (`EXACT_SPAN` $\rightarrow$ `ESTIMATED_SPAN` $\rightarrow$ `RANGE` $\rightarrow$ `DT_LEVEL`).
- **Alternatives Considered**:
  - Rejecting telemetry from DTs lacking recorded topology.
  - Silently assuming complete recorded topology for all network assets.
- **Why**: Real utility GIS databases frequently contain incomplete asset records. The localization engine must operate under partial topology while transparently signaling reduced precision to operators.
- **Trade-Off**: Euclidean distance MST assumes spatial proximity correlates with electrical connection, which can misattribute parentage if physical lines loop around obstacles or parallel roads.

---

## 4. Deterministic Graph Traversal over LLM for Fault Localization

- **Date**: 2026-08-01
- **Decision**: Execute fault localization strictly via 100% deterministic BFS/DFS graph algorithms in TypeScript (`LocalizationEngine`). Restrict LLM usage strictly to generating natural-language operator summaries (`POST /api/incidents/:id/explain`).
- **Alternatives Considered**:
  - Feeding raw pole telemetry streams into an LLM to predict fault locations.
  - Using machine learning classification models for boundary isolation.
- **Why**: Electrical distribution grid localization requires mathematical certainty. LLMs can hallucinate false topology boundaries, risking improper crew dispatch and safety hazards. Deterministic tree traversal provides 100% reproducible results in <1.5 ms.
- **Trade-Off**: Deterministic logic requires explicit code handling for every edge case (e.g. dying gasp loss, boot sequence resets, uninstrumented poles).

---

## 5. Radial Tree Graph Representation (`TopologyIndex`)

- **Date**: 2026-08-01
- **Decision**: Model low-tension (LT) distribution networks as directed acyclic tree graphs rooted at Distribution Transformers (`DT_ROOT`).
- **Alternatives Considered**:
  - Full cyclic mesh graph representation.
  - On-the-fly SQL relational joins.
- **Why**: LT power distribution operates physically as radial trees. Tree properties enable $O(V + E)$ BFS/DFS traversal and $O(1)$ precomputed subtree pole lookups.
- **Trade-Off**: Mesh networks or dual-fed tie switches would require dynamic loop-breaking logic.

---

## 6. Hardware Sensor Failure Filtering (`device_anomaly`)

- **Date**: 2026-08-01
- **Decision**: Filter isolated dark device alerts by inspecting downstream child pole states. If any downstream child pole is `ENERGIZED`, physical power must be flowing through the parent pole. The parent alert is tagged `device_anomaly` and suppressed from line-fault creation.
- **Alternatives Considered**:
  - Raising a line-fault ticket for every dark pole report.
  - Ignoring single-device dark alerts entirely.
- **Why**: Hardware sensor failures (blown meter fuses, corrupted board firmware) can cause isolated devices to report dark power when physical voltage is healthy.
- **Trade-Off**: If an entire downstream branch consists of uninstrumented poles, an isolated sensor failure cannot be verified by downstream neighbors.

---

## 7. Socket.IO Real-Time WebSockets with HTTP Fallback

- **Date**: 2026-08-01
- **Decision**: Use Socket.IO for server-sent real-time updates (`incident:created`, `incident:updated`, `incident:verified`, `network:state_changed`).
- **Alternatives Considered**: HTTP short polling, Server-Sent Events (SSE).
- **Why**: Control room operators require immediate visual updates when physical outages occur or field repairs are verified without manual browser refreshes.
- **Trade-Off**: Requires WebSocket connection management and proxying configuration in Nginx.

---

## 8. Database Selection: MongoDB 7 with Mongoose

- **Date**: 2026-08-01
- **Decision**: Store grid assets, telemetry events, incidents, and device hardware records in MongoDB 7.
- **Alternatives Considered**: PostgreSQL with PostGIS, SQLite.
- **Why**: Incident timeline logs and telemetry audit events benefit from document array fields and atomic document updates.
- **Trade-Off**: Relational integrity across collections (e.g. pole to device references) must be maintained in application logic rather than database foreign keys.

---

## Assumptions Made

1. **Radial LT Network Operating Topology**: Assumed low-tension distribution lines operate as strict radial trees without active ring-main ties.
2. **Telemetry Coverage Density**: Assumed ~91% of physical poles are instrumented with IoT telemetry devices, leaving ~9% uninstrumented.
3. **Single Active Fault per Edge**: Assumed a line break de-energizes all downstream poles on that branch until physical repair occurs.
4. **Feeder Maintenance Visibility**: Assumed scheduled feeder outages are registered in `ScheduledOutageModel` prior to execution.

---

## Known Fragile Areas & Limitations

1. **Euclidean MST Inference on Parallel Lines**: For unrecorded DTs, poles located close together in Euclidean space are assumed connected, which can misattribute parentage across parallel streets or physical obstacles.
2. **Synchronous Node.js Ingestion**: High-burst telemetry (>2,000 msgs/sec) processes synchronously on a single Node.js thread, which can create MongoDB write lock queues under heavy load.
3. **Mock Feeder Schedule Feed**: Scheduled outage matching relies on in-database schedule records rather than a live utility SCADA/ERP integration.

---

## Roadmap (With Two More Weeks)

1. **OSRM Road-Network Topology Inference**: Replace Euclidean distance MST with Open Source Routing Machine (OSRM) road network distance so inferred pole paths follow physical road corridors.
2. **MQTT Telemetry Broker & Worker Stream**: Replace HTTP `/api/telemetry` with an EMQX MQTT broker and Redis Stream worker queue to scale ingestion to >20,000 msgs/sec.
3. **Automated Crew Dispatch Integration**: Add GIS routing for field repair crews, calculating shortest path to isolated fault coordinates.
4. **Geospatial Outage Heatmaps**: Add historical outage frequency overlays on the Leaflet map to identify aging conductor spans requiring preventive maintenance.
