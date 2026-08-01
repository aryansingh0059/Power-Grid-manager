import type { IIncident } from '../db/models/Incident';

export interface IncidentFacts {
  incidentId: string;
  faultType: string;
  dtId: string;
  feederId: string;
  upstreamPoleId: string | null;
  downstreamPoleId: string | null;
  boundaryDescription: string;
  precision: string;
  topologySource: string;
  affectedPoleCount: number;
  confidence: number;
  reasons: string[];
  pincode: string;
  scheduledOutageId?: string | null;
  status: string;
}

export interface ExplanationResult {
  summary: string;
  providerUsed: 'openai' | 'fallback';
  modelUsed?: string;
  estimatedCostUsd?: number;
}

export class LLMProvider {
  /**
   * Formats a MongoDB Incident document into structured facts.
   */
  static extractFacts(incident: IIncident): IncidentFacts {
    const confScore = Math.round(
      incident.boundary.confidence <= 1
        ? incident.boundary.confidence * 100
        : incident.boundary.confidence
    );

    return {
      incidentId: incident.incidentId,
      faultType: incident.faultType,
      dtId: incident.dtId,
      feederId: incident.feederId,
      upstreamPoleId: incident.boundary.upstreamPoleId ?? null,
      downstreamPoleId: incident.boundary.downstreamPoleId ?? null,
      boundaryDescription: incident.boundary.description,
      precision: incident.boundary.precision ?? 'ESTIMATED_SPAN',
      topologySource: incident.boundary.topologySource,
      affectedPoleCount: incident.affectedPoleIds?.length || incident.affectedPoleCount || 0,
      confidence: confScore,
      reasons: [
        `Topology: ${incident.boundary.topologySource}`,
        `Boundary: ${incident.boundary.description}`,
        `Affected poles: ${incident.affectedPoleIds?.length || 0}`,
      ],
      pincode: incident.pincode,
      scheduledOutageId: incident.scheduledOutageId ?? null,
      status: incident.status,
    };
  }

  /**
   * Generates a deterministic template-based fallback summary from structured facts.
   */
  static generateDeterministicFallback(facts: IncidentFacts): string {
    const isExact = facts.precision === 'EXACT_SPAN';
    const precisionText = isExact
      ? 'confirmed exact recorded topology line span break'
      : 'geographically estimated MST line span break';

    const scheduleText = facts.scheduledOutageId
      ? ` Note: Overlaps with scheduled maintenance outage (${facts.scheduledOutageId}).`
      : '';

    return (
      `CRITICAL INCIDENT SUMMARY (${facts.incidentId}): ` +
      `Detected a ${facts.faultType.replace('_', ' ')} affecting Distribution Transformer ${facts.dtId} (Feeder ${facts.feederId}). ` +
      `Fault boundary localized to ${facts.boundaryDescription} (${precisionText}). ` +
      `Total impact: ${facts.affectedPoleCount} downstream poles de-energized in pincode ${facts.pincode}. ` +
      `Confidence: ${facts.confidence}% derived from ${facts.reasons.join(', ')}.${scheduleText} ` +
      `Recommended Action: Dispatch field line crew to inspect boundary segment.`
    );
  }

  /**
   * Explains an incident using OpenAI API (if OPENAI_API_KEY is set) or falls back to deterministic template.
   */
  static async explainIncident(incident: IIncident): Promise<ExplanationResult> {
    const facts = LLMProvider.extractFacts(incident);
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    if (!apiKey) {
      return {
        summary: LLMProvider.generateDeterministicFallback(facts),
        providerUsed: 'fallback',
        modelUsed: 'deterministic-template',
        estimatedCostUsd: 0,
      };
    }

    try {
      const prompt = `You are a control-room AI assistant for an electricity distribution grid operator working under high pressure.
Synthesize the following structured facts into a concise 3-sentence operational explanation for the operator console.
Do not invent facts or alter confidence/location.

FACTS:
- Ticket ID: ${facts.incidentId}
- Fault Type: ${facts.faultType}
- Location: DT ${facts.dtId}, Feeder ${facts.feederId}, Pincode ${facts.pincode}
- Boundary: ${facts.boundaryDescription} (${facts.precision}, ${facts.topologySource} topology)
- Impact: ${facts.affectedPoleCount} dark poles
- Confidence: ${facts.confidence}% (${facts.reasons.join('; ')})
${facts.scheduledOutageId ? `- Scheduled Outage Match: ${facts.scheduledOutageId}` : ''}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`OpenAI API returned HTTP ${res.status}`);
      }

      const json = (await res.json()) as any;
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response content from LLM provider');
      }

      // Cost estimation for gpt-4o-mini (~$0.15/1M input tokens, ~$0.60/1M output tokens)
      const inputTokens = json.usage?.prompt_tokens ?? 180;
      const outputTokens = json.usage?.completion_tokens ?? 80;
      const estimatedCostUsd = (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.60;

      return {
        summary: content.trim(),
        providerUsed: 'openai',
        modelUsed: model,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      };
    } catch (err: unknown) {
      console.warn('[LLMProvider] LLM call failed or timed out — using deterministic fallback:', (err as Error).message);
      return {
        summary: LLMProvider.generateDeterministicFallback(facts),
        providerUsed: 'fallback',
        modelUsed: 'deterministic-template-fallback',
        estimatedCostUsd: 0,
      };
    }
  }
}
