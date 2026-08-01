import { Router, Request, Response } from 'express';
import { FaultSimulator } from '../simulator/FaultSimulator';
import type { ApiResponse } from '@pgm/shared';

const simulatorRouter = Router();

/**
 * POST /api/simulator/fault/span
 * Inject physical span fault between two poles.
 */
simulatorRouter.post('/fault/span', async (req: Request, res: Response) => {
  try {
    const { upstreamPoleId, downstreamPoleId, deterministic } = req.body || {};
    if (!upstreamPoleId || !downstreamPoleId) {
      const errRes: ApiResponse<null> = {
        success: false,
        error: 'Fields "upstreamPoleId" and "downstreamPoleId" are required',
      };
      return res.status(400).json(errRes);
    }

    const result = await FaultSimulator.injectSpanFault(upstreamPoleId, downstreamPoleId, {
      deterministic: Boolean(deterministic),
    });

    const okRes: ApiResponse<typeof result> = { success: true, data: result };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to inject span fault',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/simulator/fault/dt
 * Inject DT level outage.
 */
simulatorRouter.post('/fault/dt', async (req: Request, res: Response) => {
  try {
    const { dtId, deterministic } = req.body || {};
    if (!dtId) {
      const errRes: ApiResponse<null> = { success: false, error: 'Field "dtId" is required' };
      return res.status(400).json(errRes);
    }

    const result = await FaultSimulator.injectDtFault(dtId, {
      deterministic: Boolean(deterministic),
    });

    const okRes: ApiResponse<typeof result> = { success: true, data: result };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to inject DT fault',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/simulator/fault/feeder
 * Inject 11kV feeder outage.
 */
simulatorRouter.post('/fault/feeder', async (req: Request, res: Response) => {
  try {
    const { feederId, deterministic } = req.body || {};
    if (!feederId) {
      const errRes: ApiResponse<null> = { success: false, error: 'Field "feederId" is required' };
      return res.status(400).json(errRes);
    }

    const result = await FaultSimulator.injectFeederFault(feederId, {
      deterministic: Boolean(deterministic),
    });

    const okRes: ApiResponse<typeof result> = { success: true, data: result };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to inject feeder fault',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/simulator/device/kill
 * Silence an IoT device (device failure, power stays live).
 */
simulatorRouter.post('/device/kill', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body || {};
    if (!deviceId) {
      const errRes: ApiResponse<null> = { success: false, error: 'Field "deviceId" is required' };
      return res.status(400).json(errRes);
    }

    const result = await FaultSimulator.killDevice(deviceId);
    const okRes: ApiResponse<typeof result> = { success: true, data: result };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to kill device',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/simulator/repair
 * Repair an active fault and emit restoration telemetry.
 */
simulatorRouter.post('/repair', async (req: Request, res: Response) => {
  try {
    const { dtId, downstreamPoleId } = req.body || {};
    if (!dtId) {
      const errRes: ApiResponse<null> = { success: false, error: 'Field "dtId" is required' };
      return res.status(400).json(errRes);
    }

    const result = await FaultSimulator.repairFault(dtId, downstreamPoleId);
    const okRes: ApiResponse<typeof result> = { success: true, data: result };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to repair fault',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/simulator/scheduled-outage
 * Add a mock scheduled outage.
 */
simulatorRouter.post('/scheduled-outage', async (req: Request, res: Response) => {
  try {
    const outageData = req.body || {};
    const outage = await FaultSimulator.createScheduledOutage(outageData);
    const okRes: ApiResponse<typeof outage> = { success: true, data: outage };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to create scheduled outage',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * POST /api/simulator/run-localization
 * Runs localization pipeline over current state and returns detected count.
 */
simulatorRouter.post('/run-localization', async (_req: Request, res: Response) => {
  try {
    const count = await FaultSimulator.runLocalizationPipeline();
    const okRes: ApiResponse<{ incidentsCreatedOrUpdated: number }> = {
      success: true,
      data: { incidentsCreatedOrUpdated: count },
    };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to run localization pipeline',
    };
    return res.status(500).json(errRes);
  }
});

export { simulatorRouter };
