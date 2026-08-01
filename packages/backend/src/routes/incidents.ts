import { Router, Request, Response } from 'express';
import { IncidentModel } from '../db/models/Incident';
import { IncidentService } from '../incidents/IncidentService';
import { LLMProvider } from '../ai/LLMProvider';
import type { ApiResponse } from '@pgm/shared';

const incidentsRouter = Router();

/**
 * GET /api/incidents
 * Query list of incidents with optional filters (status, feederId, dtId, pincode).
 */
incidentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, feederId, dtId, pincode, limit = '50' } = req.query;

    const filter: Record<string, unknown> = {};
    if (typeof status === 'string' && status) filter.status = status;
    if (typeof feederId === 'string' && feederId) filter.feederId = feederId;
    if (typeof dtId === 'string' && dtId) filter.dtId = dtId;
    if (typeof pincode === 'string' && pincode) filter.pincode = pincode;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));

    const incidents = await IncidentModel.find(filter)
      .sort({ detectedAt: -1 })
      .limit(limitNum);

    const okRes: ApiResponse<typeof incidents> = {
      success: true,
      data: incidents,
    };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to query incidents',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * GET /api/incidents/:id
 * Retrieve single incident details with full timeline.
 */
incidentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const incident = await IncidentModel.findOne({ incidentId });

    if (!incident) {
      const errRes: ApiResponse<null> = { success: false, error: `Incident ${incidentId} not found` };
      return res.status(404).json(errRes);
    }

    const okRes: ApiResponse<typeof incident> = { success: true, data: incident };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to fetch incident details',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/incidents/:id/acknowledge
 * Operator acknowledges an active ticket.
 */
incidentsRouter.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const { note } = req.body || {};

    const incident = await IncidentService.acknowledgeIncident(incidentId, note);
    const okRes: ApiResponse<typeof incident> = { success: true, data: incident };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to acknowledge incident',
    };
    return res.status(400).json(errRes);
  }
});

/**
 * POST /api/incidents/:id/assign-crew
 * Assigns a field repair crew to an incident.
 */
incidentsRouter.post('/:id/assign-crew', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const { crewId, crewName } = req.body || {};

    if (!crewId || !crewName) {
      const errRes: ApiResponse<null> = {
        success: false,
        error: 'Fields "crewId" and "crewName" are required',
      };
      return res.status(400).json(errRes);
    }

    const incident = await IncidentService.assignCrew(incidentId, crewId, crewName);
    const okRes: ApiResponse<typeof incident> = { success: true, data: incident };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to assign crew to incident',
    };
    return res.status(400).json(errRes);
  }
});

/**
 * POST /api/incidents/:id/resolve
 * Marks repair work resolved (does NOT imply verified).
 */
incidentsRouter.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const { note } = req.body || {};

    const incident = await IncidentService.resolveIncident(incidentId, note);
    const okRes: ApiResponse<typeof incident> = { success: true, data: incident };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to resolve incident',
    };
    return res.status(400).json(errRes);
  }
});

/**
 * POST /api/incidents/:id/verify
 * Triggers telemetry restoration verification.
 */
/**
 * POST /api/incidents/:id/verify
 * Triggers telemetry restoration verification.
 */
incidentsRouter.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const result = await IncidentService.verifyRestoration(incidentId);

    const okRes: ApiResponse<typeof result> = { success: true, data: result };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to verify incident restoration',
    };
    return res.status(400).json(errRes);
  }
});

/**
 * POST /api/incidents/:id/explain
 * Generates an operator-facing explanation via LLM API or deterministic fallback.
 */
incidentsRouter.post('/:id/explain', async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;
    const incident = await IncidentModel.findOne({ incidentId });

    if (!incident) {
      const errRes: ApiResponse<null> = { success: false, error: `Incident ${incidentId} not found` };
      return res.status(404).json(errRes);
    }

    const explanation = await LLMProvider.explainIncident(incident);

    // Save summary in incident document
    incident.aiSummary = explanation.summary;
    await incident.save();

    const okRes: ApiResponse<typeof explanation> = { success: true, data: explanation };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to generate incident explanation',
    };
    return res.status(500).json(errRes);
  }
});

export { incidentsRouter };
