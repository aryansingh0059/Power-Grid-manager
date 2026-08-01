import type { TopologySource, LocalizationPrecision } from '@pgm/shared';
import type { TopologyIndex } from '../topology/TopologyIndex';

export interface ConfidenceInput {
  topologySource: TopologySource;
  precision: LocalizationPrecision;
  upstreamPoleId: string | null;
  downstreamPoleId: string | null;
  affectedPoleIds: string[];
  topologyIndex: TopologyIndex;
  poleStateMap: Map<string, boolean | null>;
  isAmbiguous?: boolean;
  scheduleConflict?: boolean;
}

export interface ConfidenceOutput {
  /** Confidence score as an integer percentage from 0 to 100 */
  score: number;
  /** Human-readable explanation reasons driving the score */
  reasons: string[];
}

/**
 * Deterministic Explainable Confidence Calculator.
 *
 * Evaluates 7 explicit evidence components:
 * 1. Topology certainty (recorded vs inferred vs unknown)
 * 2. Upstream pole energization confirmation
 * 3. Downstream pole dark confirmation
 * 4. Subtree telemetry device coverage ratio
 * 5. Legacy firmware penalties (v1.2.x missing dying gasp)
 * 6. Geometric parent ambiguity penalties
 * 7. Schedule conflict evidence
 */
export class ConfidenceCalculator {
  static calculate(input: ConfidenceInput): ConfidenceOutput {
    const {
      topologySource,
      precision,
      upstreamPoleId,
      downstreamPoleId,
      affectedPoleIds,
      topologyIndex,
      poleStateMap,
      isAmbiguous = false,
      scheduleConflict = false,
    } = input;

    let points = 0;
    const reasons: string[] = [];

    // 1. Topology Certainty
    if (topologySource === 'recorded') {
      points += 40;
      reasons.push('Recorded parent-child topology (+40%)');
    } else if (isAmbiguous) {
      points += 15;
      reasons.push('Geographically inferred topology with geometric ambiguity (+15%)');
    } else if (topologySource === 'inferred') {
      points += 26;
      reasons.push('Geographically inferred topology (unambiguous geometry) (+26%)');
    } else {
      points += 10;
      reasons.push('Unknown/missing topology (+10%)');
    }

    // 2. Upstream Pole Confirmation
    if (upstreamPoleId) {
      const upPole = topologyIndex.getPole(upstreamPoleId);
      const upState = poleStateMap.get(upstreamPoleId);

      if (upPole?.deviceId && upState === true) {
        points += 25;
        reasons.push(`Upstream pole ${upstreamPoleId} confirmed energized (+25%)`);
      } else if (!upPole?.deviceId) {
        points += 10;
        reasons.push(`Upstream pole ${upstreamPoleId} lacks telemetry device (+10%)`);
      } else {
        points += 15;
        reasons.push(`Upstream pole ${upstreamPoleId} energized via downstream verification (+15%)`);
      }
    } else if (precision === 'DT_LEVEL') {
      points += 20;
      reasons.push('Root-level Distribution Transformer boundary confirmed (+20%)');
    }

    // 3. Downstream Pole Confirmation
    if (downstreamPoleId) {
      const downPole = topologyIndex.getPole(downstreamPoleId);
      const downState = poleStateMap.get(downstreamPoleId);

      if (downPole?.deviceId && downState === false) {
        points += 20;
        reasons.push(`Downstream pole ${downstreamPoleId} confirmed dark (+20%)`);
      } else if (!downPole?.deviceId) {
        points += 5;
        reasons.push(`Downstream pole ${downstreamPoleId} lacks telemetry device (+5%)`);
      } else {
        points += 10;
        reasons.push(`Downstream pole ${downstreamPoleId} unpowered (+10%)`);
      }
    }

    // 4. Subtree Telemetry Coverage
    let polesWithDevice = 0;
    for (const pId of affectedPoleIds) {
      const pole = topologyIndex.getPole(pId);
      if (pole?.deviceId) polesWithDevice++;
    }

    const coverageRatio = affectedPoleIds.length > 0 ? polesWithDevice / affectedPoleIds.length : 1.0;
    const coveragePct = Math.round(coverageRatio * 100);

    if (coverageRatio >= 0.8) {
      points += 15;
      reasons.push(`High telemetry coverage (${coveragePct}%) across affected poles (+15%)`);
    } else if (coverageRatio >= 0.5) {
      points += 10;
      reasons.push(`Moderate telemetry coverage (${coveragePct}%) across affected poles (+10%)`);
    } else {
      points += 5;
      reasons.push(`Low telemetry coverage (${coveragePct}%) across affected poles (+5%)`);
    }

    // 5. Firmware Penalties (v1.2.x)
    if (downstreamPoleId) {
      const downPole = topologyIndex.getPole(downstreamPoleId);
      if (downPole?.deviceId?.includes('-SD01-') || downPole?.deviceId?.includes('1.2.')) {
        points -= 10;
        reasons.push('Legacy firmware (v1.2.x) on boundary device (-10%)');
      }
    }

    // 6. Ambiguity Penalty
    if (isAmbiguous) {
      points -= 10;
      reasons.push('Geometric ambiguity between candidate parent poles (-10%)');
    }

    // 7. Schedule Conflict Penalty
    if (scheduleConflict) {
      points -= 10;
      reasons.push('Scheduled outage feed conflicts with physical telemetry (-10%)');
    }

    // Clamp score to 5..100
    const finalScore = Math.min(100, Math.max(5, Math.round(points)));

    return {
      score: finalScore,
      reasons,
    };
  }
}
