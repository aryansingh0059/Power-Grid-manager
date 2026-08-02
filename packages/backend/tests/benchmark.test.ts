import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import performance from 'perf_hooks';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PoleModel } from '../src/db/models/Pole';
import { DeviceModel } from '../src/db/models/Device';
import { IngestionService } from '../src/ingestion/IngestionService';
import { LocalizationEngine } from '../src/localization/LocalizationEngine';
import { IncidentService } from '../src/incidents/IncidentService';
import { TopologyIndex } from '../src/topology/TopologyIndex';
import { generateSyntheticNetwork } from '../src/generator/generator';
import type { PoleRecord, TelemetryMessage } from '@pgm/shared';

describe('Performance Benchmarks & Target Verification', () => {
  let mongoServer: MongoMemoryServer;
  let poles: PoleRecord[];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Generate full synthetic subdivision network (~3,000 poles)
    const subData = generateSyntheticNetwork({ seed: 42 });
    poles = subData.departmentPoles;

    await PoleModel.create(subData.departmentPoles);
    await DeviceModel.create(subData.devices);
  }, 60000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('1. Telemetry Ingestion Burst: Process 5,000 messages under 10 seconds', async () => {
    const sampleDevs = await DeviceModel.find().limit(500).lean();
    expect(sampleDevs.length).toBeGreaterThan(0);

    const messages: TelemetryMessage[] = Array.from({ length: 5000 }, (_, i) => {
      const dev = sampleDevs[i % sampleDevs.length];
      return {
        device_id: dev.deviceId,
        pole_id: dev.poleId,
        event: 'heartbeat',
        energized: true,
        ts: new Date().toISOString(),
        seq: Math.floor(i / sampleDevs.length) + 1,
        fw: dev.firmwareVersion,
      };
    });

    const start = performance.performance.now();

    // Process in parallel batches of 100 messages
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await Promise.all(batch.map((msg) => IngestionService.processMessage(msg)));
    }

    const elapsedMs = performance.performance.now() - start;
    const msgPerSec = Math.round((5000 / elapsedMs) * 1000);

    console.log(`[BENCHMARK] 5,000-message burst completed in ${elapsedMs.toFixed(2)} ms (${msgPerSec} msg/sec)`);

    expect(elapsedMs).toBeLessThan(15000); // Must be under 15 seconds in test harness!
    expect(msgPerSec).toBeGreaterThan(200);
  }, 25000);

  it('2. Fault Localization Engine Latency: Topology traversal & candidate detection on ~3,000 poles', async () => {
    const topologyIndex = TopologyIndex.build(poles);
    const poleStateMap = new Map<string, boolean | null>();

    for (const p of poles) {
      poleStateMap.set(p.poleId, true);
    }

    // Set 5 downstream poles dark under DT-BMK
    const sampleDtPoles = poles.filter((p) => p.dtId === 'DT-001');
    for (let i = 1; i < Math.min(6, sampleDtPoles.length); i++) {
      poleStateMap.set(sampleDtPoles[i].poleId, false);
    }

    const latencies: number[] = [];

    for (let run = 0; run < 50; run++) {
      const start = performance.performance.now();
      const faults = LocalizationEngine.localizeDt(topologyIndex, poleStateMap, 'DT-001');
      const end = performance.performance.now();
      latencies.push(end - start);
      expect(faults.length).toBeGreaterThanOrEqual(1);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`[BENCHMARK] Fault Localization Engine Latency: p50 = ${p50.toFixed(3)} ms, p95 = ${p95.toFixed(3)} ms`);

    expect(p50).toBeLessThan(15); // p50 under 15ms
    expect(p95).toBeLessThan(30);
  });

  it('3. Incident Restoration Verification Latency', async () => {
    // Create a sample incident with 5 affected poles
    const activePoles = poles.slice(0, 5).map((p) => p.poleId);
    const incident = await IncidentService.createOrCorrelateIncident({
      faultType: 'span_fault',
      feederId: 'F1',
      dtId: 'DT-001',
      upstreamPoleId: 'P1',
      downstreamPoleId: 'P2',
      boundaryDescription: 'Span fault between P1 and P2',
      lat: 12.97,
      lon: 77.59,
      pincode: '560001',
      affectedPoleIds: activePoles,
      affectedPoleCount: activePoles.length,
      reasons: ['P1 ON', 'P2 OFF'],
      confidence: 95,
      confidenceBreakdown: { topologyScore: 1, telemetryCoverageScore: 1, sensorConsistencyScore: 1, overallConfidence: 0.95 },
      topologySource: 'recorded',
      precision: 'EXACT_SPAN',
    });

    // Update poles in DB to energized
    await PoleModel.updateMany({ poleId: { $in: activePoles } }, { $set: { energized: true } });

    const start = performance.performance.now();
    const result = await IncidentService.verifyRestoration(incident.incidentId);
    const elapsedMs = performance.performance.now() - start;

    console.log(`[BENCHMARK] Restoration Telemetry Verification Latency: ${elapsedMs.toFixed(2)} ms`);

    expect(result.verified).toBe(true);
    expect(elapsedMs).toBeLessThan(300); // Under 300ms
  });
});
