import { describe, it, expect, beforeAll } from 'vitest';
import { generateSyntheticNetwork, type SyntheticNetworkDataset } from '../src/generator';

describe('Synthetic Network Generator', () => {
  let dataset: SyntheticNetworkDataset;

  beforeAll(() => {
    dataset = generateSyntheticNetwork({ seed: 20260801 });
  });

  describe('Scale & Scope', () => {
    it('generates between 2,000 and 4,000 poles', () => {
      expect(dataset.departmentPoles.length).toBeGreaterThanOrEqual(2000);
      expect(dataset.departmentPoles.length).toBeLessThanOrEqual(4000);
    });

    it('generates substations, feeders, and DTs', () => {
      expect(dataset.substations.length).toBeGreaterThan(0);
      expect(dataset.feeders.length).toBeGreaterThan(dataset.substations.length);
      expect(dataset.dts.length).toBeGreaterThan(dataset.feeders.length);
    });

    it('matches department pole count to ground truth pole count', () => {
      expect(dataset.departmentPoles.length).toBe(dataset.groundTruthPoles.length);
    });
  });

  describe('Determinism', () => {
    it('produces identical output given the same seed', () => {
      const run1 = generateSyntheticNetwork({ seed: 9999 });
      const run2 = generateSyntheticNetwork({ seed: 9999 });

      expect(run1.stats).toEqual(run2.stats);
      expect(run1.departmentPoles[0]).toEqual(run2.departmentPoles[0]);
      expect(run1.groundTruthPoles[0]).toEqual(run2.groundTruthPoles[0]);
      expect(run1.devices[0]).toEqual(run2.devices[0]);
    });

    it('produces different output given different seeds', () => {
      const run1 = generateSyntheticNetwork({ seed: 1111 });
      const run2 = generateSyntheticNetwork({ seed: 2222 });

      // Coordinates vary with seed
      expect(run1.departmentPoles[0].lat).not.toEqual(run2.departmentPoles[0].lat);
      expect(run1.departmentPoles[0].lon).not.toEqual(run2.departmentPoles[0].lon);
    });
  });

  describe('Tree Topology Invariants', () => {
    it('every pole belongs to exactly 1 valid DT and 1 valid Feeder', () => {
      const validDtIds = new Set(dataset.dts.map((d) => d.dtId));
      const validFeederIds = new Set(dataset.feeders.map((f) => f.feederId));

      for (const pole of dataset.departmentPoles) {
        expect(validDtIds.has(pole.dtId)).toBe(true);
        expect(validFeederIds.has(pole.feederId)).toBe(true);
      }
    });

    it('every pole has at most 1 parent in ground truth', () => {
      for (const pole of dataset.groundTruthPoles) {
        expect(pole.trueParentPoleId === null || typeof pole.trueParentPoleId === 'string').toBe(
          true
        );
      }
    });

    it('contains NO cycles in any DT physical tree (ground truth)', () => {
      const poleMap = new Map(dataset.groundTruthPoles.map((p) => [p.poleId, p]));

      for (const pole of dataset.groundTruthPoles) {
        const visited = new Set<string>([pole.poleId]);
        let curr = pole.trueParentPoleId;

        while (curr !== null) {
          expect(visited.has(curr)).toBe(false); // Cycle detected if true!
          visited.add(curr);
          const parentPole = poleMap.get(curr);
          expect(parentPole).toBeDefined();
          curr = parentPole!.trueParentPoleId;
        }
      }
    });
  });

  describe('Ground Truth vs Department View Separation', () => {
    it('masks parentPoleId and seqOnLine for poles under unrecorded DTs (~60%)', () => {
      const unrecordedDtIds = new Set(
        dataset.dts.filter((d) => !d.hasRecordedTopology).map((d) => d.dtId)
      );
      expect(unrecordedDtIds.size).toBeGreaterThan(0);

      const unrecordedDeptPoles = dataset.departmentPoles.filter((p) =>
        unrecordedDtIds.has(p.dtId)
      );

      for (const pole of unrecordedDeptPoles) {
        expect(pole.parentPoleId).toBeUndefined();
        expect(pole.seqOnLine).toBeUndefined();
        expect(pole.topologySource).toBe('unknown');
      }

      // Crucially, Ground Truth STILL HAS trueParentPoleId for those same poles!
      const unrecordedGtPoles = dataset.groundTruthPoles.filter((p) =>
        unrecordedDtIds.has(p.dtId)
      );

      // Root poles have trueParentPoleId === null, downstream poles have string parent ID
      const nonRootGtPoles = unrecordedGtPoles.filter((p) => p.trueSeqOnLine > 1);
      expect(nonRootGtPoles.length).toBeGreaterThan(0);
      for (const pole of nonRootGtPoles) {
        expect(typeof pole.trueParentPoleId).toBe('string');
        expect(typeof pole.trueSeqOnLine).toBe('number');
      }
    });

    it('retains parentPoleId and seqOnLine for poles under recorded DTs (~40%)', () => {
      const recordedDtIds = new Set(
        dataset.dts.filter((d) => d.hasRecordedTopology).map((d) => d.dtId)
      );
      expect(recordedDtIds.size).toBeGreaterThan(0);

      const recordedDeptPoles = dataset.departmentPoles.filter((p) => recordedDtIds.has(p.dtId));

      for (const pole of recordedDeptPoles) {
        expect(pole.topologySource).toBe('recorded');
        if (pole.seqOnLine && pole.seqOnLine > 1) {
          expect(typeof pole.parentPoleId).toBe('string');
        }
      }
    });
  });

  describe('Statistical Proportions', () => {
    it('approximately 60% of DTs have missing topology', () => {
      const missingPct = dataset.stats.dtsWithMissingTopologyCount / dataset.stats.dtCount;
      expect(missingPct).toBeGreaterThanOrEqual(0.5);
      expect(missingPct).toBeLessThanOrEqual(0.7);
    });

    it('approximately 9% of poles have no device', () => {
      const noDevicePct = dataset.stats.polesWithoutDeviceCount / dataset.stats.poleCount;
      expect(noDevicePct).toBeGreaterThanOrEqual(0.06);
      expect(noDevicePct).toBeLessThanOrEqual(0.12);
    });

    it('approximately 8% of devices use firmware 1.2.x', () => {
      const fw12Pct = dataset.stats.firmware12DeviceCount / dataset.stats.deviceCount;
      expect(fw12Pct).toBeGreaterThanOrEqual(0.05);
      expect(fw12Pct).toBeLessThanOrEqual(0.12);
    });

    it('approximately 3% of poles are missing pincode', () => {
      const missingPincodePct = dataset.stats.missingPincodePoleCount / dataset.stats.poleCount;
      expect(missingPincodePct).toBeGreaterThanOrEqual(0.01);
      expect(missingPincodePct).toBeLessThanOrEqual(0.05);
    });
  });
});
