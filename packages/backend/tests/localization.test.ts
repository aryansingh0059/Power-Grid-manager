import { describe, it, expect } from 'vitest';
import { TopologyIndex } from '../src/topology/TopologyIndex';
import { FIXTURE_POLES } from '../src/topology/fixture';
import { LocalizationEngine } from '../src/localization';
import type { PoleRecord } from '@pgm/shared';

/**
 * Fixture Topology Reference:
 *
 *   DT1
 *   └── P1 (root)
 *       └── P2
 *           ├── P3
 *           │   └── P4 (leaf)
 *           └── P5
 *               └── P6 (leaf)
 */

describe('Deterministic Fault Localization Engine', () => {
  const fixtureIndex = TopologyIndex.build(FIXTURE_POLES);

  it('1. Simple line fault: P1 ON, P2 ON, P3 OFF, P4 OFF -> Boundary P2 -> P3', () => {
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true],
      ['P2', true],
      ['P3', false],
      ['P4', false],
      ['P5', true],
      ['P6', true],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    expect(faults).toHaveLength(1);
    const f = faults[0];
    expect(f.faultType).toBe('span_fault');
    expect(f.upstreamPoleId).toBe('P2');
    expect(f.downstreamPoleId).toBe('P3');
    expect(f.affectedPoleCount).toBe(2);
    expect(f.affectedPoleIds).toEqual(['P3', 'P4']);
    expect(f.topologySource).toBe('recorded');
    expect(f.confidence).toBeGreaterThan(0.5);
  });

  it('2. Branch fault: Branch 2 (P5->P6) dark while Branch 1 (P3->P4) stays live', () => {
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true],
      ['P2', true],
      ['P3', true],
      ['P4', true],
      ['P5', false],
      ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    expect(faults).toHaveLength(1);
    const f = faults[0];
    expect(f.faultType).toBe('span_fault');
    expect(f.upstreamPoleId).toBe('P2');
    expect(f.downstreamPoleId).toBe('P5');
    expect(f.affectedPoleCount).toBe(2);
    expect(f.affectedPoleIds).toEqual(['P5', 'P6']);
  });

  it('3. Fault near DT (Root Fault): P1 OFF, P2-P6 OFF -> DT-level outage', () => {
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', false],
      ['P2', false],
      ['P3', false],
      ['P4', false],
      ['P5', false],
      ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    expect(faults).toHaveLength(1);
    const f = faults[0];
    expect(f.faultType).toBe('dt_fault');
    expect(f.upstreamPoleId).toBeNull();
    expect(f.downstreamPoleId).toBe('P1');
    expect(f.affectedPoleCount).toBe(6);
  });

  it('4. Many downstream dark poles -> grouped into EXACTLY ONE incident', () => {
    // Construct a line with 10 poles
    const linePoles: PoleRecord[] = [];
    for (let i = 1; i <= 10; i++) {
      linePoles.push({
        poleId: `LINE-${i}`,
        lat: 12.9 + i * 0.001,
        lon: 77.5,
        feederId: 'F1',
        dtId: 'DT-LONG',
        seqOnLine: i,
        parentPoleId: i === 1 ? undefined : `LINE-${i - 1}`,
        poleType: 'distribution',
        ward: 'Ward-1',
        pincode: '560001',
        deviceId: `DEV-${i}`,
        topologySource: 'recorded',
      });
    }

    const longIndex = TopologyIndex.build(linePoles);

    // LINE-1 and LINE-2 are ON. LINE-3 to LINE-10 are OFF.
    const poleStateMap = new Map<string, boolean | null>();
    poleStateMap.set('LINE-1', true);
    poleStateMap.set('LINE-2', true);
    for (let i = 3; i <= 10; i++) {
      poleStateMap.set(`LINE-${i}`, false);
    }

    const faults = LocalizationEngine.localizeDt(longIndex, poleStateMap, 'DT-LONG');

    // MUST produce exactly 1 incident, NOT 8 separate incidents!
    expect(faults).toHaveLength(1);
    expect(faults[0].upstreamPoleId).toBe('LINE-2');
    expect(faults[0].downstreamPoleId).toBe('LINE-3');
    expect(faults[0].affectedPoleCount).toBe(8); // LINE-3 through LINE-10
  });

  it('5. Two independent branch faults under same DT -> EXACTLY TWO incidents', () => {
    // Both Branch 1 (P3->P4) and Branch 2 (P5->P6) are broken simultaneously
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true],
      ['P2', true],
      ['P3', false],
      ['P4', false],
      ['P5', false],
      ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    expect(faults).toHaveLength(2);
    const downstreamIds = faults.map((f) => f.downstreamPoleId).sort();
    expect(downstreamIds).toEqual(['P3', 'P5']);
  });

  it('6. Three simultaneous independent faults across DTs -> EXACTLY THREE incidents', () => {
    // DT1 has fault P2->P3
    // DT2 has fault Q1->Q2
    // DT3 has dt_fault
    const multiPoles: PoleRecord[] = [
      ...FIXTURE_POLES,
      {
        poleId: 'Q1', lat: 13.0, lon: 77.6, feederId: 'F2', dtId: 'DT2',
        seqOnLine: 1, parentPoleId: undefined, poleType: 'distribution', ward: 'W2', pincode: '560002', deviceId: 'DEV-Q1', topologySource: 'recorded',
      },
      {
        poleId: 'Q2', lat: 13.001, lon: 77.601, feederId: 'F2', dtId: 'DT2',
        seqOnLine: 2, parentPoleId: 'Q1', poleType: 'terminal', ward: 'W2', pincode: '560002', deviceId: 'DEV-Q2', topologySource: 'recorded',
      },
      {
        poleId: 'R1', lat: 13.1, lon: 77.7, feederId: 'F3', dtId: 'DT3',
        seqOnLine: 1, parentPoleId: undefined, poleType: 'distribution', ward: 'W3', pincode: '560003', deviceId: 'DEV-R1', topologySource: 'recorded',
      },
    ];

    const multiIndex = TopologyIndex.build(multiPoles);

    const poleStateMap = new Map<string, boolean | null>([
      // DT1: P3 & P4 dark
      ['P1', true], ['P2', true], ['P3', false], ['P4', false], ['P5', true], ['P6', true],
      // DT2: Q2 dark
      ['Q1', true], ['Q2', false],
      // DT3: R1 dark (DT fault)
      ['R1', false],
    ]);

    const faults1 = LocalizationEngine.localizeDt(multiIndex, poleStateMap, 'DT1');
    const faults2 = LocalizationEngine.localizeDt(multiIndex, poleStateMap, 'DT2');
    const faults3 = LocalizationEngine.localizeDt(multiIndex, poleStateMap, 'DT3');

    const totalFaults = [...faults1, ...faults2, ...faults3];
    expect(totalFaults).toHaveLength(3);
  });

  it('7. Isolated bad sensor: P2 OFF, but downstream P3 ON -> NO line-fault incident created', () => {
    // P1 ON -> P2 OFF (bad sensor) -> P3 ON (energized child confirms power flows through P2!)
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true],
      ['P2', false], // Bad sensor!
      ['P3', true],  // Confirms power is flowing through P2!
      ['P4', true],
      ['P5', true],
      ['P6', true],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    // Sensor anomaly filter MUST prevent raising a line-fault incident!
    expect(faults).toHaveLength(0);
  });

  it('8. DT-Level Outage: All poles under DT dark', () => {
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', false],
      ['P2', false],
      ['P3', false],
      ['P4', false],
      ['P5', false],
      ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    expect(faults).toHaveLength(1);
    expect(faults[0].faultType).toBe('dt_fault');
    expect(faults[0].affectedPoleCount).toBe(6);
  });
});
