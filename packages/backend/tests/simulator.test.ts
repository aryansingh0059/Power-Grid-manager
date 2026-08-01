import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app';
import { PoleModel } from '../src/db/models/Pole';
import { DeviceModel } from '../src/db/models/Device';
import { IncidentModel } from '../src/db/models/Incident';
import { FIXTURE_POLES } from '../src/topology/fixture';

describe('Realistic Fault Simulator & End-to-End Pipeline', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Seed fixture poles and devices into DB
    await PoleModel.create(FIXTURE_POLES);
    await DeviceModel.create([
      { deviceId: 'DEV-001', poleId: 'P1', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
      { deviceId: 'DEV-002', poleId: 'P2', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
      { deviceId: 'DEV-003', poleId: 'P3', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
      { deviceId: 'DEV-004', poleId: 'P4', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
      { deviceId: 'DEV-005', poleId: 'P5', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('1. End-to-End: Inject span fault -> telemetry emitted -> localization -> ticket created', async () => {
    // Inject span fault between P2 and P3 (deterministic = true)
    const injectRes = await request(app)
      .post('/api/simulator/fault/span')
      .send({ upstreamPoleId: 'P2', downstreamPoleId: 'P3', deterministic: true });

    expect(injectRes.status).toBe(200);
    expect(injectRes.body.success).toBe(true);
    expect(injectRes.body.data.affectedPoleCount).toBe(2); // P3 and P4

    // Run localization pipeline
    const locRes = await request(app)
      .post('/api/simulator/run-localization')
      .send();

    expect(locRes.status).toBe(200);
    expect(locRes.body.success).toBe(true);

    // Verify incident ticket was created in DB!
    const incident = await IncidentModel.findOne({ dtId: 'DT1', status: 'detected' });
    expect(incident).not.toBeNull();
    expect(incident!.boundary.upstreamPoleId).toBe('P2');
    expect(incident!.boundary.downstreamPoleId).toBe('P3');
    expect(incident!.affectedPoleIds).toEqual(['P3', 'P4']);
  });

  it('2. End-to-End: Repair fault -> restoration telemetry -> auto verification/closure', async () => {
    const activeInc = await IncidentModel.findOne({ dtId: 'DT1' });
    expect(activeInc).not.toBeNull();

    // Repair fault on DT1
    const repairRes = await request(app)
      .post('/api/simulator/repair')
      .send({ dtId: 'DT1', downstreamPoleId: 'P3' });

    expect(repairRes.status).toBe(200);
    expect(repairRes.body.success).toBe(true);

    // Ticket MUST be automatically verified & closed!
    const closedInc = await IncidentModel.findOne({ incidentId: activeInc!.incidentId });
    expect(closedInc!.status).toBe('closed');
    expect(closedInc!.closedAt).toBeDefined();
  });

  it('3. Kill device (hardware failure while power healthy) -> no outage ticket generated', async () => {
    // Kill device on P5
    const killRes = await request(app)
      .post('/api/simulator/device/kill')
      .send({ deviceId: 'DEV-005' });

    expect(killRes.status).toBe(200);
    expect(killRes.body.success).toBe(true);

    // Run localization
    await request(app).post('/api/simulator/run-localization').send();

    // Check P5 state in DB: pole P5 is still energized === true!
    const p5 = await PoleModel.findOne({ poleId: 'P5' });
    expect(p5!.energized).toBe(true);

    // Device is offline
    const dev5 = await DeviceModel.findOne({ deviceId: 'DEV-005' });
    expect(dev5!.isOnline).toBe(false);

    // NO new active tickets created for P5!
    const p5Inc = await IncidentModel.findOne({ 'boundary.downstreamPoleId': 'P5', status: 'detected' });
    expect(p5Inc).toBeNull();
  });
});
