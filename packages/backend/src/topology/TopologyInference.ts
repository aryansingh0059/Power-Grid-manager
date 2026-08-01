import type { PoleRecord } from '@pgm/shared';
import { TopologyIndex } from './TopologyIndex';

export interface InferredEdgeMetadata {
  childId: string;
  parentId: string;
  distanceMeters: number;
  isAmbiguous: boolean;
  confidenceScore: number;
}

export interface InferredTopologyResult {
  topologyIndex: TopologyIndex;
  inferredPoles: PoleRecord[];
  rootPoleId: string;
  ambiguousEdgeCount: number;
  edgeMetadataMap: Map<string, InferredEdgeMetadata>;
}

/**
 * Geographic Topology Inference Engine
 *
 * ## Heuristic
 * Construct a directed Minimum-Spanning-Tree (MST) / Nearest-Upstream-Parent tree
 * rooted at the pole nearest to the Distribution Transformer coordinates.
 *
 * ## Distance Metric
 * Uses Haversine / Euclidean distance between GPS coordinates (lat, lon).
 *
 * ## Ambiguity Criterion
 * If a pole has two or more candidate upstream parents within 15% distance of each other,
 * the edge is flagged as ambiguous (`isAmbiguous: true`).
 *
 * ## Known Failure Modes & Limitations
 * 1. Non-linear routing (e.g. power line follows a road while direct Euclidean path crosses a building).
 * 2. Overlapping parallel LT lines feeding different sub-branches.
 * 3. Physical obstacles forcing zig-zag pole placements.
 * 4. Recommended remediation: Physical GIS survey or line tracing.
 */
export class TopologyInference {
  /**
   * Calculate approximate distance in meters between two lat/lon points.
   */
  static distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Infer tree topology for a set of poles under a DT using geographic proximity.
   */
  static inferDtTopology(
    poles: PoleRecord[],
    dtLat: number,
    dtLon: number
  ): InferredTopologyResult {
    if (poles.length === 0) {
      return {
        topologyIndex: TopologyIndex.build([]),
        inferredPoles: [],
        rootPoleId: '',
        ambiguousEdgeCount: 0,
        edgeMetadataMap: new Map(),
      };
    }

    if (poles.length === 1) {
      const root = {
        ...poles[0],
        parentPoleId: undefined,
        seqOnLine: 1,
        topologySource: 'inferred' as const,
      };
      return {
        topologyIndex: TopologyIndex.build([root]),
        inferredPoles: [root],
        rootPoleId: root.poleId,
        ambiguousEdgeCount: 0,
        edgeMetadataMap: new Map(),
      };
    }

    // 1. Find Root Pole (closest to DT)
    let rootPole = poles[0];
    let minDtDist = TopologyInference.distanceMeters(poles[0].lat, poles[0].lon, dtLat, dtLon);

    for (let i = 1; i < poles.length; i++) {
      const dist = TopologyInference.distanceMeters(poles[i].lat, poles[i].lon, dtLat, dtLon);
      if (dist < minDtDist) {
        minDtDist = dist;
        rootPole = poles[i];
      }
    }

    // 2. Build tree via Kruskal / Prim MST rooted at rootPole
    const connectedPoleIds = new Set<string>([rootPole.poleId]);
    const unconnectedPoles = poles.filter((p) => p.poleId !== rootPole.poleId);

    const inferredParentMap = new Map<string, string>();
    const edgeMetadataMap = new Map<string, InferredEdgeMetadata>();
    let ambiguousEdgeCount = 0;

    while (unconnectedPoles.length > 0) {
      let bestUnconnectedIdx = -1;
      let bestParentId = '';
      let minDistance = Infinity;
      let secondMinDistance = Infinity;

      // Find unconnected pole with shortest distance to ANY already-connected pole
      for (let i = 0; i < unconnectedPoles.length; i++) {
        const target = unconnectedPoles[i];

        let candMinDist = Infinity;
        let candSecondMinDist = Infinity;
        let candParentId = '';

        for (const connId of connectedPoleIds) {
          const connPole = poles.find((p) => p.poleId === connId)!;
          const dist = TopologyInference.distanceMeters(
            target.lat,
            target.lon,
            connPole.lat,
            connPole.lon
          );

          if (dist < candMinDist) {
            candSecondMinDist = candMinDist;
            candMinDist = dist;
            candParentId = connId;
          } else if (dist < candSecondMinDist) {
            candSecondMinDist = dist;
          }
        }

        if (candMinDist < minDistance) {
          minDistance = candMinDist;
          secondMinDistance = candSecondMinDist;
          bestParentId = candParentId;
          bestUnconnectedIdx = i;
        }
      }

      if (bestUnconnectedIdx === -1) break;

      const newlyConnectedPole = unconnectedPoles[bestUnconnectedIdx];
      unconnectedPoles.splice(bestUnconnectedIdx, 1);
      connectedPoleIds.add(newlyConnectedPole.poleId);
      inferredParentMap.set(newlyConnectedPole.poleId, bestParentId);

      // Evaluate geometric ambiguity
      const isAmbiguous =
        secondMinDistance < Infinity &&
        secondMinDistance > 0 &&
        (secondMinDistance - minDistance) / minDistance < 0.15;

      if (isAmbiguous) {
        ambiguousEdgeCount++;
      }

      const confidenceScore = isAmbiguous ? 0.45 : 0.65;

      edgeMetadataMap.set(newlyConnectedPole.poleId, {
        childId: newlyConnectedPole.poleId,
        parentId: bestParentId,
        distanceMeters: Math.round(minDistance),
        isAmbiguous,
        confidenceScore,
      });
    }

    // 3. Construct inferred PoleRecord array
    const inferredPoles: PoleRecord[] = poles.map((p) => {
      const parentId = inferredParentMap.get(p.poleId);
      const edgeMeta = edgeMetadataMap.get(p.poleId);
      return {
        ...p,
        parentPoleId: parentId,
        topologySource: 'inferred' as const,
        isAmbiguous: edgeMeta?.isAmbiguous ?? false,
      };
    });

    const topologyIndex = TopologyIndex.build(inferredPoles);

    return {
      topologyIndex,
      inferredPoles,
      rootPoleId: rootPole.poleId,
      ambiguousEdgeCount,
      edgeMetadataMap,
    };
  }
}
