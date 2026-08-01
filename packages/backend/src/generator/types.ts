import type {
  Substation,
  Feeder,
  DistributionTransformer,
  PoleRecord,
  Device,
  ScheduledOutage,
} from '@pgm/shared';

/**
 * Ground-truth pole representation used ONLY by the simulator.
 * Holds the actual physical parent and sequence even if the department view / DB
 * masks it as unknown.
 */
export interface GroundTruthPole extends PoleRecord {
  /** The actual physical parent pole ID in the physical tree (null if root of DT). */
  trueParentPoleId: string | null;
  /** The actual physical sequence number on the LT line branch. */
  trueSeqOnLine: number;
}

/**
 * Complete synthetic network dataset generated deterministically.
 */
export interface SyntheticNetworkDataset {
  substations: Substation[];
  feeders: Feeder[];
  dts: DistributionTransformer[];
  /** Ground truth poles — complete physical tree structure for simulator. */
  groundTruthPoles: GroundTruthPole[];
  /** Department view poles — DB records where ~60% of DTs have missing topology. */
  departmentPoles: PoleRecord[];
  devices: Device[];
  scheduledOutages: ScheduledOutage[];
  /** Summary statistics of generated dataset */
  stats: {
    substationCount: number;
    feederCount: number;
    dtCount: number;
    poleCount: number;
    deviceCount: number;
    polesWithoutDeviceCount: number;
    dtsWithRecordedTopologyCount: number;
    dtsWithMissingTopologyCount: number;
    firmware12DeviceCount: number;
    missingPincodePoleCount: number;
  };
}
