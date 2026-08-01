import type { PoleRecord } from '@pgm/shared';
import { TopologyIndex } from './TopologyIndex';

/**
 * Deterministic test fixture — a small but structurally complete LT tree.
 *
 * Topology (single DT, recorded topology, all parentPoleIds known):
 *
 *   DT1
 *   └── P1   (root — directly hung from DT breaker)
 *       └── P2
 *           ├── P3
 *           │   └── P4  (leaf)
 *           └── P5
 *               └── P6  (leaf)
 *
 * Key structural properties exercised:
 *   - one root (P1)
 *   - one internal node with two children (P2 → P3, P5)
 *   - two leaf branches of depth 2 (P3→P4, P5→P6)
 *   - depth 4 from DT to deepest leaf (P1→P2→P3→P4)
 *
 * This fixture is intentionally kept tiny so test assertions are easy to
 * reason about. The synthetic network seed (Task 3) will generate thousands
 * of poles using the same PoleRecord type.
 */
export const FIXTURE_POLES: PoleRecord[] = [
  {
    poleId: 'P1',
    lat: 12.9716,
    lon: 77.5946,
    feederId: 'F1',
    dtId: 'DT1',
    seqOnLine: 1,
    parentPoleId: undefined, // root of DT1's tree
    poleType: 'distribution',
    ward: 'Ward-1',
    pincode: '560001',
    deviceId: 'DEV-001',
    topologySource: 'recorded',
    energized: true,
  },
  {
    poleId: 'P2',
    lat: 12.972,
    lon: 77.595,
    feederId: 'F1',
    dtId: 'DT1',
    seqOnLine: 2,
    parentPoleId: 'P1',
    poleType: 'distribution',
    ward: 'Ward-1',
    pincode: '560001',
    deviceId: 'DEV-002',
    topologySource: 'recorded',
    energized: true,
  },
  {
    poleId: 'P3',
    lat: 12.9724,
    lon: 77.5953,
    feederId: 'F1',
    dtId: 'DT1',
    seqOnLine: 3,
    parentPoleId: 'P2',
    poleType: 'distribution',
    ward: 'Ward-1',
    pincode: '560001',
    deviceId: 'DEV-003',
    topologySource: 'recorded',
    energized: false, // dark — simulates a fault downstream of P2→P3
  },
  {
    poleId: 'P4',
    lat: 12.9728,
    lon: 77.5956,
    feederId: 'F1',
    dtId: 'DT1',
    seqOnLine: 4,
    parentPoleId: 'P3',
    poleType: 'terminal',
    ward: 'Ward-1',
    pincode: '560001',
    deviceId: 'DEV-004',
    topologySource: 'recorded',
    energized: false, // dark — downstream of P3
  },
  {
    poleId: 'P5',
    lat: 12.9722,
    lon: 77.5958,
    feederId: 'F1',
    dtId: 'DT1',
    seqOnLine: 5,
    parentPoleId: 'P2',
    poleType: 'distribution',
    ward: 'Ward-1',
    pincode: '560001',
    deviceId: 'DEV-005',
    topologySource: 'recorded',
    energized: true,
  },
  {
    poleId: 'P6',
    lat: 12.9726,
    lon: 77.596,
    feederId: 'F1',
    dtId: 'DT1',
    seqOnLine: 6,
    parentPoleId: 'P5',
    poleType: 'terminal',
    ward: 'Ward-1',
    pincode: '560001',
    // No deviceId — simulates the ~9% of poles with no IoT device
    topologySource: 'recorded',
    energized: undefined, // no device → no telemetry → unknown state
  },
];

/** Pre-built index over the fixture poles — import directly in tests. */
export const FIXTURE_INDEX: TopologyIndex = TopologyIndex.build(FIXTURE_POLES);
