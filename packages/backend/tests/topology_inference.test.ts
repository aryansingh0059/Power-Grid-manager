import { describe, it, expect } from 'vitest';
import { TopologyInference } from '../src/topology/TopologyInference';
import { LocalizationEngine } from '../src/localization';
import { TopologyIndex } from '../src/topology/TopologyIndex';
import type { PoleRecord } from '@pgm/shared';

describe('Geographic Topology Inference Engine & Missing Topology Strategy', () => {
  it('1. Straightforward geometric line: infers correct tree and returns ESTIMATED_SPAN', () => {
    // Unrecorded poles along a line
    const poles: PoleRecord[] = [
      { poleId: 'U1', lat: 12.9710, lon: 77.5940, feederId: 'F1', dtId: 'DT-UNREC', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U1', topologySource: 'unknown' },
      { poleId: 'U2', lat: 12.9715, lon: 77.5940, feederId: 'F1', dtId: 'DT-UNREC', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U2', topologySource: 'unknown' },
      { poleId: 'U3', lat: 12.9720, lon: 77.5940, feederId: 'F1', dtId: 'DT-UNREC', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U3', topologySource: 'unknown' },
      { poleId: 'U4', lat: 12.9725, lon: 77.5940, feederId: 'F1', dtId: 'DT-UNREC', poleType: 'terminal',     ward: 'W1', pincode: '560001', deviceId: 'DEV-U4', topologySource: 'unknown' },
    ];

    const dtLat = 12.9708;
    const dtLon = 77.5940;

    const result = TopologyInference.inferDtTopology(poles, dtLat, dtLon);
    expect(result.rootPoleId).toBe('U1');
    expect(result.ambiguousEdgeCount).toBe(0);

    // Test localization on inferred tree
    // U1 & U2 ON, U3 & U4 OFF
    const poleStateMap = new Map<string, boolean | null>([
      ['U1', true], ['U2', true], ['U3', false], ['U4', false],
    ]);

    const faults = LocalizationEngine.localizeDt(result.topologyIndex, poleStateMap, 'DT-UNREC');
    expect(faults).toHaveLength(1);

    const f = faults[0];
    expect(f.faultType).toBe('span_fault');
    expect(f.topologySource).toBe('inferred');
    expect(f.precision).toBe('ESTIMATED_SPAN');
    expect(f.upstreamPoleId).toBe('U2');
    expect(f.downstreamPoleId).toBe('U3');
    expect(f.affectedPoleCount).toBe(2);
  });

  it('2. Ambiguous geometry: two candidate parents at equal distances degrades precision to RANGE', () => {
    // U2 and U3 placed symmetrically relative to candidate child U4
    const poles: PoleRecord[] = [
      { poleId: 'U1', lat: 12.9710, lon: 77.5940, feederId: 'F1', dtId: 'DT-AMBIG', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U1', topologySource: 'unknown' },
      { poleId: 'U2', lat: 12.9715, lon: 77.5935, feederId: 'F1', dtId: 'DT-AMBIG', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U2', topologySource: 'unknown' },
      { poleId: 'U3', lat: 12.9715, lon: 77.5945, feederId: 'F1', dtId: 'DT-AMBIG', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-U3', topologySource: 'unknown' },
      { poleId: 'U4', lat: 12.9720, lon: 77.5940, feederId: 'F1', dtId: 'DT-AMBIG', poleType: 'terminal',     ward: 'W1', pincode: '560001', deviceId: 'DEV-U4', topologySource: 'unknown' },
    ];

    const result = TopologyInference.inferDtTopology(poles, 12.9708, 77.5940);
    expect(result.ambiguousEdgeCount).toBeGreaterThan(0);

    const poleStateMap = new Map<string, boolean | null>([
      ['U1', true], ['U2', true], ['U4', true], ['U3', false],
    ]);

    const faults = LocalizationEngine.localizeDt(result.topologyIndex, poleStateMap, 'DT-AMBIG');
    expect(faults).toHaveLength(1);

    const f = faults[0];
    expect(f.topologySource).toBe('inferred');
    expect(f.precision).toBe('RANGE'); // Degraded to RANGE due to ambiguity!
    expect(f.isAmbiguous).toBe(true);
    expect(f.confidence).toBeLessThan(70); // Lower confidence for ambiguous range
  });

  it('3. Missing-device boundary: handles poles without telemetry gracefully', () => {
    const poles: PoleRecord[] = [
      { poleId: 'M1', lat: 12.9710, lon: 77.5940, feederId: 'F1', dtId: 'DT-NODEVICE', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-M1', topologySource: 'unknown' },
      { poleId: 'M2', lat: 12.9715, lon: 77.5940, feederId: 'F1', dtId: 'DT-NODEVICE', poleType: 'distribution', ward: 'W1', pincode: '560001', /* NO device */ topologySource: 'unknown' },
      { poleId: 'M3', lat: 12.9720, lon: 77.5940, feederId: 'F1', dtId: 'DT-NODEVICE', poleType: 'terminal',     ward: 'W1', pincode: '560001', deviceId: 'DEV-M3', topologySource: 'unknown' },
    ];

    const result = TopologyInference.inferDtTopology(poles, 12.9708, 77.5940);

    // M1 ON, M2 no device (null), M3 OFF
    const poleStateMap = new Map<string, boolean | null>([
      ['M1', true],
      ['M2', null],
      ['M3', false],
    ]);

    const faults = LocalizationEngine.localizeDt(result.topologyIndex, poleStateMap, 'DT-NODEVICE');
    expect(faults).toHaveLength(1);
    expect(faults[0].affectedPoleIds).toContain('M3');
  });

  it('4. Exact impossible / All dark under unrecorded DT -> degrades to DT_LEVEL', () => {
    const poles: PoleRecord[] = [
      { poleId: 'D1', lat: 12.9710, lon: 77.5940, feederId: 'F1', dtId: 'DT-ALLDARK', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-D1', topologySource: 'unknown' },
      { poleId: 'D2', lat: 12.9715, lon: 77.5940, feederId: 'F1', dtId: 'DT-ALLDARK', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-D2', topologySource: 'unknown' },
    ];

    const result = TopologyInference.inferDtTopology(poles, 12.9708, 77.5940);

    const poleStateMap = new Map<string, boolean | null>([
      ['D1', false],
      ['D2', false],
    ]);

    const faults = LocalizationEngine.localizeDt(result.topologyIndex, poleStateMap, 'DT-ALLDARK');
    expect(faults).toHaveLength(1);
    expect(faults[0].precision).toBe('DT_LEVEL');
    expect(faults[0].faultType).toBe('dt_fault');
  });

  it('5. Confidence Hierarchy: EXACT_SPAN > ESTIMATED_SPAN > RANGE', () => {
    // Recorded DT (EXACT_SPAN)
    const recPoles: PoleRecord[] = [
      { poleId: 'R1', lat: 12.971, lon: 77.594, feederId: 'F1', dtId: 'DT-REC', seqOnLine: 1, poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-R1', topologySource: 'recorded' },
      { poleId: 'R2', lat: 12.972, lon: 77.594, feederId: 'F1', dtId: 'DT-REC', seqOnLine: 2, parentPoleId: 'R1', poleType: 'terminal', ward: 'W1', pincode: '560001', deviceId: 'DEV-R2', topologySource: 'recorded' },
    ];
    const recIndex = TopologyIndex.build(recPoles);
    const recFaults = LocalizationEngine.localizeDt(recIndex, new Map([['R1', true], ['R2', false]]), 'DT-REC');

    // Inferred DT clear geometry (ESTIMATED_SPAN)
    const infPoles: PoleRecord[] = [
      { poleId: 'I1', lat: 12.971, lon: 77.594, feederId: 'F1', dtId: 'DT-INF', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-I1', topologySource: 'unknown' },
      { poleId: 'I2', lat: 12.972, lon: 77.594, feederId: 'F1', dtId: 'DT-INF', poleType: 'terminal', ward: 'W1', pincode: '560001', deviceId: 'DEV-I2', topologySource: 'unknown' },
    ];
    const infRes = TopologyInference.inferDtTopology(infPoles, 12.9708, 77.5940);
    const infFaults = LocalizationEngine.localizeDt(infRes.topologyIndex, new Map([['I1', true], ['I2', false]]), 'DT-INF');

    expect(recFaults[0].precision).toBe('EXACT_SPAN');
    expect(infFaults[0].precision).toBe('ESTIMATED_SPAN');
    expect(recFaults[0].confidence).toBeGreaterThan(infFaults[0].confidence);
  });
});
