# Architecture Decision Records

---

## ADR-001 — npm workspaces monorepo (no Turborepo/Lerna)

**Status:** Accepted

**Context:** A monorepo is needed for frontend + backend + shared types. Several build orchestration tools exist (Turborepo, Nx, Lerna).

**Decision:** Use npm workspaces only. No additional build orchestration layer.

**Rationale:** npm workspaces give us symlinked packages and workspace-aware `npm run` commands with no extra tooling. Turborepo's caching is valuable at scale but adds a dependency and conceptual overhead that does not pay off at this project size. The build is simple enough (`build shared → build backend → build frontend`) that a shell sequence in the root `package.json` is sufficient and readable.

---

## ADR-002 — Vitest for backend tests (not Jest)

**Status:** Accepted

**Context:** Need a TypeScript-capable test runner for the backend.

**Decision:** Vitest.

**Rationale:** Vitest has native TypeScript support via its built-in transformer (no `ts-jest` config needed), is compatible with the Jest assertion API, and starts faster. For a Node.js backend with no browser-specific code, Vitest is straightforward. If the project had existed on Jest, we would have stayed with Jest.

---

## ADR-003 — In-process event queue (no Redis/BullMQ in Task 1)

**Status:** Pending revision

**Context:** Telemetry ingestion needs a queue to absorb bursts (5,000 msg/10 s) and decouple ingestion from localisation.

**Decision (current):** Start with an in-process async queue. Add Redis/BullMQ only if benchmarks show it is needed.

**Rationale:** Redis is an additional infrastructure component. The performance target (≥500 msg/s sustained) should be achievable in-process on a single Node.js instance. We will benchmark in Task 3 (ingestion) before adding infrastructure. If horizontal scaling becomes a requirement, BullMQ with Redis is a drop-in replacement.

**Risk:** If the process restarts, queued-but-unprocessed messages are lost. Mitigated by at-least-once delivery from devices (they will retry).

---

## ADR-004 — Shared types imported via relative path in dev, workspace in production

**Status:** Accepted

**Context:** The shared package needs to be compiled before backend/frontend can import from it. During dev, `ts-node-dev` transpiles TypeScript directly, so compiled JS is not needed.

**Decision:** `health.ts` imports shared types with a direct relative path (`../../shared/src/index`) for dev. The shared package is built before backend in the Docker image. In a future task, once the workspace import chain is fully established, this will be replaced with `@pgm/shared` and `tsconfig-paths`.

**Note:** This is a pragmatic shortcut for Task 1. It is documented here so it is not forgotten.

---

## ADR-005 — Fault localisation is deterministic (no ML/LLM)

**Status:** Accepted

**Context:** Fault localisation requires correctness, explainability, and offline operation.

**Decision:** All fault localisation, confidence scoring, device-anomaly detection, and restoration verification are implemented as deterministic TypeScript functions with no external dependencies.

**Rationale:** A model that produces a "probably a span fault" with no explanation is not acceptable in a safety-adjacent operational tool. Deterministic algorithms are testable, explainable, and do not depend on API availability. An LLM is used only for human-readable narrative summaries, not for any decision that affects ticket creation or classification.

---

## ADR-006 — Unknown topology is a first-class condition

**Status:** Accepted

**Context:** ~60% of DTs are missing `parent_pole_id` and `seq_on_line`.

**Decision:** The system has two explicit code paths: `recorded` topology and `inferred` topology. A third path (`dt_level`) is used when inference is not confident enough to name a specific span. The UI always shows `topology_source` and `confidence`. No path silently presents inferred data as recorded data.

---

## ADR-007 — Backend starts even if MongoDB is unavailable

**Status:** Accepted

**Context:** In Docker, MongoDB may not be ready when the backend container starts despite the `depends_on: condition: service_healthy` guard.

**Decision:** The backend catches the initial connection error, logs a warning, and starts the HTTP server anyway. The health endpoint reports `db: "disconnected"`. Mongoose retries the connection automatically. This prevents a hard crash loop and makes the system observable during startup.

---

## ADR-008 — Single nginx container for the frontend

**Status:** Accepted

**Context:** The compiled React app is a static bundle.

**Decision:** Serve it from `nginx:alpine`. The nginx config reverse-proxies `/api/*` to the backend, mirroring the Vite dev proxy. No Node.js in the production frontend container.

**Rationale:** Simpler, smaller image, and separates concerns cleanly.
