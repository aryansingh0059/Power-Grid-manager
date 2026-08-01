import type {
  Substation,
  Feeder,
  DistributionTransformer,
  PoleRecord,
  Device,
  ScheduledOutage,
  PoleType,
} from '@pgm/shared';
import { SeededRandom } from './prng';
import type { GroundTruthPole, SyntheticNetworkDataset } from './types';

export interface GeneratorOptions {
  seed?: number;
  substationCount?: number;
  feedersPerSubstation?: number;
  dtsPerFeeder?: number;
  minPolesPerDt?: number;
  maxPolesPerDt?: number;
}

const PINCODES = [
  '560001',
  '560002',
  '560004',
  '560008',
  '560010',
  '560034',
  '560038',
  '560078',
  '560100',
];

const WARDS = [
  'Ward-12 (Rajajinagar)',
  'Ward-44 (Basavanagudi)',
  'Ward-80 (HSR Layout)',
  'Ward-102 (Koramangala)',
  'Ward-150 (Bellandur)',
  'Ward-174 (BTM Layout)',
];

/**
 * Generates a deterministic synthetic power network matching KSDB specifications.
 */
export function generateSyntheticNetwork(
  options: GeneratorOptions = {}
): SyntheticNetworkDataset {
  const seed = options.seed ?? 20260801;
  const rng = new SeededRandom(seed);

  const substationCount = options.substationCount ?? 3;
  const feedersPerSubstation = options.feedersPerSubstation ?? 3; // 9 feeders total
  const dtsPerFeeder = options.dtsPerFeeder ?? 12; // 108 DTs total
  const minPolesPerDt = options.minPolesPerDt ?? 20;
  const maxPolesPerDt = options.maxPolesPerDt ?? 35; // ~3,000 poles total

  const substations: Substation[] = [];
  const feeders: Feeder[] = [];
  const dts: DistributionTransformer[] = [];
  const groundTruthPoles: GroundTruthPole[] = [];
  const departmentPoles: PoleRecord[] = [];
  const devices: Device[] = [];
  const scheduledOutages: ScheduledOutage[] = [];

  // Bounded area around Bengaluru (Lat: 12.910 to 12.990, Lon: 77.550 to 77.650)
  const baseLat = 12.950;
  const baseLon = 77.600;

  let globalPoleSeq = 10000;
  let globalDeviceSeq = 1000;

  // 1. Generate Substations & Feeders
  for (let sIdx = 1; sIdx <= substationCount; sIdx++) {
    const sId = `SUB-${String(sIdx).padStart(2, '0')}`;
    const sLat = baseLat + (sIdx - 2) * 0.03 + rng.float(-0.005, 0.005);
    const sLon = baseLon + (sIdx - 2) * 0.03 + rng.float(-0.005, 0.005);

    substations.push({
      substationId: sId,
      name: `${sId} (Central Substation ${sIdx})`,
      lat: sLat,
      lon: sLon,
    });

    for (let fIdx = 1; fIdx <= feedersPerSubstation; fIdx++) {
      const fNum = (sIdx - 1) * feedersPerSubstation + fIdx;
      const fId = `FDR-${String(fNum).padStart(2, '0')}`;
      feeders.push({
        feederId: fId,
        name: `Feeder ${fNum} (11kV)`,
        substationId: sId,
      });
    }
  }

  // 2. Determine which DTs have recorded topology (~40% recorded, ~60% missing)
  const totalDts = feeders.length * dtsPerFeeder;
  const dtRecordedFlags: boolean[] = [];
  for (let i = 0; i < totalDts; i++) {
    // 40% recorded topology, 60% missing
    dtRecordedFlags.push(i % 10 < 4);
  }
  // Shuffle recorded flags deterministically using rng
  for (let i = dtRecordedFlags.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [dtRecordedFlags[i], dtRecordedFlags[j]] = [dtRecordedFlags[j], dtRecordedFlags[i]];
  }

  let dtGlobalCounter = 0;

  // 3. Generate Distribution Transformers & Radial Pole Trees
  for (const feeder of feeders) {
    for (let dIdx = 1; dIdx <= dtsPerFeeder; dIdx++) {
      dtGlobalCounter++;
      const dtNum = dtGlobalCounter;
      const dtId = `DT-${String(dtNum).padStart(3, '0')}`;
      const hasRecordedTopology = dtRecordedFlags[dtGlobalCounter - 1];

      // Scatter DTs around feeder center
      const dtLat = baseLat + rng.float(-0.04, 0.04);
      const dtLon = baseLon + rng.float(-0.04, 0.04);

      dts.push({
        dtId,
        name: `DT-${dtNum} (${feeder.feederId})`,
        feederId: feeder.feederId,
        lat: dtLat,
        lon: dtLon,
        hasRecordedTopology,
      });

      const ward = rng.pick(WARDS);
      const dtPoleCount = rng.int(minPolesPerDt, maxPolesPerDt);

      // Construct radial tree for this DT
      // P1 (Root Pole directly connected to DT breaker)
      globalPoleSeq++;
      const rootPoleId = `P-${String(globalPoleSeq).padStart(6, '0')}`;

      // Ground truth pole list for this DT
      const dtGtPoles: GroundTruthPole[] = [];

      // Degree/branching helper: store nodes available for parenting downstream poles
      const availableParents: GroundTruthPole[] = [];

      // Create Root Pole
      const rootGtPole: GroundTruthPole = {
        poleId: rootPoleId,
        lat: dtLat + rng.float(-0.0002, 0.0002),
        lon: dtLon + rng.float(-0.0002, 0.0002),
        feederId: feeder.feederId,
        dtId,
        seqOnLine: 1,
        parentPoleId: undefined, // Root has no parent
        trueParentPoleId: null,
        trueSeqOnLine: 1,
        poleType: 'distribution',
        ward,
        pincode: rng.boolean(0.97) ? rng.pick(PINCODES) : '', // ~3% missing pincode
        topologySource: hasRecordedTopology ? 'recorded' : 'unknown',
        energized: true,
      };

      // Handle IoT device assignment (~9% poles have no device)
      if (rng.boolean(0.91)) {
        globalDeviceSeq++;
        const deviceId = `KSPDB-SD${String(feeder.feederId.slice(-2))}-D${dtId.slice(-4)}-${globalDeviceSeq}`;
        const isFw12 = rng.boolean(0.08); // ~8% firmware 1.2.x
        const firmwareVersion = isFw12 ? `1.2.${rng.int(0, 5)}` : `1.4.${rng.int(0, 9)}`;

        rootGtPole.deviceId = deviceId;
        devices.push({
          deviceId,
          poleId: rootPoleId,
          firmwareVersion,
          bootCount: 1,
          isOnline: true,
        });
      }

      dtGtPoles.push(rootGtPole);
      availableParents.push(rootGtPole);

      // Create remaining poles in radial tree structure
      for (let pIdx = 2; pIdx <= dtPoleCount; pIdx++) {
        globalPoleSeq++;
        const poleId = `P-${String(globalPoleSeq).padStart(6, '0')}`;

        // Select parent from existing nodes in the DT tree
        // Prefer leaf nodes or nodes with < 3 children to create a realistic tree structure
        const parent = rng.pick(availableParents);

        // Position offset: step 30m-60m (deg ~ 0.0003 - 0.0006) from parent
        const angle = rng.float(0, 2 * Math.PI);
        const distance = rng.float(0.0003, 0.0006);
        const pLat = Number((parent.lat + Math.sin(angle) * distance).toFixed(6));
        const pLon = Number((parent.lon + Math.cos(angle) * distance).toFixed(6));

        const poleTypes: PoleType[] = ['distribution', 'corner', 'service', 'terminal'];
        const poleType = pIdx === dtPoleCount ? 'terminal' : rng.pick(poleTypes);

        const gtPole: GroundTruthPole = {
          poleId,
          lat: pLat,
          lon: pLon,
          feederId: feeder.feederId,
          dtId,
          seqOnLine: hasRecordedTopology ? pIdx : undefined,
          parentPoleId: hasRecordedTopology ? parent.poleId : undefined,
          trueParentPoleId: parent.poleId,
          trueSeqOnLine: pIdx,
          poleType,
          ward,
          pincode: rng.boolean(0.97) ? parent.pincode || rng.pick(PINCODES) : '',
          topologySource: hasRecordedTopology ? 'recorded' : 'unknown',
          energized: true,
        };

        // Telemetry device assignment (~9% no device)
        if (rng.boolean(0.91)) {
          globalDeviceSeq++;
          const deviceId = `KSPDB-SD${String(feeder.feederId.slice(-2))}-D${dtId.slice(-4)}-${globalDeviceSeq}`;
          const isFw12 = rng.boolean(0.08); // ~8% firmware 1.2
          const firmwareVersion = isFw12 ? `1.2.${rng.int(0, 5)}` : `1.4.${rng.int(0, 9)}`;

          gtPole.deviceId = deviceId;
          devices.push({
            deviceId,
            poleId,
            firmwareVersion,
            bootCount: 1,
            isOnline: true,
          });
        }

        dtGtPoles.push(gtPole);
        availableParents.push(gtPole);
      }

      // Add DT ground truth poles to global collections
      for (const gtPole of dtGtPoles) {
        groundTruthPoles.push(gtPole);

        // Build department view pole: omit parentPoleId and seqOnLine if DT has missing recorded topology
        const deptPole: PoleRecord = {
          poleId: gtPole.poleId,
          lat: gtPole.lat,
          lon: gtPole.lon,
          feederId: gtPole.feederId,
          dtId: gtPole.dtId,
          seqOnLine: hasRecordedTopology ? gtPole.trueSeqOnLine : undefined,
          parentPoleId: hasRecordedTopology ? (gtPole.trueParentPoleId ?? undefined) : undefined,
          poleType: gtPole.poleType,
          ward: gtPole.ward,
          pincode: gtPole.pincode,
          deviceId: gtPole.deviceId,
          topologySource: hasRecordedTopology ? 'recorded' : 'unknown',
          energized: gtPole.energized,
        };
        departmentPoles.push(deptPole);
      }
    }
  }

  // 4. Generate Mock Scheduled Outages
  const sampleFeeders = feeders.slice(0, 3);
  const now = new Date();
  sampleFeeders.forEach((f, idx) => {
    const start = new Date(now.getTime() + (idx * 2 - 1) * 3600 * 1000);
    const end = new Date(start.getTime() + 4 * 3600 * 1000);
    scheduledOutages.push({
      outageId: `OUTAGE-FDR-${idx + 1}`,
      feederId: f.feederId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      description: `Scheduled 11kV Feeder Maintenance for ${f.name}`,
      status: idx === 1 ? 'active' : 'scheduled',
    });
  });

  // Calculate Statistics
  const polesWithoutDeviceCount = departmentPoles.filter((p) => !p.deviceId).length;
  const dtsWithRecordedTopologyCount = dts.filter((d) => d.hasRecordedTopology).length;
  const dtsWithMissingTopologyCount = dts.filter((d) => !d.hasRecordedTopology).length;
  const firmware12DeviceCount = devices.filter((d) => d.firmwareVersion.startsWith('1.2.')).length;
  const missingPincodePoleCount = departmentPoles.filter((p) => !p.pincode).length;

  return {
    substations,
    feeders,
    dts,
    groundTruthPoles,
    departmentPoles,
    devices,
    scheduledOutages,
    stats: {
      substationCount: substations.length,
      feederCount: feeders.length,
      dtCount: dts.length,
      poleCount: departmentPoles.length,
      deviceCount: devices.length,
      polesWithoutDeviceCount,
      dtsWithRecordedTopologyCount,
      dtsWithMissingTopologyCount,
      firmware12DeviceCount,
      missingPincodePoleCount,
    },
  };
}
