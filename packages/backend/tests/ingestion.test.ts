import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  evaluateIngestionState,
  validateTelemetryPayload,
  type DeviceStateSnapshot,
} from '../src/ingestion';
import type { TelemetryMessage } from '@pgm/shared';

describe('Telemetry Payload Validation', () => {
  it('accepts valid telemetry payload', () => {
    const body = {
      device_id: 'DEV-001',
      pole_id: 'P-001',
      event: 'heartbeat',
      energized: true,
      ts: '2026-07-29T02:14:07.412Z',
      seq: 88213,
      battery_mv: 3480,
      rssi: -91,
      fw: '1.4.2',
    };

    const result = validateTelemetryPayload(body);
    expect(result.valid).toBe(true);
    expect(result.message?.device_id).toBe('DEV-001');
    expect(result.message?.seq).toBe(88213);
  });

  it('rejects payload with invalid event', () => {
    const body = {
      device_id: 'DEV-001',
      pole_id: 'P-001',
      event: 'explosion', // Invalid!
      energized: true,
      ts: new Date().toISOString(),
      seq: 1,
    };

    const result = validateTelemetryPayload(body);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Field "event" must be one of');
  });

  it('rejects payload with negative sequence', () => {
    const body = {
      device_id: 'DEV-001',
      pole_id: 'P-001',
      event: 'heartbeat',
      energized: true,
      ts: new Date().toISOString(),
      seq: -5,
    };

    const result = validateTelemetryPayload(body);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Field "seq" must be a non-negative integer');
  });

  it('rejects payload with invalid ISO timestamp', () => {
    const body = {
      device_id: 'DEV-001',
      pole_id: 'P-001',
      event: 'heartbeat',
      energized: true,
      ts: 'not-a-date',
      seq: 1,
    };

    const result = validateTelemetryPayload(body);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valid ISO-8601');
  });
});

describe('Ingestion State Evaluation & Sequence Semantics', () => {
  let sampleMsg: TelemetryMessage;

  beforeEach(() => {
    sampleMsg = {
      device_id: 'KSPDB-TEST-01',
      pole_id: 'P-TEST-01',
      event: 'heartbeat',
      energized: true,
      ts: new Date().toISOString(),
      seq: 10,
    };
  });

  it('1. First message ever for a device is accepted as newer state', () => {
    const decision = evaluateIngestionState(sampleMsg, null);
    expect(decision.assignedBootCount).toBe(1);
    expect(decision.isDuplicate).toBe(false);
    expect(decision.isStale).toBe(false);
    expect(decision.isNewerState).toBe(true);
  });

  it('2. Normal sequence progression (seq: 10 -> seq: 11) is accepted as newer state', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-TEST-01',
      bootCount: 1,
      lastSeq: 10,
      lastSeenAt: new Date(),
    };

    const nextMsg = { ...sampleMsg, seq: 11 };
    const decision = evaluateIngestionState(nextMsg, currentState);

    expect(decision.assignedBootCount).toBe(1);
    expect(decision.isDuplicate).toBe(false);
    expect(decision.isStale).toBe(false);
    expect(decision.isNewerState).toBe(true);
  });

  it('3. Retried duplicate sequence (seq: 10 when seq 10 was already processed) is flagged as duplicate & stale', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-TEST-01',
      bootCount: 1,
      lastSeq: 10,
      lastSeenAt: new Date(),
    };

    const knownSeqs = new Set<number>([10]);
    const duplicateMsg = { ...sampleMsg, seq: 10 };
    const decision = evaluateIngestionState(duplicateMsg, currentState, knownSeqs);

    expect(decision.isDuplicate).toBe(true);
    expect(decision.isStale).toBe(true);
    expect(decision.isNewerState).toBe(false);
  });

  it('4. Stale event (retried old seq: 8 when device is at seq: 10) does not overwrite newer state', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-TEST-01',
      bootCount: 1,
      lastSeq: 10,
      lastSeenAt: new Date(),
    };

    const staleMsg = { ...sampleMsg, seq: 8 };
    const decision = evaluateIngestionState(staleMsg, currentState);

    expect(decision.assignedBootCount).toBe(1);
    expect(decision.isStale).toBe(true);
    expect(decision.isNewerState).toBe(false);
  });

  it('5. Boot event followed by sequence reset (seq: 100 -> boot seq: 1) increments bootCount and accepts new sequence', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-TEST-01',
      bootCount: 1,
      lastSeq: 100,
      lastSeenAt: new Date(),
    };

    const bootMsg: TelemetryMessage = {
      ...sampleMsg,
      event: 'boot',
      seq: 1,
    };

    const decision = evaluateIngestionState(bootMsg, currentState);

    expect(decision.isBootReset).toBe(true);
    expect(decision.assignedBootCount).toBe(2); // Incremented from 1 -> 2
    expect(decision.isStale).toBe(false);
    expect(decision.isNewerState).toBe(true);
  });

  it('6. Implicit boot sequence reset (lastSeq: 85 -> seq: 1 without boot event) increments bootCount', () => {
    const currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-TEST-01',
      bootCount: 1,
      lastSeq: 85,
      lastSeenAt: new Date(),
    };

    const resetMsg: TelemetryMessage = {
      ...sampleMsg,
      event: 'power_lost', // power_lost after reboot
      seq: 1,
    };

    const decision = evaluateIngestionState(resetMsg, currentState);

    expect(decision.isBootReset).toBe(true);
    expect(decision.assignedBootCount).toBe(2);
    expect(decision.isStale).toBe(false);
    expect(decision.isNewerState).toBe(true);
  });

  it('7. Out-of-order arrival: seq 12 arrives first, then retried seq 11 arrives later', () => {
    let currentState: DeviceStateSnapshot = {
      deviceId: 'KSPDB-TEST-01',
      bootCount: 1,
      lastSeq: 10,
      lastSeenAt: new Date(),
    };

    // Step 1: seq 12 arrives first
    const msg12 = { ...sampleMsg, seq: 12 };
    const decision12 = evaluateIngestionState(msg12, currentState);

    expect(decision12.isNewerState).toBe(true);
    expect(decision12.isStale).toBe(false);

    // Update current state to reflect seq 12 processed
    currentState = { ...currentState, lastSeq: 12 };

    // Step 2: Delayed/retried seq 11 arrives later
    const msg11 = { ...sampleMsg, seq: 11 };
    const decision11 = evaluateIngestionState(msg11, currentState);

    expect(decision11.isStale).toBe(true); // Stale because lastSeq is 12!
    expect(decision11.isNewerState).toBe(false); // Does not overwrite device state
  });
});

describe('POST /api/telemetry HTTP Route', () => {
  it('returns 400 for invalid payload format', async () => {
    const res = await request(app)
      .post('/api/telemetry')
      .send({ invalid: 'payload' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});
