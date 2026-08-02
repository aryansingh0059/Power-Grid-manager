# AI Pair Programming & Workflow Transparency

This document records the exact role, tool usage, prompt patterns, and human oversight applied during the development of Power Grid Manager (PGM).

---

## 1. Development Tools & Infrastructure

- **Primary AI Pairing Agent**: Antigravity AI Coding Assistant (Google DeepMind Advanced Agentic Coding team).
- **Core Stack**: TypeScript 5.5, Node.js 20, Express, MongoDB 7 / Mongoose, React 18, Vite, Tailwind CSS, Leaflet GIS, Socket.IO.
- **Testing & Verification Tools**: Vitest test runner, ESLint, TypeScript `tsc --noEmit`, Docker Compose.

---

## 2. Delegation & Breakdown of Responsibilities

| Subsystem / Feature Area | Implementation Responsibilities | Primary Verification Method |
|---|---|---|
| **Domain Model & Data Schemas** | Generator & Mongoose models constructed based on domain specs | Vitest schema tests & seed verification |
| **Deterministic Localization Engine** | BFS/DFS radial tree traversal algorithm implemented | 50 topology unit tests (`localization.test.ts`) |
| **Topology Inference (MST)** | Nearest upstream parent MST distance inference algorithm | 5 topology inference tests |
| **Explainable Confidence Model** | 7-factor scoring calculator (`0–100`) + human-readable reasons | 4 confidence calculator unit tests |
| **Telemetry Ingestion Pipeline** | Deduplication, boot sequence reset, stale event filter | 12 ingestion unit tests (`ingestion.test.ts`) |
| **Fault Simulator & Scenario Panel** | Physical tree propagation, firmware 1.2 silence, packet loss | 3 end-to-end simulator tests |
| **React Operator Dashboard** | Control room layout, Leaflet map canvas, unverified warning | Vite production build & browser testing |
| **AI Explanation & Fallback** | `LLMProvider` OpenAI API integration + deterministic fallback | 3 AI summary tests (`ai_summary.test.ts`) |

---

## 3. Human Oversight & Examples of AI Corrections

Throughout development, automated test failures and architectural bounds required active review and prompt correction:

### Example 1: TypeScript `rootDir` Compiler Error (`TS6059`)
- **Initial Issue**: `npm run build` failed because `packages/backend/tsconfig.build.json` mapped `@pgm/shared` directly to source TypeScript files `../shared/src/index.ts`.
- **Correction Applied**: Updated path mapping in `tsconfig.build.json` to point to compiled declaration output:
  ```json
  "paths": {
    "@pgm/shared": ["../shared/dist/index.d.ts"]
  }
  ```

### Example 2: Schema Validation Failure on Missing Pincodes
- **Initial Issue**: Mongoose schema marked `pincode` as `required: true`, causing insertion failures when synthetic generator produced ~3% missing pincodes (`pincode: ''`).
- **Correction Applied**: Updated `PoleSchema` in `Pole.ts` to allow empty strings: `pincode: { type: String, default: '' }`.

### Example 3: Duplicate Key Error During Telemetry Ingestion
- **Initial Issue**: Mongoose upsert of telemetry from unseeded devices caused duplicate key collisions on `poleId_1: null`.
- **Correction Applied**: Ensured device registration and sequence deduplication handle unseeded hardware devices safely without schema index violations.

---

## 4. Code Generation Metrics

- **Estimated AI-Generated Code**: **~85%** (Generated via pair-programming prompts).
- **Human Architectural Oversight & Verification**: **100%** (Every code edit was verified against empirical Vitest test suites, ESLint, TypeScript typecheck, and Vite production builds).

---

## 5. Prompts & Session Excerpts Reference

### Key Invariant Prompt Example:
> *"Do NOT use an LLM for fault localization, confidence calculation, sensor-failure classification, restoration verification, or topology traversal. Implement a 100% deterministic graph localization engine in TypeScript."*

### Restoration Verification Rule Prompt Example:
> *"When 'Mark Resolved' is used while telemetry still indicates outage, clearly show: 'Repair reported, but restoration has not been verified from telemetry.' Do not let the UI imply that clicking resolved restores power."*
