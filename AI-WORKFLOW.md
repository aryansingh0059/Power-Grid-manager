# AI Pair Programming & Workflow Transparency

This document details the AI tools used during the development of **Power Grid Manager (PGM)**, specific tasks delegated, human oversight applied, real examples of AI logic errors and corrections, prompt patterns, and the distinction between AI used to build the product versus AI built into the product runtime.

---

## Development Tools Used

| Tool | Primary Usage Area | Human Review & Control Boundary |
|---|---|---|
| **Antigravity AI Coding Assistant** (Google DeepMind) | Core agentic pairing, test suite construction, refactoring, documentation synthesis | Manual code inspection, algorithmic verification, empirical test suite execution |
| **ChatGPT (GPT-4o)** | Brainstorming topology inference heuristics, edge-case analysis, prompt refinement | Verified against domain physics and tree graph properties |
| **GitHub Copilot** | Inline code completion, TypeScript interface scaffolding | Verified via `tsc --noEmit` and ESLint |

---

## Delegated Tasks vs Direct Human Control

### Tasks Delegated to AI Assistants
- Initial UI layout scaffolding and Leaflet GIS component boilerplate (`packages/frontend`).
- Multi-stage Dockerfile construction and Docker Compose configuration (`docker-compose.yml`).
- Unit and integration test suite boilerplate generation (`packages/backend/tests`).
- Synthetic network generator statistics calculation (`packages/backend/src/generator`).
- Documentation formatting and structural outlines.

### Kept Under Direct Human Architectural Control
- **Fault Localization Logic**: Graph traversal algorithms (`TopologyIndex` & `LocalizationEngine`) were designed and verified deterministically.
- **Incident Deduplication Strategy**: Deterministic `faultKey` assignment and non-closed ticket correlation logic (`status: { $ne: 'closed' }`).
- **Restoration Verification Criteria**: Enforcing strict rules where `RESOLVED !== VERIFIED` and checking observable instrumented poles.
- **Missing Topology MST Policy**: Algorithm design for handling unrecorded DT trees (~60% of network).

---

## Real Examples of AI Errors & Corrections

During development, empirical testing and code review identified three significant AI logic or configuration errors:

### Example 1: Span Fault Simulator Failed for Deep Topology Spans
- **AI Output / Initial Behavior**: Initial simulator code assumed numeric pole sequence ordering (e.g. `P1 → P2`) or fallback to `DT-001`. Attempting to inject faults on valid deeper tree spans (e.g. `P10 → P11` or `P20 → P21`) failed or produced invalid target errors.
- **Why It Was Wrong**: Physical grid LT lines operate as radial trees with branching children, not linear arrays. Checking string pole numbers (`P10 < P11`) violated tree parent-child relationships.
- **How It Was Detected**: Identified during manual simulator testing when selecting arbitrary spans deeper in the network.
- **Correction Applied**: Refactored `FaultSimulator.ts` to perform true parent-child adjacency validation using `parentPoleId` tree lookups, and added `FaultSimulator.getRecommendedDemoTarget()` to select recorded middle-tree targets dynamically.

### Example 2: Duplicate Incident Ticket Creation & Stuck Restoration
- **AI Output / Initial Behavior**: `IncidentService.createOrCorrelateIncident()` queried existing active tickets using `status: { $in: ['detected', 'acknowledged', 'crew_assigned'] }`.
- **Why It Was Wrong**: When an operator marked a ticket `RESOLVED` (repair completed by crew, telemetry verification pending), its status became `resolved`. On subsequent localization runs while the grid remained dark, the engine failed to find an active ticket in `['detected', 'acknowledged', 'crew_assigned']` and **created duplicate incident tickets (`INC-XXXX`) for the same active outage**.
- **How It Was Detected**: Observed during end-to-end fault lifecycle testing when repeated localization calls ran on a `RESOLVED` ticket.
- **Correction Applied**: Updated `createOrCorrelateIncident()` to query **all non-closed tickets** (`status: { $ne: 'closed' }`) and match on deterministic `faultKey` (`DT_FAULT:DT-011`, `SPAN_FAULT:...`).

### Example 3: Frontend Docker Container Healthcheck Failure
- **AI Output / Initial Behavior**: AI generated a Docker healthcheck command in `packages/frontend/Dockerfile` using `wget http://localhost:80/`.
- **Why It Was Wrong**: Inside the Alpine Nginx container, `wget` resolved `localhost` to IPv6 `::1`. Nginx was configured to listen strictly on IPv4 (`0.0.0.0:80`), causing the healthcheck request to fail with `ECONNREFUSED` and marking the frontend container `unhealthy`.
- **How It Was Detected**: Empirical execution of `docker compose ps` showed `frontend (unhealthy)` despite the SPA loading cleanly in host browsers.
- **Correction Applied**: Updated healthcheck command in `frontend/Dockerfile` and `docker-compose.yml` to explicitly target IPv4 loopback: `http://127.0.0.1:80/`.

---

## Code Generation Estimate

- **AI-Assisted Code**: Approximately **60–70%** of initial implementation boilerplate (React components, test fixtures, Mongoose schemas) was generated or scaffolded with AI assistance.
- **Human Review & Verification**: **100%** of core domain logic, graph traversal algorithms, deduplication rules, and restoration verification were manually reviewed, debugged, and verified against empirical Vitest test suites.

---

## Prompt Engineering Patterns

### Pattern 1: Explicit Algorithmic Constraints
```text
"Do NOT use an LLM or machine learning for fault localization, confidence calculation, or restoration verification. Implement a 100% deterministic graph localization engine in TypeScript that traverses tree parent-child edges and isolates the exact live/dark boundary edge (U -> V)."
```

### Pattern 2: Enforcing Domain Physics Invariants
```text
"When an operator marks a ticket RESOLVED, do NOT set the ticket status to CLOSED or assume power is restored. Set status to RESOLVED with verification pending. Require live telemetry (boot + power_restored) to confirm that 100% of observable instrumented poles are energized before transitioning to CLOSED."
```

---

## Verification Methodology

All AI-generated or AI-assisted code changes were validated through a multi-layer verification workflow:

1. **Automated Unit & Integration Tests**: Executed `npx vitest run` (144 tests across 14 test files passing cleanly).
2. **Static Type Checking**: Executed `npm run typecheck` (`tsc --noEmit`) across all monorepo workspaces (`@pgm/shared`, `@pgm/backend`, `@pgm/frontend`).
3. **Container Clean-Start Validation**: Executed `docker compose down -v && docker compose up` to verify zero-configuration container startup and automatic database seeding.
4. **Manual Simulator Scenarios**: Verified end-to-end fault injection, UI real-time Socket.IO updates, and restoration lifecycle in browser.

---

## Product Runtime AI vs Build-Time AI

It is essential to distinguish between AI used during project development and AI operating within the application runtime:

- **AI Used to Build Product**: Antigravity agentic AI assistant used for code generation, test writing, refactoring, and documentation drafting.
- **AI Built Into Product Runtime**: `LLMProvider` service (`POST /api/incidents/:id/explain`). Uses OpenAI `gpt-4o-mini` strictly to synthesize natural-language operator summaries from structured incident facts. **The runtime AI has ZERO influence over fault localization, confidence scoring, or ticket state transitions.** If the OpenAI API key is omitted, system seamlessly uses a deterministic local fallback template.
