import type { FaultType, TopologySource } from '@pgm/shared';

export interface ConfidenceBreakdown {
  /** 0–1 score for topology certainty ('recorded' = 1.0, 'inferred' = 0.6, 'unknown' = 0.3) */
  topologyScore: number;
  /** 0–1 score for telemetry coverage (proportion of affected poles with working devices) */
  telemetryCoverageScore: number;
  /** 0–1 score for sensor consistency (absence of contradictory downstream live reports) */
  sensorConsistencyScore: number;
  /** Overall combined confidence (weighted average) */
  overallConfidence: number;
}

export interface LocalizedFault {
  faultType: FaultType;
  feederId: string;
  dtId: string;
  upstreamPoleId: string | null;
  downstreamPoleId: string | null;
  boundaryDescription: string;
  lat: number;
  lon: number;
  pincode: string;
  affectedPoleIds: string[];
  affectedPoleCount: number;
  reasons: string[];
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  topologySource: TopologySource;
}
