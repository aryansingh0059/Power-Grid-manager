import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PoleModel } from '../src/db/models/Pole';
import { DeviceModel } from '../src/db/models/Device';
import { IncidentModel } from '../src/db/models/Incident';
import { ActiveFaultModel } from '../src/db/models/ActiveFault';
import { FaultSimulator } from '../src/simulator/FaultSimulator';
import { IncidentService } from '../src/incidents/IncidentService';
import type { PoleRecord } from '@pgm/shared';

describe('Radial Electrical Fault Physics & Simulation Test Suite', () => {
  let mongoServer: MongoMemoryServer;

  /**
   * Network Topology setup:
   *
   * FDR-01
   * ├── DT-001 (Linear chain: P1 -> P2 -> P3 -> P4 -> P5)
   * └── DT-002 (Branching tree: P10 -> P11; P11 -> P12 -> P13; P11 -> P14 -> P15)
   *
   * FDR-02
   * └── DT-003 (Linear chain: P20 -> P21 -> P22)
   */
  const TEST_POLES: Partial<PoleRecord>[] = [
    // DT-001 (Linear chain 1 to 5)
    { poleId: 'P1', feederId: 'FDR-01', dtId: 'DT-001', parentPoleId: undefined, lat: 12.97, lon: 77.59, poleType: 'distribution', ward: 'W1', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P2', feederId: 'FDR-01', dtId: 'DT-001', parentPoleId: 'P1', lat: 12.971, lon: 77.591, poleType: 'distribution', ward: 'W1', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P3', feederId: 'FDR-01', dtId: 'DT-001', parentPoleId: 'P2', lat: 12.972, lon: 77.592, poleType: 'distribution', ward: 'W1', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P4', feederId: 'FDR-01', dtId: 'DT-001', parentPoleId: 'P3', lat: 12.973, lon: 77.593, poleType: 'distribution', ward: 'W1', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P5', feederId: 'FDR-01', dtId: 'DT-001', parentPoleId: 'P4', lat: 12.974, lon: 77.594, poleType: 'distribution', ward: 'W1', pincode: '560001', topologySource: 'recorded' },

    // DT-002 (Branching tree: P10 -> P11; P11 -> P12 -> P13; P11 -> P14 -> P15)
    { poleId: 'P10', feederId: 'FDR-01', dtId: 'DT-002', parentPoleId: undefined, lat: 12.98, lon: 77.60, poleType: 'distribution', ward: 'W2', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P11', feederId: 'FDR-01', dtId: 'DT-002', parentPoleId: 'P10', lat: 12.981, lon: 77.601, poleType: 'distribution', ward: 'W2', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P12', feederId: 'FDR-01', dtId: 'DT-002', parentPoleId: 'P11', lat: 12.982, lon: 77.602, poleType: 'distribution', ward: 'W2', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P13', feederId: 'FDR-01', dtId: 'DT-002', parentPoleId: 'P12', lat: 12.983, lon: 77.603, poleType: 'distribution', ward: 'W2', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P14', feederId: 'FDR-01', dtId: 'DT-002', parentPoleId: 'P11', lat: 12.984, lon: 77.604, poleType: 'distribution', ward: 'W2', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P15', feederId: 'FDR-01', dtId: 'DT-002', parentPoleId: 'P14', lat: 12.985, lon: 77.605, poleType: 'distribution', ward: 'W2', pincode: '560001', topologySource: 'recorded' },

    // DT-003 (Linear chain on FDR-02)
    { poleId: 'P20', feederId: 'FDR-02', dtId: 'DT-003', parentPoleId: undefined, lat: 12.99, lon: 77.61, poleType: 'distribution', ward: 'W3', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P21', feederId: 'FDR-02', dtId: 'DT-003', parentPoleId: 'P20', lat: 12.991, lon: 77.611, poleType: 'distribution', ward: 'W3', pincode: '560001', topologySource: 'recorded' },
    { poleId: 'P22', feederId: 'FDR-02', dtId: 'DT-003', parentPoleId: 'P21', lat: 12.992, lon: 77.612, poleType: 'distribution', ward: 'W3', pincode: '560001', topologySource: 'recorded' },
  ];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await PoleModel.deleteMany({});
    await DeviceModel.deleteMany({});
    await IncidentModel.deleteMany({});
    await ActiveFaultModel.deleteMany({});

    // Seed test poles
    await PoleModel.create(
      TEST_POLES.map((p) => ({
        ...p,
        energized: true,
        lastSeenAt: new Date(),
        deviceId: `DEV-${p.poleId}`,
      }))
    );

    // Seed test devices
    await DeviceModel.create(
      TEST_POLES.map((p) => ({
        deviceId: `DEV-${p.poleId}`,
        poleId: p.poleId,
        firmwareVersion: '1.4.0',
        bootCount: 1,
        isOnline: true,
      }))
    );
  });

  it('TEST A — Middle span fault (P2 -> P3)', async () => {
    const res = await FaultSimulator.injectSpanFault('P2', 'P3', { deterministic: true });
    expect(res.success).toBe(true);

    const poles = await PoleModel.find({ dtId: 'DT-001' }).lean();
    const poleMap = new Map(poles.map((p) => [p.poleId, p.energized]));

    // Upstream poles remain ENERGIZED
    expect(poleMap.get('P1')).toBe(true);
    expect(poleMap.get('P2')).toBe(true);

    // Downstream poles become DARK
    expect(poleMap.get('P3')).toBe(false);
    expect(poleMap.get('P4')).toBe(false);
    expect(poleMap.get('P5')).toBe(false);

    expect(res.affectedPoleCount).toBe(3);

    // Incident boundary check
    const inc = await IncidentModel.findOne({ status: 'detected' });
    expect(inc).not.toBeNull();
    expect(inc!.boundary.upstreamPoleId).toBe('P2');
    expect(inc!.boundary.downstreamPoleId).toBe('P3');
    expect(inc!.affectedPoleIds.sort()).toEqual(['P3', 'P4', 'P5'].sort());
  });

  it('TEST B — First span fault (P1 -> P2)', async () => {
    const res = await FaultSimulator.injectSpanFault('P1', 'P2', { deterministic: true });
    expect(res.success).toBe(true);

    const poles = await PoleModel.find({ dtId: 'DT-001' }).lean();
    const poleMap = new Map(poles.map((p) => [p.poleId, p.energized]));

    // Upstream DT root P1 remains ENERGIZED!
    expect(poleMap.get('P1')).toBe(true);

    // P2 through P5 become DARK
    expect(poleMap.get('P2')).toBe(false);
    expect(poleMap.get('P3')).toBe(false);
    expect(poleMap.get('P4')).toBe(false);
    expect(poleMap.get('P5')).toBe(false);

    // Classified as span_fault, NOT dt_fault!
    const inc = await IncidentModel.findOne({ status: 'detected' });
    expect(inc).not.toBeNull();
    expect(inc!.faultType).toBe('span_fault');
    expect(inc!.boundary.upstreamPoleId).toBe('P1');
    expect(inc!.boundary.downstreamPoleId).toBe('P2');
  });

  it('TEST C — Branch isolation (P11 -> P12)', async () => {
    const res = await FaultSimulator.injectSpanFault('P11', 'P12', { deterministic: true });
    expect(res.success).toBe(true);

    const poles = await PoleModel.find({ dtId: 'DT-002' }).lean();
    const poleMap = new Map(poles.map((p) => [p.poleId, p.energized]));

    // Main trunk P10, P11 remain ENERGIZED
    expect(poleMap.get('P10')).toBe(true);
    expect(poleMap.get('P11')).toBe(true);

    // Failed branch P12, P13 become DARK
    expect(poleMap.get('P12')).toBe(false);
    expect(poleMap.get('P13')).toBe(false);

    // Other branch P14, P15 MUST remain ENERGIZED!
    expect(poleMap.get('P14')).toBe(true);
    expect(poleMap.get('P15')).toBe(true);
  });

  it('TEST D — DT failure (DT-001)', async () => {
    const res = await FaultSimulator.injectDtFault('DT-001', { deterministic: true });
    expect(res.success).toBe(true);

    const dt1Poles = await PoleModel.find({ dtId: 'DT-001' }).lean();
    const dt2Poles = await PoleModel.find({ dtId: 'DT-002' }).lean();

    // All poles under DT-001 are DARK
    expect(dt1Poles.every((p) => p.energized === false)).toBe(true);

    // Poles under DT-002 remain ENERGIZED
    expect(dt2Poles.every((p) => p.energized === true)).toBe(true);

    // Exactly 1 DT fault incident created
    const incs = await IncidentModel.find({ status: 'detected' });
    expect(incs.length).toBe(1);
    expect(incs[0].faultType).toBe('dt_fault');
    expect(incs[0].dtId).toBe('DT-001');
  });

  it('TEST E — Feeder failure (FDR-01)', async () => {
    const res = await FaultSimulator.injectFeederFault('FDR-01', { deterministic: true });
    expect(res.success).toBe(true);

    const f1Poles = await PoleModel.find({ feederId: 'FDR-01' }).lean();
    const f2Poles = await PoleModel.find({ feederId: 'FDR-02' }).lean();

    // All 11 poles on FDR-01 are DARK
    expect(f1Poles.length).toBe(11);
    expect(f1Poles.every((p) => p.energized === false)).toBe(true);

    // Poles on FDR-02 remain ENERGIZED
    expect(f2Poles.every((p) => p.energized === true)).toBe(true);

    // 1 feeder-level incident created
    const incs = await IncidentModel.find({ status: 'detected' });
    expect(incs.length).toBe(1);
    expect(incs[0].faultType).toBe('feeder_fault');
    expect(incs[0].feederId).toBe('FDR-01');
    expect(incs[0].affectedPoleCount).toBe(11);
  });

  it('TEST F — Device failure (hardware offline while power healthy)', async () => {
    const res = await FaultSimulator.killDevice('DEV-P3');
    expect(res.success).toBe(true);

    // Physical power stays ENERGIZED for P3
    const p3 = await PoleModel.findOne({ poleId: 'P3' });
    expect(p3!.energized).toBe(true);

    // Device is offline
    const dev3 = await DeviceModel.findOne({ deviceId: 'DEV-P3' });
    expect(dev3!.isOnline).toBe(false);

    // NO electrical power fault ticket is created!
    const incs = await IncidentModel.find({ status: 'detected' });
    expect(incs.length).toBe(0);
  });

  it('TEST G — Restoration lifecycle', async () => {
    // 1. Inject fault
    await FaultSimulator.injectSpanFault('P2', 'P3', { deterministic: true });
    let inc = await IncidentModel.findOne({ status: 'detected' });
    expect(inc).not.toBeNull();

    // 2. Operator workflow: ACKNOWLEDGED -> CREW_ASSIGNED -> RESOLVED
    await IncidentService.acknowledgeIncident(inc!.incidentId);
    await IncidentService.assignCrew(inc!.incidentId, 'CREW-1', 'Crew Alpha');
    await IncidentService.resolveIncident(inc!.incidentId, 'Repaired physical span');

    // 3. Repair physical fault in simulator (emits boot & power_restored telemetry)
    await FaultSimulator.repairFault('DT-001', 'P3');

    // 4. Ticket must automatically be VERIFIED and CLOSED from restoration telemetry!
    const closedInc = await IncidentModel.findOne({ incidentId: inc!.incidentId });
    expect(closedInc!.status).toBe('closed');
    expect(closedInc!.closedAt).toBeDefined();
  });

  it('TEST H — Simultaneous multiple faults & independent restoration', async () => {
    // Inject Fault 1: P2 -> P3 under DT-001
    await FaultSimulator.injectSpanFault('P2', 'P3', { deterministic: true });
    // Inject Fault 2: P11 -> P12 under DT-002
    await FaultSimulator.injectSpanFault('P11', 'P12', { deterministic: true });

    let p3 = await PoleModel.findOne({ poleId: 'P3' });
    let p12 = await PoleModel.findOne({ poleId: 'P12' });
    expect(p3!.energized).toBe(false);
    expect(p12!.energized).toBe(false);

    // Repair only Fault 1 (P2 -> P3)
    await FaultSimulator.repairFault('DT-001', 'P3');

    p3 = await PoleModel.findOne({ poleId: 'P3' });
    p12 = await PoleModel.findOne({ poleId: 'P12' });

    // Fault 1 subtree (P3) is RESTORED
    expect(p3!.energized).toBe(true);

    // Fault 2 subtree (P12) MUST REMAIN DARK!
    expect(p12!.energized).toBe(false);
  });

  it('TEST I — Leaf span fault (P21 -> P22)', async () => {
    const res = await FaultSimulator.injectSpanFault('P21', 'P22', { deterministic: true });
    expect(res.success).toBe(true);

    const poles = await PoleModel.find({ dtId: 'DT-003' }).lean();
    const poleMap = new Map(poles.map((p) => [p.poleId, p.energized]));

    // Upstream poles P20 and P21 remain ENERGIZED
    expect(poleMap.get('P20')).toBe(true);
    expect(poleMap.get('P21')).toBe(true);

    // ONLY leaf pole P22 becomes DARK
    expect(poleMap.get('P22')).toBe(false);
    expect(res.affectedPoleCount).toBe(1);
  });

  it('TEST J — Repeated localization runs produce exactly 1 incident (deduplication)', async () => {
    await FaultSimulator.injectDtFault('DT-001', { deterministic: true });
    
    // Run localization 10 times consecutively
    for (let i = 0; i < 10; i++) {
      await FaultSimulator.runLocalizationPipeline();
    }

    const incs = await IncidentModel.find({ dtId: 'DT-001' }).lean();
    expect(incs.length).toBe(1);
    expect(incs[0].status).toBe('detected');
  });

  it('TEST K — Resolved-but-unverified incident does not generate duplicate ticket', async () => {
    await FaultSimulator.injectDtFault('DT-001', { deterministic: true });
    const inc = await IncidentModel.findOne({ dtId: 'DT-001' });

    await IncidentService.acknowledgeIncident(inc!.incidentId);
    await IncidentService.assignCrew(inc!.incidentId, 'CREW-1', 'Alpha Team');
    await IncidentService.resolveIncident(inc!.incidentId, 'Crew claims repair finished');

    const incAfterResolve = await IncidentModel.findOne({ incidentId: inc!.incidentId });
    expect(incAfterResolve!.status).toBe('resolved');

    // Run localization 10 times while physical fault is still active
    for (let i = 0; i < 10; i++) {
      await FaultSimulator.runLocalizationPipeline();
    }

    // Should STILL be exactly 1 ticket, NOT duplicate!
    const incs = await IncidentModel.find({ dtId: 'DT-001' }).lean();
    expect(incs.length).toBe(1);
    expect(incs[0].incidentId).toBe(inc!.incidentId);
  });

  it('TEST L — Uninstrumented poles do not block restoration verification', async () => {
    // Add an uninstrumented pole (no deviceId) to DT-001
    await PoleModel.create({
      poleId: 'P_UNINSTRUMENTED',
      feederId: 'FDR-01',
      dtId: 'DT-001',
      parentPoleId: 'P1',
      lat: 12.975,
      lon: 77.595,
      poleType: 'distribution',
      ward: 'W1',
      pincode: '560001',
      topologySource: 'recorded',
      energized: false,
      deviceId: undefined, // No device attached!
    });

    await FaultSimulator.injectDtFault('DT-001', { deterministic: true });
    const inc = await IncidentModel.findOne({ dtId: 'DT-001' });

    await IncidentService.acknowledgeIncident(inc!.incidentId);
    await IncidentService.resolveIncident(inc!.incidentId, 'Repair complete');

    // Repair fault — emits telemetry for all instrumented poles
    await FaultSimulator.repairFault('DT-001');

    // Ticket should auto-close despite uninstrumented pole!
    const closedInc = await IncidentModel.findOne({ incidentId: inc!.incidentId });
    expect(closedInc!.status).toBe('closed');
  });

  it('TEST M — New fault after genuine closure creates a new incident ticket', async () => {
    // Episode 1
    await FaultSimulator.injectDtFault('DT-001', { deterministic: true });
    let inc1 = await IncidentModel.findOne({ status: 'detected' });
    await IncidentService.acknowledgeIncident(inc1!.incidentId);
    await IncidentService.resolveIncident(inc1!.incidentId);
    await FaultSimulator.repairFault('DT-001');

    inc1 = await IncidentModel.findOne({ incidentId: inc1!.incidentId });
    expect(inc1!.status).toBe('closed');

    // Episode 2: Inject NEW fault on same DT after closure
    await FaultSimulator.injectDtFault('DT-001', { deterministic: true });

    const incs = await IncidentModel.find({ dtId: 'DT-001' }).lean();
    expect(incs.length).toBe(2);

    const activeInc = incs.find((i) => i.status !== 'closed');
    expect(activeInc).toBeDefined();
    expect(activeInc!.incidentId).not.toBe(inc1!.incidentId);
  });

  it('TEST N — Repeated verification does not spam identical timeline entries', async () => {
    await FaultSimulator.injectDtFault('DT-001', { deterministic: true });
    const inc = await IncidentModel.findOne({ dtId: 'DT-001' });

    await IncidentService.resolveIncident(inc!.incidentId);

    // Call verifyRestoration 10 times while dark
    for (let i = 0; i < 10; i++) {
      await IncidentService.verifyRestoration(inc!.incidentId);
    }

    const updatedInc = await IncidentModel.findOne({ incidentId: inc!.incidentId });
    // Timeline should not have 10 duplicate "pending" entries
    const pendingNotes = updatedInc!.timeline.filter((t) => t.note?.includes('Restoration verification pending'));
    expect(pendingNotes.length).toBe(1);
  });

  it('TEST O — Stale power_lost telemetry cannot turn restored pole dark', async () => {
    const { IngestionService } = await import('../src/ingestion/IngestionService');
    const dev = await DeviceModel.findOne({ poleId: 'P1' });

    // Initial state: bootCount = 1, seq = 100
    dev!.bootCount = 1;
    dev!.lastSeq = 100;
    await dev!.save();

    // 1. Repair / Restoration: Boot reset (bootCount = 2, seq = 0)
    await IngestionService.processMessage({
      device_id: dev!.deviceId,
      pole_id: 'P1',
      event: 'boot',
      energized: true,
      ts: new Date().toISOString(),
      seq: 0,
      fw: '1.4.0',
    });

    await IngestionService.processMessage({
      device_id: dev!.deviceId,
      pole_id: 'P1',
      event: 'power_restored',
      energized: true,
      ts: new Date().toISOString(),
      seq: 1,
      fw: '1.4.0',
    });

    let pole = await PoleModel.findOne({ poleId: 'P1' });
    expect(pole!.energized).toBe(true);

    // 2. Late/Stale power_lost message from OLD boot generation arrives (bootCount = 1, seq = 101)
    const staleMsg = {
      device_id: dev!.deviceId,
      pole_id: 'P1',
      event: 'power_lost' as const,
      energized: false,
      ts: new Date(Date.now() - 3600000).toISOString(),
      seq: 500, // old sequence
      fw: '1.4.0',
    };

    const res = await IngestionService.processMessage(staleMsg);
    expect(res.isStale).toBe(true);

    // Pole MUST REMAIN ENERGIZED!
    pole = await PoleModel.findOne({ poleId: 'P1' });
    expect(pole!.energized).toBe(true);
  });
});


