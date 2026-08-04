import type { TopologySource, LocalizationPrecision, ScheduledOutage } from '@pgm/shared';
import type { TopologyIndex } from '../topology/TopologyIndex';
import { TopologyInference, type InferredTopologyResult } from '../topology/TopologyInference';
import { OutageEvaluator } from '../scheduler/OutageEvaluator';
import { ConfidenceCalculator } from './ConfidenceCalculator';
import type { LocalizedFault } from './types';

export interface LocalizationInput {
  topologyIndex: TopologyIndex;
  /** Map of poleId -> energized state (true = ON, false = OFF, null = no telemetry / silent) */
  poleStateMap: Map<string, boolean | null>;
  dtId?: string; // Optional: restrict to a single DT
  /** Optional DT location coordinates for topology inference if unrecorded */
  dtLocationMap?: Map<string, { lat: number; lon: number }>;
  /** Optional scheduled outage records for cross-referencing */
  outages?: ScheduledOutage[];
}

/**
 * Pure, deterministic fault localization engine for LT power networks.
 *
 * ## Precision Hierarchy
 *  - EXACT_SPAN: Verified boundary edge from recorded topology.
 *  - ESTIMATED_SPAN: Geo-inferred boundary edge with clear geometry.
 *  - RANGE: Geo-inferred boundary edge with geometric ambiguity.
 *  - DT_LEVEL: Entire DT outage or topology cannot support span isolation.
 */
export class LocalizationEngine {
  /**
   * Run localization on the provided network state for a single DT or multiple DTs.
   */
  static localizeDt(
    topologyIndex: TopologyIndex,
    poleStateMap: Map<string, boolean | null>,
    dtId: string,
    dtLocationMap?: Map<string, { lat: number; lon: number }>,
    outages?: ScheduledOutage[]
  ): LocalizedFault[] {
    const poleIds = topologyIndex.getPoleIdsByDt(dtId);
    if (poleIds.length === 0) return [];

    const poles = poleIds
      .map((id) => topologyIndex.getPole(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    if (poles.length === 0) return [];

    const firstPole = poles[0];
    const isRecorded = firstPole.topologySource === 'recorded';

    let activeIndex = topologyIndex;
    let inferenceResult: InferredTopologyResult | null = null;
    const topologySource: TopologySource = isRecorded ? 'recorded' : 'inferred';

    // Always run inference on unrecorded DTs to get ambiguity metadata & tree structure
    if (!isRecorded) {
      const dtLoc = dtLocationMap?.get(dtId) ?? { lat: firstPole.lat, lon: firstPole.lon };
      inferenceResult = TopologyInference.inferDtTopology(poles, dtLoc.lat, dtLoc.lon);
      activeIndex = inferenceResult.topologyIndex;
    }

    // Step 1: Compute hasEnergizedDescendant map (bottom-up post-order)
    const hasEnergizedDescendantMap = new Map<string, boolean>();

    const computeHasEnergizedDescendant = (pId: string): boolean => {
      const children = activeIndex.getChildrenIds(pId);
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

    const rootIds = activeIndex.getDtRootIds(dtId);
    for (const rootId of rootIds) {
      computeHasEnergizedDescendant(rootId);
    }

    // Step 2: Check for DT-Level Outage
    const anyPoleOn = poleIds.some((pId) => poleStateMap.get(pId) === true);
    if (!anyPoleOn && rootIds.length > 0) {
      const rootState = poleStateMap.get(rootIds[0]);
      if (rootState === false || rootState === null) {
        const rootPole = activeIndex.getPole(rootIds[0])!;
        const feederId = rootPole.feederId;
        const pincode = rootPole.pincode;
        const lat = Number(
          (poles.reduce((sum, p) => sum + p.lat, 0) / poles.length).toFixed(6)
        );
        const lon = Number(
          (poles.reduce((sum, p) => sum + p.lon, 0) / poles.length).toFixed(6)
        );

        const affectedPoleIds = poleIds;
        const confResult = ConfidenceCalculator.calculate({
          topologySource,
          precision: 'DT_LEVEL',
          upstreamPoleId: null,
          downstreamPoleId: rootIds[0],
          affectedPoleIds,
          topologyIndex: activeIndex,
          poleStateMap,
          isAmbiguous: false,
        });

        const dtFault: LocalizedFault = {
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
          reasons: confResult.reasons,
          confidence: confResult.score,
          topologySource,
          precision: 'DT_LEVEL',
          isAmbiguous: false,
        };

        if (outages && outages.length > 0) {
          const evalRes = OutageEvaluator.evaluateFault(dtFault, outages);
          if (evalRes.isScheduledOutage) {
            return [
              {
                ...dtFault,
                faultType: 'scheduled_outage',
                reasons: [...dtFault.reasons, evalRes.explanation],
              },
            ];
          }
        }

        return [dtFault];
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

      // A pole is "logically ON" if:
      //  - it is confirmed ON (currState === true)
      //  - OR it has an energized downstream descendant (sensor anomaly)
      //  - OR it has no device (currState === null) and is reached from an ON upstream parent!
      const isNoDeviceNoState = currState === null || currState === undefined;
      const isCurrLogicallyOn = currState === true || currHasEnergizedDescendant || isNoDeviceNoState;

      if (isCurrLogicallyOn) {
        const children = activeIndex.getChildrenIds(currId);

        for (const childId of children) {
          const childState = poleStateMap.get(childId);
          const childHasEnergizedDescendant = hasEnergizedDescendantMap.get(childId) ?? false;

          if (childState === false && !childHasEnergizedDescendant) {
            // Live-to-Dark boundary found! Edge: currId -> childId
            const downstreamSubtree = [
              childId,
              ...activeIndex.getDescendantIds(childId),
            ];

            const downstreamPole = activeIndex.getPole(childId)!;

            // Check boundary ambiguity for inferred edges
            const edgeMeta = inferenceResult?.edgeMetadataMap.get(childId);
            const isAmbiguous = downstreamPole.isAmbiguous ?? edgeMeta?.isAmbiguous ?? false;

            let precision: LocalizationPrecision;
            if (topologySource === 'recorded') {
              precision = 'EXACT_SPAN';
            } else if (isAmbiguous) {
              precision = 'RANGE';
            } else {
              precision = 'ESTIMATED_SPAN';
            }

            const confResult = ConfidenceCalculator.calculate({
              topologySource,
              precision,
              upstreamPoleId: currId,
              downstreamPoleId: childId,
              affectedPoleIds: downstreamSubtree,
              topologyIndex: activeIndex,
              poleStateMap,
              isAmbiguous,
            });

            faults.push({
              faultType: 'span_fault',
              feederId: downstreamPole.feederId,
              dtId: downstreamPole.dtId,
              upstreamPoleId: currId,
              downstreamPoleId: childId,
              boundaryDescription:
                precision === 'EXACT_SPAN'
                  ? `Exact span fault between ${currId} and ${childId} (${downstreamPole.dtId})`
                  : precision === 'ESTIMATED_SPAN'
                  ? `Estimated span fault between ${currId} and ${childId} (${downstreamPole.dtId})`
                  : `Likely fault range around segment ${currId} - ${childId} (${downstreamPole.dtId})`,
              lat: downstreamPole.lat,
              lon: downstreamPole.lon,
              pincode: downstreamPole.pincode,
              affectedPoleIds: downstreamSubtree,
              affectedPoleCount: downstreamSubtree.length,
              reasons: confResult.reasons,
              confidence: confResult.score,
              topologySource,
              precision,
              isAmbiguous,
            });

            // Do NOT recurse into childId's subtree
            visited.add(childId);
            for (const descId of activeIndex.getDescendantIds(childId)) {
              visited.add(descId);
            }
          } else {
            queue.push(childId);
          }
        }
      }
    }

    if (outages && outages.length > 0) {
      return faults.map((f) => {
        const evalRes = OutageEvaluator.evaluateFault(f, outages);
        if (evalRes.isScheduledOutage) {
          return {
            ...f,
            faultType: 'scheduled_outage',
            reasons: [...f.reasons, evalRes.explanation],
          };
        } else if (evalRes.conflictDetected) {
          return {
            ...f,
            reasons: [...f.reasons, evalRes.explanation],
          };
        }
        return f;
      });
    }

    return faults;
  }

}

