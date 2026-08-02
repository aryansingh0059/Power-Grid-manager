# Power Grid Manager (PGM)

> **Real-time IoT Fault Detection & Automated Localization Engine for Electricity Distribution Grids**  
> Developed for the **Karnataka State Power Distribution Board (KSDB)**.

Power Grid Manager ingests live IoT telemetry from low-tension (LT) distribution poles across **3 substations, 9 11kV feeders, and 108 Distribution Transformers (DTs)** (~3,000 poles in Bengaluru). 

Using a **100% deterministic graph localization engine** (no AI involved in fault detection or location), PGM isolates candidate line breaks down to the exact span (`P2 → P3`) or estimated MST range, groups dark downstream poles into a single incident ticket, suppresses false positives from dead hardware sensors, and enforces an operator lifecycle workflow with automated telemetry restoration verification.

---

## 🔗 Live Application & Demo Links

- **Public URL**: `https://power-grid-manager.demo.ksdb.in` *(Placeholder for deployment host)*
- **Interactive Demo Video**: `https://youtube.com/watch?v=pgm-demo-2026` *(Placeholder for video walk-through)*

---

## 🚀 One-Command Docker Startup

Start the complete stack (MongoDB + Backend API + Frontend Console) with a single command:

```bash
git clone https://github.com/aryansingh0059/Power-Grid-manager.git
cd Power-Grid-Manager
docker compose up
```

### Services Access
- **Operator Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend REST API**: [http://localhost:4000/api/health](http://localhost:4000/api/health)
- **MongoDB Instance**: `localhost:27017`

> *Note: Database seeding occurs automatically on boot. No manual migration or hand-edited configuration is required.*

---

## 🎮 5-Minute Reviewer Simulator Walkthrough

1. **Open Operator Dashboard**: Navigate to [http://localhost:3000](http://localhost:3000).
2. **Open Simulator Studio**: Click the amber **`Open Demo Studio`** button on the bottom control bar.
3. **Pick Demo Target**: Click **`Pick Recommended Demo Target`** to automatically load pre-configured parameters (`Upstream: P2`, `Downstream: P3`, `DT: DT1`).
4. **Inject LT Span Fault**:
   - Under the **Span Fault** tab, click **`Inject Span Break (P2 → P3)`**.
   - **Observe live update**: Over Socket.IO, an active `CRITICAL` incident card appears on the left panel, and the dark span edge (`P2 → P3`) highlights on the Leaflet map in red.
5. **Inspect Incident & AI Narrative**:
   - Click the new incident card (`INC-...`) to open the **Incident Detail Drawer**.
   - View the **Deterministic Evidence Breakdown** (`95% confidence`).
   - Click **`Generate AI Operational Summary`** to test the concise natural-language summary feature (with automatic deterministic fallback if no OpenAI API key is set).
6. **Simulate Operator Workflow**:
   - Click **`Acknowledge`** $\rightarrow$ **`Assign Crew`** $\rightarrow$ **`Mark Resolved`**.
   - Observe the mandatory unverified warning banner:  
     *`⚠️ Repair reported, but restoration has not been verified from telemetry.`*
7. **Verify & Close Outage**:
   - Return to the simulator bar and click **`Repair & Restore Grid Power`**.
   - Live restoration telemetry verifies that 100% of affected poles are energized, automatically updating the ticket to **`VERIFIED` $\rightarrow$ `CLOSED`**.

---

## 📚 Documentation Index

| Document | Description |
|---|---|
| 📐 [ARCHITECTURE.md](./ARCHITECTURE.md) | Complete system architecture, Mermaid diagrams, localization algorithms, confidence model, and API table. |
| 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment requirements, Docker configuration, environment variables, and troubleshooting. |
| 🏛️ [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records (ADRs), tradeoffs, known weaknesses, and future roadmap. |
| 📊 [BENCHMARKS.md](./BENCHMARKS.md) | Empirical throughput benchmarks, p50/p95 localization latencies, and verification performance. |
| 🤖 [AI-WORKFLOW.md](./AI-WORKFLOW.md) | AI assistant pairing methodology, prompt engineering, and human-in-the-loop review facts. |

---

## 💻 Local Development Setup (Without Docker)

### Prerequisites
- Node.js $\ge 20.x$
- npm $\ge 10.x$
- MongoDB $\ge 7.x$ running locally on port 27017

```bash
# 1. Install workspace dependencies
npm install

# 2. Build shared workspace types
npm run build -w packages/shared

# 3. Run development servers (Frontend :3000 + Backend :4000)
npm run dev

# 4. Execute test suite
npm run test:core
```
