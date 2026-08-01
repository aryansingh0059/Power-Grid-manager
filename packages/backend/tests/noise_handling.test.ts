import { describe, it, expect } from 'vitest';
import { TopologyIndex } from '../src/topology/TopologyIndex';
import { FIXTURE_POLES } from '../src/topology/fixture';
import { LocalizationEngine } from '../src/localization';
import { evaluateIngestionState, type DeviceStateSnapshot } from '../src/ingestion';
import type { ScheduledOutage, TelemetryMessage } from '@pgm/shared';

describe('False-Positive and Noise Handling Layer', () => {
  const fixtureIndex = TopologyIndex.build(FIXTURE_POLES);

  it('1. Dead device (isolated failure) -> NO power-fault outage ticket created', () => {
    // P1 ON -> P2 OFF (dead device) -> P3 ON (energized child confirms power line is healthy!)
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true],
      ['P2', false], // Device failed
      ['P3', true],  // Child live
      ['P4', true],
      ['P5', true],
      ['P6', true],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    // Sensor anomaly filter MUST prevent generating a power span fault
    expect(faults).toHaveLength(0);
  });

  it('2. Scheduled outage -> classifies fault as scheduled_outage (no normal fault ticket)', () => {
    const outages: ScheduledOutage[] = [
      {
        outageId: 'OUTAGE-DT1',
        dtId: 'DT1',
        startAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        description: 'Scheduled 11kV Maintenance',
        status: 'active',
      },
    ];

    // Entire DT1 dark during scheduled outage
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', false], ['P2', false], ['P3', false], ['P4', false], ['P5', false], ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1', undefined, outages);

    expect(faults).toHaveLength(1);
    expect(faults[0].faultType).toBe('scheduled_outage');
    expect(faults[0].reasons.some((r) => r.includes('OUTAGE-DT1'))).toBe(true);
  });

  it('3. Duplicate telemetry -> flagged as duplicate & stale (no duplicate processing)', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-DEV-99',
      bootCount: 1,
      lastSeq: 50,
      lastSeenAt: new Date(),
    };

    const duplicateMsg: TelemetryMessage = {
      device_id: 'KSPDB-DEV-99',
      pole_id: 'P-001',
      event: 'power_lost',
      energized: false,
      ts: new Date().toISOString(),
      seq: 50, // Already processed!
    };

    const decision = evaluateIngestionState(duplicateMsg, currentState, new Set([50]));

    expect(decision.isDuplicate).toBe(true);
    expect(decision.isStale).toBe(true);
    expect(decision.isNewerState).toBe(false);
  });

  it('4. Stale power_lost -> does NOT overwrite restored state or reopen incident', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-DEV-99',
      bootCount: 1,
      lastSeq: 100, // Device has progressed to seq 100 (power_restored)
      lastSeenAt: new Date(),
    };

    const stalePowerLostMsg: TelemetryMessage = {
      device_id: 'KSPDB-DEV-99',
      pole_id: 'P-001',
      event: 'power_lost',
      energized: false,
      ts: new Date(Date.now() - 60000).toISOString(), // Delayed/retried msg from seq 90
      seq: 90,
    };

    const decision = evaluateIngestionState(stalePowerLostMsg, currentState);

    expect(decision.isStale).toBe(true);
    expect(decision.isNewerState).toBe(false); // MUST NOT mutate state back to dark!
  });

  it('5. Correlated downstream loss -> grouped into EXACTLY ONE incident', () => {
    // P1 ON -> P2 OFF -> P3 OFF -> P4 OFF (P5, P6 also dark under P2)
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true],
      ['P2', false],
      ['P3', false],
      ['P4', false],
      ['P5', false],
      ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1');

    expect(faults).toHaveLength(1);
    expect(faults[0].upstreamPoleId).toBe('P1');
    expect(faults[0].downstreamPoleId).toBe('P2');
    expect(faults[0].affectedPoleCount).toBe(5); // P2, P3, P4, P5, P6 grouped into 1 incident
  });

  it('6. Legitimate fault surfaced when schedule evidence conflicts with physical reality', () => {
    // Outage schedule claims entire feeder F1 is shut down
    const outages: ScheduledOutage[] = [
      {
        outageId: 'SCHED-FDR-01',
        feederId: 'F1',
        startAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        description: 'Feeder F1 Substation Work',
        status: 'active',
      },
    ];

    // BUT observed telemetry shows only 2 poles on Branch 2 are dark (P5, P6), while P1, P2, P3, P4 are ON!
    const poleStateMap = new Map<string, boolean | null>([
      ['P1', true], ['P2', true], ['P3', true], ['P4', true],
      ['P5', false], ['P6', false],
    ]);

    const faults = LocalizationEngine.localizeDt(fixtureIndex, poleStateMap, 'DT1', undefined, outages);

    expect(faults).toHaveLength(1);
    const f = faults[0];
    // Must surface as a legitimate span_fault because feeder schedule conflicts with reality!
    expect(f.faultType).toBe('span_fault');
    expect(f.upstreamPoleId).toBe('P2');
    expect(f.downstreamPoleId).toBe('P5');
    expect(f.reasons.some((r) => r.includes('Schedule conflicts with physical reality'))).toBe(true);
  });
});
