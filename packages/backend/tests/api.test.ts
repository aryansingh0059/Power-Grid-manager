import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app';
import { PoleModel } from '../src/db/models/Pole';
import { DTModel } from '../src/db/models/DistributionTransformer';
import { FeederModel } from '../src/db/models/Feeder';
import { SubstationModel } from '../src/db/models/Substation';
import { DeviceModel } from '../src/db/models/Device';
import { FIXTURE_POLES } from '../src/topology/fixture';

describe('Complete Operator API Surface Integration Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Seed mock database records
    await SubstationModel.create({ substationId: 'SUB-01', name: 'Central Substation', lat: 12.97, lon: 77.59 });
    await FeederModel.create({ feederId: 'F1', name: 'Feeder 1 (11kV)', substationId: 'SUB-01' });
    await DTModel.create({ dtId: 'DT1', name: 'DT-01', feederId: 'F1', lat: 12.971, lon: 77.594, hasRecordedTopology: true });
    await PoleModel.create(FIXTURE_POLES);
    await DeviceModel.create([
      { deviceId: 'DEV-001', poleId: 'P1', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
      { deviceId: 'DEV-002', poleId: 'P2', firmwareVersion: '1.4.2', bootCount: 1, isOnline: true },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('1. GET /api/health returns HTTP 200 with system status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });

  it('2. GET /api/network/poles returns list of poles', async () => {
    const res = await request(app).get('/api/network/poles');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('3. GET /api/network/dts, feeders, substations return infrastructure lists', async () => {
    const resDts = await request(app).get('/api/network/dts');
    expect(resDts.status).toBe(200);
    expect(resDts.body.data.length).toBe(1);

    const resFeeders = await request(app).get('/api/network/feeders');
    expect(resFeeders.status).toBe(200);
    expect(resFeeders.body.data.length).toBe(1);

    const resSubs = await request(app).get('/api/network/substations');
    expect(resSubs.status).toBe(200);
    expect(resSubs.body.data.length).toBe(1);
  });

  it('4. POST /api/telemetry ingests IoT message', async () => {
    const body = {
      device_id: 'DEV-001',
      pole_id: 'P1',
      event: 'heartbeat',
      energized: true,
      ts: new Date().toISOString(),
      seq: 100,
    };

    const res = await request(app).post('/api/telemetry').send(body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deviceId).toBe('DEV-001');
  });

  it('5. GET /api/telemetry/recent returns recent events', async () => {
    const res = await request(app).get('/api/telemetry/recent');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('6. POST /api/simulator/fault/span -> runs localization -> tickets generated', async () => {
    const injectRes = await request(app)
      .post('/api/simulator/fault/span')
      .send({ upstreamPoleId: 'P2', downstreamPoleId: 'P3', deterministic: true });

    expect(injectRes.status).toBe(200);

    const runRes = await request(app).post('/api/simulator/run-localization').send();
    expect(runRes.status).toBe(200);
    expect(runRes.body.data.incidentsCreatedOrUpdated).toBeGreaterThan(0);
  });

  it('7. GET /api/incidents and GET /api/incidents/:id return active tickets', async () => {
    const listRes = await request(app).get('/api/incidents');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    const incidentId = listRes.body.data[0].incidentId;
    const detailRes = await request(app).get(`/api/incidents/${incidentId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.incidentId).toBe(incidentId);
  });

  it('8. Operator Actions: acknowledge, assign-crew, resolve, verify', async () => {
    const listRes = await request(app).get('/api/incidents');
    const incidentId = listRes.body.data[0].incidentId;

    // Acknowledge
    const ackRes = await request(app).post(`/api/incidents/${incidentId}/acknowledge`).send({ note: 'Acked' });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe('acknowledged');

    // Assign Crew
    const crewRes = await request(app).post(`/api/incidents/${incidentId}/assign-crew`).send({ crewId: 'C1', crewName: 'Crew 1' });
    expect(crewRes.status).toBe(200);
    expect(crewRes.body.data.status).toBe('crew_assigned');

    // Repair via simulator & verify
    await request(app).post('/api/simulator/repair').send({ dtId: 'DT1' });
    const verifyRes = await request(app).post(`/api/incidents/${incidentId}/verify`).send();
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
  });

  it('9. GET /api/outages returns scheduled outages', async () => {
    await request(app).post('/api/simulator/scheduled-outage').send({
      feederId: 'F1',
      description: 'Scheduled Grid Maintenance',
    });

    const res = await request(app).get('/api/outages');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
