# AI Workflow

## Scope

AI is used for **one purpose only**: generating a human-readable narrative summary of an incident, displayed to the control-room operator.

AI is **not used** for:

- Fault localisation or boundary detection
- Confidence calculation
- Device-anomaly classification
- Restoration verification
- Topology inference
- Any decision that affects ticket creation or status

Those functions are deterministic and testable without an AI provider.

---

## What the AI receives

When an incident is created (or updated with a significant status change), the backend calls the AI summary generator with a structured `IncidentFacts` object:

```typescript
interface IncidentFacts {
  fault_type: FaultType;          // e.g. "span_fault"
  feeder_id: string;
  dt_id: string;
  affected_pole_count: number;
  boundary: FaultBoundary;        // upstream/downstream pole IDs, description
  topology_source: TopologySource;// "recorded" | "inferred" | "unknown"
  confidence: number;             // 0–1
  pincode: string;
  detected_at: string;            // ISO-8601
  scheduled_outage_overlap: boolean;
}
```

The AI receives **only these structured facts** — not raw telemetry, not internal state, not database queries. There is no retrieval-augmented generation (RAG) and no tool use.

---

## Prompt design

```
You are a concise technical writer assisting a power-grid operator.

Given the following incident facts, write a 2–3 sentence summary suitable
for a non-engineer working in a control room. Use plain language. Do not
speculate beyond the facts. If topology is inferred, say so clearly.

Facts:
{JSON.stringify(facts, null, 2)}

Output only the summary text. No markdown, no headers.
```

The prompt is in `packages/backend/src/ai/prompt.ts` and is version-controlled alongside the rest of the code.

---

## Fallback (deterministic template)

If the AI provider is unavailable (no API key, network error, rate limit, or any exception), the system falls back to a template-based summary. The fallback is synchronous, has no external dependencies, and always produces a valid result.

Example fallback output for a span fault:

> Span fault detected on Feeder FDR-07 between poles P-024430 and P-024431 (DT DT-112). 14 downstream poles are currently dark. Fault boundary is based on recorded network topology (high confidence). Pincode: 560100.

The fallback is implemented in `packages/backend/src/ai/fallback.ts`.

---

## API key handling

- `OPENAI_API_KEY` is read from an environment variable on the backend.
- It is **never** sent to the frontend.
- Frontend receives only the generated summary string via the REST API.
- If the key is absent, the fallback runs transparently — the operator sees a summary either way.

---

## Failure modes

| Condition | Behaviour |
|---|---|
| Key not set | Fallback summary used; incident created normally |
| API timeout | Fallback summary used; error logged at `warn` level |
| API rate limit | Fallback used; retry scheduled for next incident |
| API returns unexpected format | Fallback used; raw response logged for debugging |

The application is fully functional without an AI key. A reviewer does not need one to evaluate the system.
