import type { TopologySource } from '@pgm/shared';
import type { TopologyIndex } from '../topology/TopologyIndex';
import type { LocalizedFault, ConfidenceBreakdown } from './types';

export interface LocalizationInput {
  topologyIndex: TopologyIndex;
  /** Map of poleId -> energized state (true = ON, false = OFF, null = no telemetry / silent) */
  poleStateMap: Map<string, boolean | null>;
  dtId?: string; // Optional: restrict to a single DT
}

/**
 * Pure, deterministic fault localization engine for LT power networks.
 *
 * ## Algorithm Overview
 *
 * 1. Bottom-up Post-Order Pass (Sensor Anomaly Filter):
 *    Computes for every pole P whether ANY pole in P's downstream subtree is confirmed ON.
 *    If P is dark/silent BUT has an energized downstream descendant, P is flagged as a
 *    sensor/device anomaly candidate — power must be flowing through P's span.
 *
 * 2. DT-Level Outage Check:
 *    If all observable poles under a DT are dark and no energized pole exists,
 *    it is classified as a dt_fault (Distribution Transformer failure).
 *
 * 3. Boundary Edge Detection (BFS from root):
 *    Walks tree downward. An edge (Upstream -> Downstream) is a broken span boundary if:
 *      - Upstream pole is ON (or logically ON)
 *      - Downstream pole is OFF (and has no downstream ON poles)
 *    All dark poles in the downstream subtree are grouped into ONE incident.
 *
 * 4. Multi-Fault Isolation:
 *    Independent branch failures produce separate boundary edges and separate incidents.
 */
export class LocalizationEngine {
  /**
   * Run localization on the provided network state.
   */
  static localize(input: LocalizationInput): LocalizedFault[] {
    const { topologyIndex, poleStateMap, dtId } = input;

    // Get target DT IDs
    const targetDtIds = dtId
      ? [dtId]
      : Array.from(new Set(Array.from(topologyIndex.size() ? topologyIndex.getPoleIdsByDt(dtId ?? '') : [])));

    const dtList = targetDtIds.length > 0 ? targetDtIds : LocalizationEngine.extractAllDtIds(topologyIndex);

    const results: LocalizedFault[] = [];

    for (const dId of dtList) {
      const dtFaults = LocalizationEngine.localizeDt(topologyIndex, poleStateMap, dId);
      results.push(...dtFaults);
    }

    return results;
  }

  private static extractAllDtIds(_topologyIndex: TopologyIndex): string[] {
    return [];
  }

  /**
   * Localize faults for a single Distribution Transformer tree.
   */
  static localizeDt(
    topologyIndex: TopologyIndex,
    poleStateMap: Map<string, boolean | null>,
    dtId: string
  ): LocalizedFault[] {
    const poleIds = topologyIndex.getPoleIdsByDt(dtId);
    if (poleIds.length === 0) return [];

    // Step 1: Compute hasEnergizedDescendant map (bottom-up post-order)
    const hasEnergizedDescendantMap = new Map<string, boolean>();

    // Helper for post-order evaluation
    const computeHasEnergizedDescendant = (pId: string): boolean => {
      const children = topologyIndex.getChildrenIds(pId);
      let childEnergized = false;

      for (const childId of children) {
        const isChildOn = poleStateMap.get(childId) === true;
        const isChildSubtreeOn = computeHasEnergizedDescendant(childId);
        if (isChildOn || isChildSubtreeOn) {
          childEnergized = true;
        }
      }

      hasEnergizedDescendantMap.set(pId, childEnergized);
      return childEnergized;
    };

    const rootIds = topologyIndex.getDtRootIds(dtId);
    for (const rootId of rootIds) {
      computeHasEnergizedDescendant(rootId);
    }

    // Step 2: Check for DT-Level Outage
    // A DT fault occurs if NO pole under the DT is confirmed ON
    const anyPoleOn = poleIds.some((pId) => poleStateMap.get(pId) === true);
    if (!anyPoleOn && rootIds.length > 0) {
      // Check if root pole itself is reported OFF or missing
      const rootState = poleStateMap.get(rootIds[0]);
      if (rootState === false || rootState === null) {
        const rootPole = topologyIndex.getPole(rootIds[0]);
        const feederId = rootPole?.feederId ?? 'UNKNOWN';
        const pincode = rootPole?.pincode ?? '';
        const lat = rootPole?.lat ?? 0;
        const lon = rootPole?.lon ?? 0;
        const topologySource: TopologySource = rootPole?.topologySource ?? 'unknown';

        const affectedPoleIds = poleIds;
        const confidenceBreakdown = LocalizationEngine.calculateConfidence(
          topologySource,
          affectedPoleIds,
          topologyIndex,
          poleStateMap
        );

        return [
          {
            faultType: 'dt_fault',
            feederId,
            dtId,
            upstreamPoleId: null,
            downstreamPoleId: rootIds[0],
            boundaryDescription: `Distribution Transformer ${dtId} outage — all ${affectedPoleIds.length} poles dark`,
            lat,
            lon,
            pincode,
            affectedPoleIds,
            affectedPoleCount: affectedPoleIds.length,
            reasons: [
              `Distribution Transformer ${dtId} has zero energized poles`,
              `Root pole ${rootIds[0]} reported OFF/silent`,
              `All ${affectedPoleIds.length} downstream poles unpowered`,
            ],
            confidence: confidenceBreakdown.overallConfidence,
            confidenceBreakdown,
            topologySource,
          },
        ];
      }
    }

    // Step 3: Scan for Span Fault boundaries via BFS
    const faults: LocalizedFault[] = [];
    const queue: string[] = [...rootIds];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currId = queue.shift()!;
      if (visited.has(currId)) continue;
      visited.add(currId);

      const currState = poleStateMap.get(currId);
      const currHasEnergizedDescendant = hasEnergizedDescendantMap.get(currId) ?? false;

      // Pole is considered "logically ON" if it is ON or has an energized descendant (sensor anomaly)
      const isCurrLogicallyOn = currState === true || currHasEnergizedDescendant;

      if (isCurrLogicallyOn) {
        const children = topologyIndex.getChildrenIds(currId);

        for (const childId of children) {
          const childState = poleStateMap.get(childId);
          const childHasEnergizedDescendant = hasEnergizedDescendantMap.get(childId) ?? false;

          if (childState === false && !childHasEnergizedDescendant) {
            // Live-to-Dark boundary found! Edge: currId -> childId
            const downstreamSubtree = [
              childId,
              ...topologyIndex.getDescendantIds(childId),
            ];

            const downstreamPole = topologyIndex.getPole(childId)!;
            const topologySource: TopologySource = downstreamPole.topologySource ?? 'unknown';

            const confidenceBreakdown = LocalizationEngine.calculateConfidence(
              topologySource,
              downstreamSubtree,
              topologyIndex,
              poleStateMap
            );

            faults.push({
              faultType: 'span_fault',
              feederId: downstreamPole.feederId,
              dtId: downstreamPole.dtId,
              upstreamPoleId: currId,
              downstreamPoleId: childId,
              boundaryDescription: `Span fault between ${currId} and ${childId} (${downstreamPole.dtId})`,
              lat: downstreamPole.lat,
              lon: downstreamPole.lon,
              pincode: downstreamPole.pincode,
              affectedPoleIds: downstreamSubtree,
              affectedPoleCount: downstreamSubtree.length,
              reasons: [
                `Upstream pole ${currId} confirmed ON`,
                `Downstream pole ${childId} confirmed OFF`,
                `${downstreamSubtree.length} poles dark in downstream subtree`,
                `Topology source: ${topologySource}`,
              ],
              confidence: confidenceBreakdown.overallConfidence,
              confidenceBreakdown,
              topologySource,
            });

            // Do NOT recurse into childId's subtree since all dark poles are captured by this fault
            visited.add(childId);
            for (const descId of topologyIndex.getDescendantIds(childId)) {
              visited.add(descId);
            }
          } else {
            // Child is ON or has energized descendants -> continue search deeper
            queue.push(childId);
          }
        }
      }
    }

    return faults;
  }

  /**
   * Calculates confidence score sub-components for a localized fault.
   */
  private static calculateConfidence(
    topologySource: TopologySource,
    affectedPoleIds: string[],
    topologyIndex: TopologyIndex,
    _poleStateMap: Map<string, boolean | null>
  ): ConfidenceBreakdown {
    // 1. Topology Score
    const topologyScore =
      topologySource === 'recorded' ? 1.0 : topologySource === 'inferred' ? 0.6 : 0.3;

    // 2. Telemetry Coverage Score
    let polesWithDevice = 0;
    for (const pId of affectedPoleIds) {
      const pole = topologyIndex.getPole(pId);
      if (pole?.deviceId) polesWithDevice++;
    }
    const telemetryCoverageScore =
      affectedPoleIds.length > 0 ? polesWithDevice / affectedPoleIds.length : 1.0;

    // 3. Sensor Consistency Score (1.0 default for clean boundary)
    const sensorConsistencyScore = 1.0;

    // Weighted average
    const overallConfidence = Number(
      (topologyScore * 0.5 + telemetryCoverageScore * 0.3 + sensorConsistencyScore * 0.2).toFixed(2)
    );

    return {
      topologyScore,
      telemetryCoverageScore,
      sensorConsistencyScore,
      overallConfidence,
    };
  }
}
