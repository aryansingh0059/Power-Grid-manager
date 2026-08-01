import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app';
import { LLMProvider } from '../src/ai/LLMProvider';
import { IncidentModel, type IIncident } from '../src/db/models/Incident';

describe('AI Incident Explanation & Deterministic Fallback', () => {
  let mongoServer: MongoMemoryServer;
  let testIncident: IIncident;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create a sample incident ticket in memory DB
    testIncident = await IncidentModel.create({
      incidentId: 'INC-AI-TEST-01',
      faultType: 'span_fault',
      status: 'detected',
      feederId: 'F1',
      dtId: 'DT1',
      affectedPoleIds: ['P3', 'P4', 'P5'],
      affectedPoleCount: 3,
      boundary: {
        upstreamPoleId: 'P2',
        downstreamPoleId: 'P3',
        description: 'Span fault between P2 and P3 (DT1)',
        topologySource: 'recorded',
        precision: 'EXACT_SPAN',
        confidence: 0.95,
      },
      pincode: '560001',
      lat: 12.972,
      lon: 77.595,
      detectedAt: new Date(),
      timeline: [
        {
          at: new Date().toISOString(),
          status: 'detected',
          note: 'Fault detected automatically',
          automated: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('1. Extracts structured facts accurately without altering confidence or ticket state', () => {
    const facts = LLMProvider.extractFacts(testIncident);

    expect(facts.incidentId).toBe('INC-AI-TEST-01');
    expect(facts.faultType).toBe('span_fault');
    expect(facts.confidence).toBe(95); // 0.95 -> 95
    expect(facts.precision).toBe('EXACT_SPAN');
    expect(facts.affectedPoleCount).toBe(3);
    expect(facts.status).toBe('detected');
  });

  it('2. Deterministic Fallback generates operator-friendly summary when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await LLMProvider.explainIncident(testIncident);

    expect(result.providerUsed).toBe('fallback');
    expect(result.summary).toContain('INC-AI-TEST-01');
    expect(result.summary).toContain('DT1');
    expect(result.summary).toContain('95%');
    expect(result.estimatedCostUsd).toBe(0);
  });

  it('3. HTTP POST /api/incidents/:id/explain endpoint triggers summary generation and updates DB document', async () => {
    const res = await request(app).post(`/api/incidents/${testIncident.incidentId}/explain`).send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.providerUsed).toBe('fallback');

    // Verify aiSummary was saved on the incident document in DB
    const updatedInDb = await IncidentModel.findOne({ incidentId: testIncident.incidentId });
    expect(updatedInDb!.aiSummary).toBeDefined();
    expect(updatedInDb!.aiSummary).toContain('INC-AI-TEST-01');
  });
});
