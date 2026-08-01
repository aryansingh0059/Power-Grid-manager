import { describe, it, expect, beforeAll } from 'vitest';
import { TopologyIndex } from '../src/topology/TopologyIndex';
import { FIXTURE_POLES, FIXTURE_INDEX } from '../src/topology/fixture';

/**
 * Topology: (all topology_source: 'recorded')
 *
 *   DT1
 *   └── P1 (root)
 *       └── P2
 *           ├── P3
 *           │   └── P4 (leaf)
 *           └── P5
 *               └── P6 (leaf)
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sort-insensitive equality for pole-ID arrays. */
function sameSet(a: readonly string[], b: string[]): boolean {
  return [...a].sort().join(',') === [...b].sort().join(',');
}

// ── build() ───────────────────────────────────────────────────────────────────

describe('TopologyIndex.build()', () => {
  it('accepts an empty array without throwing', () => {
    const idx = TopologyIndex.build([]);
    expect(idx.size()).toBe(0);
  });

  it('indexes all poles from the fixture', () => {
    expect(FIXTURE_INDEX.size()).toBe(6);
  });

  it('ignores a parentPoleId that references a pole not in the input', () => {
    const poles = [
      { ...FIXTURE_POLES[0], parentPoleId: 'GHOST-POLE' }, // dangling reference
      FIXTURE_POLES[1],
    ];
    const idx = TopologyIndex.build(poles);
    // The ghost parent has no node — P1 is not a child of anything in the index,
    // so it appears as a DT root even though its parentPoleId field is set.
    expect(idx.getDtRootIds('DT1')).toContain('P1');
    // getChildrenIds of the ghost parent returns empty (no node for it)
    expect(idx.getChildrenIds('GHOST-POLE')).toHaveLength(0);
  });


  it('handles out-of-order input (parent listed after child)', () => {
    const reversed = [...FIXTURE_POLES].reverse();
    const idx = TopologyIndex.build(reversed);
    expect(idx.size()).toBe(6);
    expect(idx.getParentId('P2')).toBe('P1');
    expect(sameSet(idx.getChildrenIds('P2'), ['P3', 'P5'])).toBe(true);
  });
});

// ── getPole() ─────────────────────────────────────────────────────────────────

describe('getPole()', () => {
  it('returns the correct PoleRecord for a known poleId', () => {
    const pole = FIXTURE_INDEX.getPole('P3');
    expect(pole).toBeDefined();
    expect(pole!.poleId).toBe('P3');
    expect(pole!.parentPoleId).toBe('P2');
    expect(pole!.dtId).toBe('DT1');
    expect(pole!.topologySource).toBe('recorded');
  });

  it('returns undefined for an unknown poleId', () => {
    expect(FIXTURE_INDEX.getPole('DOES-NOT-EXIST')).toBeUndefined();
  });
});

// ── getParentId() ─────────────────────────────────────────────────────────────

describe('getParentId()', () => {
  it('returns null for the root pole (P1)', () => {
    expect(FIXTURE_INDEX.getParentId('P1')).toBeNull();
  });

  it('returns P1 as parent of P2', () => {
    expect(FIXTURE_INDEX.getParentId('P2')).toBe('P1');
  });

  it('returns P2 as parent of P3', () => {
    expect(FIXTURE_INDEX.getParentId('P3')).toBe('P2');
  });

  it('returns P2 as parent of P5', () => {
    expect(FIXTURE_INDEX.getParentId('P5')).toBe('P2');
  });

  it('returns P3 as parent of P4', () => {
    expect(FIXTURE_INDEX.getParentId('P4')).toBe('P3');
  });

  it('returns P5 as parent of P6', () => {
    expect(FIXTURE_INDEX.getParentId('P6')).toBe('P5');
  });

  it('returns null for an unknown poleId', () => {
    expect(FIXTURE_INDEX.getParentId('UNKNOWN')).toBeNull();
  });
});

// ── getChildrenIds() ──────────────────────────────────────────────────────────

describe('getChildrenIds()', () => {
  it('P1 has one child: P2', () => {
    expect(sameSet(FIXTURE_INDEX.getChildrenIds('P1'), ['P2'])).toBe(true);
  });

  it('P2 has two children: P3 and P5', () => {
    expect(sameSet(FIXTURE_INDEX.getChildrenIds('P2'), ['P3', 'P5'])).toBe(true);
  });

  it('P3 has one child: P4', () => {
    expect(sameSet(FIXTURE_INDEX.getChildrenIds('P3'), ['P4'])).toBe(true);
  });

  it('P4 has no children (leaf)', () => {
    expect(FIXTURE_INDEX.getChildrenIds('P4')).toHaveLength(0);
  });

  it('P5 has one child: P6', () => {
    expect(sameSet(FIXTURE_INDEX.getChildrenIds('P5'), ['P6'])).toBe(true);
  });

  it('P6 has no children (leaf)', () => {
    expect(FIXTURE_INDEX.getChildrenIds('P6')).toHaveLength(0);
  });

  it('returns empty array for unknown poleId', () => {
    expect(FIXTURE_INDEX.getChildrenIds('UNKNOWN')).toHaveLength(0);
  });
});

// ── getDescendantIds() ────────────────────────────────────────────────────────

describe('getDescendantIds()', () => {
  it('P1 descendants: all 5 other poles', () => {
    const result = FIXTURE_INDEX.getDescendantIds('P1');
    expect(result).toHaveLength(5);
    expect(sameSet(result, ['P2', 'P3', 'P4', 'P5', 'P6'])).toBe(true);
  });

  it('P2 descendants: P3, P4, P5, P6', () => {
    const result = FIXTURE_INDEX.getDescendantIds('P2');
    expect(result).toHaveLength(4);
    expect(sameSet(result, ['P3', 'P4', 'P5', 'P6'])).toBe(true);
  });

  it('P3 descendants: only P4', () => {
    const result = FIXTURE_INDEX.getDescendantIds('P3');
    expect(result).toEqual(['P4']);
  });

  it('P4 descendants: empty (leaf)', () => {
    expect(FIXTURE_INDEX.getDescendantIds('P4')).toHaveLength(0);
  });

  it('P5 descendants: only P6', () => {
    expect(FIXTURE_INDEX.getDescendantIds('P5')).toEqual(['P6']);
  });

  it('P6 descendants: empty (leaf)', () => {
    expect(FIXTURE_INDEX.getDescendantIds('P6')).toHaveLength(0);
  });

  it('unknown poleId returns empty array', () => {
    expect(FIXTURE_INDEX.getDescendantIds('UNKNOWN')).toHaveLength(0);
  });

  it('BFS order: P2 children appear before grandchildren', () => {
    const result = FIXTURE_INDEX.getDescendantIds('P2');
    const p3Idx = result.indexOf('P3');
    const p5Idx = result.indexOf('P5');
    const p4Idx = result.indexOf('P4');
    const p6Idx = result.indexOf('P6');
    // P3 and P5 (depth 1 from P2) must appear before P4 and P6 (depth 2)
    expect(p3Idx).toBeLessThan(p4Idx);
    expect(p5Idx).toBeLessThan(p6Idx);
  });
});

// ── getAncestorIds() ──────────────────────────────────────────────────────────

describe('getAncestorIds()', () => {
  it('P1 (root) has no ancestors', () => {
    expect(FIXTURE_INDEX.getAncestorIds('P1')).toHaveLength(0);
  });

  it('P2 ancestors: [P1]', () => {
    expect(FIXTURE_INDEX.getAncestorIds('P2')).toEqual(['P1']);
  });

  it('P4 ancestors: [P3, P2, P1] — nearest first', () => {
    expect(FIXTURE_INDEX.getAncestorIds('P4')).toEqual(['P3', 'P2', 'P1']);
  });

  it('P6 ancestors: [P5, P2, P1] — nearest first', () => {
    expect(FIXTURE_INDEX.getAncestorIds('P6')).toEqual(['P5', 'P2', 'P1']);
  });

  it('unknown poleId returns empty array', () => {
    expect(FIXTURE_INDEX.getAncestorIds('UNKNOWN')).toHaveLength(0);
  });
});

// ── getPathFromRoot() ─────────────────────────────────────────────────────────

describe('getPathFromRoot()', () => {
  it('P1 path: [P1] (root is its own path)', () => {
    expect(FIXTURE_INDEX.getPathFromRoot('P1')).toEqual(['P1']);
  });

  it('P4 path: [P1, P2, P3, P4]', () => {
    expect(FIXTURE_INDEX.getPathFromRoot('P4')).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  it('P6 path: [P1, P2, P5, P6]', () => {
    expect(FIXTURE_INDEX.getPathFromRoot('P6')).toEqual(['P1', 'P2', 'P5', 'P6']);
  });

  it('P3 path: [P1, P2, P3]', () => {
    expect(FIXTURE_INDEX.getPathFromRoot('P3')).toEqual(['P1', 'P2', 'P3']);
  });
});

// ── getDtRootIds() ────────────────────────────────────────────────────────────

describe('getDtRootIds()', () => {
  it('DT1 has exactly one root: P1', () => {
    expect(FIXTURE_INDEX.getDtRootIds('DT1')).toEqual(['P1']);
  });

  it('unknown dtId returns empty array', () => {
    expect(FIXTURE_INDEX.getDtRootIds('DT-UNKNOWN')).toHaveLength(0);
  });
});

// ── getPoleIdsByDt() ──────────────────────────────────────────────────────────

describe('getPoleIdsByDt()', () => {
  it('DT1 contains all 6 poles', () => {
    const result = FIXTURE_INDEX.getPoleIdsByDt('DT1');
    expect(result).toHaveLength(6);
    expect(sameSet(result, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])).toBe(true);
  });

  it('unknown dtId returns empty array', () => {
    expect(FIXTURE_INDEX.getPoleIdsByDt('DT-UNKNOWN')).toHaveLength(0);
  });
});

// ── getPoleIdsByFeeder() ──────────────────────────────────────────────────────

describe('getPoleIdsByFeeder()', () => {
  it('F1 contains all 6 poles', () => {
    const result = FIXTURE_INDEX.getPoleIdsByFeeder('F1');
    expect(result).toHaveLength(6);
    expect(sameSet(result, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])).toBe(true);
  });

  it('unknown feederId returns empty array', () => {
    expect(FIXTURE_INDEX.getPoleIdsByFeeder('F-UNKNOWN')).toHaveLength(0);
  });
});

// ── Multi-DT isolation ────────────────────────────────────────────────────────

describe('multi-DT isolation', () => {
  let multiIdx: TopologyIndex;

  beforeAll(() => {
    // Add a second DT with two poles on feeder F2
    multiIdx = TopologyIndex.build([
      ...FIXTURE_POLES,
      {
        poleId: 'Q1',
        lat: 13.0, lon: 77.6,
        feederId: 'F2', dtId: 'DT2',
        parentPoleId: undefined,
        poleType: 'distribution',
        ward: 'Ward-2', pincode: '560002',
        topologySource: 'recorded',
      },
      {
        poleId: 'Q2',
        lat: 13.001, lon: 77.601,
        feederId: 'F2', dtId: 'DT2',
        parentPoleId: 'Q1',
        poleType: 'terminal',
        ward: 'Ward-2', pincode: '560002',
        topologySource: 'recorded',
      },
    ]);
  });

  it('total size is 8 (6 DT1 + 2 DT2)', () => {
    expect(multiIdx.size()).toBe(8);
  });

  it('DT1 poles do not leak into DT2', () => {
    expect(sameSet(multiIdx.getPoleIdsByDt('DT2'), ['Q1', 'Q2'])).toBe(true);
  });

  it('DT2 poles do not appear in DT1', () => {
    const dt1 = multiIdx.getPoleIdsByDt('DT1');
    expect(dt1).not.toContain('Q1');
    expect(dt1).not.toContain('Q2');
  });

  it('F1 and F2 are isolated', () => {
    expect(sameSet(multiIdx.getPoleIdsByFeeder('F2'), ['Q1', 'Q2'])).toBe(true);
    const f1 = multiIdx.getPoleIdsByFeeder('F1');
    expect(f1).not.toContain('Q1');
  });

  it('Q1 is root of DT2', () => {
    expect(multiIdx.getDtRootIds('DT2')).toEqual(['Q1']);
  });

  it('Q2 parent is Q1', () => {
    expect(multiIdx.getParentId('Q2')).toBe('Q1');
  });

  it('DT2 tree does not affect DT1 traversal', () => {
    const dt1Descendants = multiIdx.getDescendantIds('P1');
    expect(dt1Descendants).not.toContain('Q1');
    expect(dt1Descendants).not.toContain('Q2');
  });
});
