import type { FaultType, TopologySource, LocalizationPrecision } from '@pgm/shared';

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
  topologySource: TopologySource;
  precision: LocalizationPrecision;
  /** True if parent-child inference encountered geometric ambiguity */
  isAmbiguous?: boolean;
}
