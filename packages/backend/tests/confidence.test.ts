import { describe, it, expect } from 'vitest';
import { TopologyIndex } from '../src/topology/TopologyIndex';
import { FIXTURE_POLES } from '../src/topology/fixture';
import { LocalizationEngine } from '../src/localization';
import { TopologyInference } from '../src/topology/TopologyInference';
import type { PoleRecord } from '@pgm/shared';

describe('Explainable Confidence Scoring Model', () => {
  const recordedIndex = TopologyIndex.build(FIXTURE_POLES);

  it('1. Recorded topology with 100% telemetry coverage produces HIGH confidence (~90-100%)', () => {
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true], ['P2', true], ['P3', false], ['P4', false], ['P5', true], ['P6', true],
    ]);

    const faults = LocalizationEngine.localizeDt(recordedIndex, poleStateMap, 'DT1');
    expect(faults).toHaveLength(1);

    const f = faults[0];
    expect(f.confidence).toBeGreaterThanOrEqual(90);
    expect(f.reasons).toContain('Recorded parent-child topology (+40%)');
    expect(f.reasons.some((r) => r.includes('Upstream pole P2 confirmed energized'))).toBe(true);
    expect(f.reasons.some((r) => r.includes('Downstream pole P3 confirmed dark'))).toBe(true);
  });

  it('2. Inferred topology produces LOWER confidence than recorded topology', () => {
    // Recorded DT
    const poleStateMapRecorded = new Map<string, boolean | null>([
      ['P1', true], ['P2', true], ['P3', false], ['P4', false], ['P5', true], ['P6', true],
    ]);
    const recFaults = LocalizationEngine.localizeDt(recordedIndex, poleStateMapRecorded, 'DT1');

    // Unrecorded DT (inferred tree)
    const infPoles: PoleRecord[] = FIXTURE_POLES.map((p) => ({
      ...p,
      parentPoleId: undefined,
      seqOnLine: undefined,
      topologySource: 'unknown' as const,
    }));
    const infResult = TopologyInference.inferDtTopology(infPoles, 12.9716, 77.5946);
    const poleStateMapInferred = new Map<string, boolean | null>([
      ['P1', true], ['P2', true], ['P3', false], ['P4', false], ['P5', false], ['P6', false],
    ]);
    const infFaults = LocalizationEngine.localizeDt(infResult.topologyIndex, poleStateMapInferred, 'DT1');

    expect(recFaults.length).toBeGreaterThan(0);
    expect(infFaults.length).toBeGreaterThan(0);
    expect(recFaults[0].confidence).toBeGreaterThan(infFaults[0].confidence);
    expect(infFaults[0].reasons.some((r) => r.includes('Geographically inferred topology'))).toBe(true);
  });

  it('3. Geometric parent ambiguity DECREASES confidence score further', () => {
    const ambigPoles: PoleRecord[] = [
      { poleId: 'U1', lat: 12.9710, lon: 77.5940, feederId: 'F1', dtId: 'DT-AMB', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U1', topologySource: 'unknown' },
      { poleId: 'U2', lat: 12.9715, lon: 77.5935, feederId: 'F1', dtId: 'DT-AMB', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U2', topologySource: 'unknown' },
      { poleId: 'U3', lat: 12.9715, lon: 77.5945, feederId: 'F1', dtId: 'DT-AMB', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U3', topologySource: 'unknown' },
      { poleId: 'U4', lat: 12.9720, lon: 77.5940, feederId: 'F1', dtId: 'DT-AMB', poleType: 'terminal',     ward: 'W1', pincode: '560001', deviceId: 'DEV-U4', topologySource: 'unknown' },
    ];

    const ambigResult = TopologyInference.inferDtTopology(ambigPoles, 12.9708, 77.5940);
    const poleStateMap = new Map<string, boolean | null>([
      ['U1', true], ['U2', true], ['U4', true], ['U3', false],
    ]);

    const ambigFaults = LocalizationEngine.localizeDt(ambigResult.topologyIndex, poleStateMap, 'DT-AMB');
    expect(ambigFaults).toHaveLength(1);

    const f = ambigFaults[0];
    expect(f.isAmbiguous).toBe(true);
    expect(f.reasons.some((r) => r.includes('Geometric ambiguity'))).toBe(true);
    expect(f.confidence).toBeLessThan(70);
  });

  it('4. Missing sensor at boundary DECREASES confidence score', () => {
    // Downstream pole P3 has NO device
    const noSensorPoles: PoleRecord[] = FIXTURE_POLES.map((p) =>
      p.poleId === 'P3' ? { ...p, deviceId: undefined } : p
    );
    const noSensorIndex = TopologyIndex.build(noSensorPoles);

    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true], ['P2', true], ['P3', null], ['P4', false], ['P5', true], ['P6', true],
    ]);

    const faults = LocalizationEngine.localizeDt(noSensorIndex, poleStateMap, 'DT1');
    expect(faults).toHaveLength(1);

    const f = faults[0];
    expect(f.reasons.some((r) => r.includes('lacks telemetry device'))).toBe(true);
  });
});
