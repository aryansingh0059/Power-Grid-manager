import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app';
import { IncidentService } from '../src/incidents/IncidentService';
import { PoleModel } from '../src/db/models/Pole';
import { IncidentModel } from '../src/db/models/Incident';
import type { LocalizedFault } from '../src/localization/types';

describe('Incident & Ticket Workflow Lifecycle', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  const sampleFault: LocalizedFault = {
    faultType: 'span_fault',
    feederId: 'F1',
    dtId: 'DT-TEST-01',
    upstreamPoleId: 'P1',
    downstreamPoleId: 'P2',
    boundaryDescription: 'Span fault between P1 and P2',
    lat: 12.972,
    lon: 77.595,
    pincode: '560001',
    affectedPoleIds: ['P2', 'P3', 'P4'],
    affectedPoleCount: 3,
    reasons: ['Upstream P1 ON', 'Downstream P2 OFF'],
    confidence: 95,
    topologySource: 'recorded',
    precision: 'EXACT_SPAN',
  };

  it('1. Creates new incident ticket with status DETECTED and initial timeline', async () => {
    const inc = await IncidentService.createOrCorrelateIncident(sampleFault);

    expect(inc.incidentId).toMatch(/^INC-/);
    expect(inc.status).toBe('detected');
    expect(inc.affectedPoleIds).toEqual(['P2', 'P3', 'P4']);
    expect(inc.timeline).toHaveLength(1);
    expect(inc.timeline[0].status).toBe('detected');
  });

  it('2. Duplicate fault signal correlates into existing active ticket rather than creating a duplicate', async () => {
    // Second fault signal with extra pole P5
    const fault2: LocalizedFault = {
      ...sampleFault,
      affectedPoleIds: ['P2', 'P3', 'P4', 'P5'],
      affectedPoleCount: 4,
    };

    const correlated = await IncidentService.createOrCorrelateIncident(fault2);
    expect(correlated.affectedPoleIds).toContain('P5');
    expect(correlated.timeline.length).toBeGreaterThan(1);
    expect(correlated.timeline.some((t) => t.note?.includes('correlated'))).toBe(true);

    // Total incident count in DB should still be 1!
    const totalCount = await IncidentModel.countDocuments();
    expect(totalCount).toBe(1);
  });

  it('3. Normal operator workflow: ACKNOWLEDGED -> CREW_ASSIGNED -> RESOLVED', async () => {
    const active = await IncidentModel.findOne({ dtId: 'DT-TEST-01' });
    expect(active).not.toBeNull();
    const incId = active!.incidentId;

    // 1. Acknowledge
    const acked = await IncidentService.acknowledgeIncident(incId, 'Inspecting substation breaker');
    expect(acked.status).toBe('acknowledged');

    // 2. Assign Crew
    const assigned = await IncidentService.assignCrew(incId, 'CREW-07', 'KPTCL Line Crew Alpha');
    expect(assigned.status).toBe('crew_assigned');

    // Seed poles in DB as dark
    await PoleModel.create([
      { poleId: 'P2', lat: 12.9, lon: 77.5, feederId: 'F1', dtId: 'DT-TEST-01', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-P2', topologySource: 'recorded', energized: false },
      { poleId: 'P3', lat: 12.9, lon: 77.5, feederId: 'F1', dtId: 'DT-TEST-01', poleType: 'distribution', ward: 'W1', pincode: '560001', deviceId: 'DEV-P3', topologySource: 'recorded', energized: false },
    ]);

    // 3. Mark Resolved while dark -> RESOLVED must NOT imply VERIFIED!
    const resolved = await IncidentService.resolveIncident(incId, 'Replaced fuse link');
    expect(resolved.status).toBe('resolved');
  });

  it('4. RESOLVED while dark remains UNVERIFIED with clear pending status', async () => {
    const inc = await IncidentModel.findOne({ dtId: 'DT-TEST-01' });
    const verifyRes = await IncidentService.verifyRestoration(inc!.incidentId);

    expect(verifyRes.verified).toBe(false);
    expect(verifyRes.darkPoleCount).toBeGreaterThan(0);
    expect(verifyRes.incident.status).toBe('resolved'); // Did NOT move to closed!
  });

  it('5. Restoration telemetry automatically triggers VERIFIED -> CLOSED', async () => {
    // Simulate restoration telemetry: update poles to energized === true
    await PoleModel.updateMany(
      { poleId: { $in: ['P2', 'P3', 'P4', 'P5'] } },
      { $set: { energized: true, lastSeenAt: new Date() } }
    );

    const inc = await IncidentModel.findOne({ dtId: 'DT-TEST-01' });
    const verifyRes = await IncidentService.verifyRestoration(inc!.incidentId);

    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.incident.status).toBe('closed');
    expect(verifyRes.incident.closedAt).toBeDefined();
    expect(verifyRes.incident.timeline.some((t) => t.note?.includes('verified'))).toBe(true);
  });

  it('6. HTTP Router GET /api/incidents returns incident list', async () => {
    const res = await request(app).get('/api/incidents');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
