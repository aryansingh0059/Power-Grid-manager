import { Router, Request, Response } from 'express';
import { PoleModel } from '../db/models/Pole';
import { DTModel } from '../db/models/DistributionTransformer';
import { FeederModel } from '../db/models/Feeder';
import { SubstationModel } from '../db/models/Substation';
import type { ApiResponse } from '@pgm/shared';

const networkRouter = Router();

/**
 * GET /api/network/poles
 * Query poles for map rendering. Optional dtId or feederId filter.
 */
networkRouter.get('/poles', async (req: Request, res: Response) => {
  try {
    const { dtId, feederId, limit = '5000' } = req.query;

    const filter: Record<string, unknown> = {};
    if (typeof dtId === 'string' && dtId) filter.dtId = dtId;
    if (typeof feederId === 'string' && feederId) filter.feederId = feederId;

    const limitNum = Math.min(10000, Math.max(1, parseInt(limit as string, 10) || 5000));

    const poles = await PoleModel.find(filter).limit(limitNum).lean();

    const okRes: ApiResponse<typeof poles> = {
      success: true,
      data: poles,
    };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to query network poles',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * GET /api/network/dts
 * Query Distribution Transformers.
 */
networkRouter.get('/dts', async (req: Request, res: Response) => {
  try {
    const { feederId } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof feederId === 'string' && feederId) filter.feederId = feederId;

    const dts = await DTModel.find(filter).lean();
    const okRes: ApiResponse<typeof dts> = { success: true, data: dts };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to query DTs',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * GET /api/network/feeders
 * Query 11kV feeders.
 */
networkRouter.get('/feeders', async (_req: Request, res: Response) => {
  try {
    const feeders = await FeederModel.find().lean();
    const okRes: ApiResponse<typeof feeders> = { success: true, data: feeders };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to query feeders',
    };
    return res.status(500).json(errRes);
  }
});

/**
 * GET /api/network/substations
 * Query 11kV substations.
 */
networkRouter.get('/substations', async (_req: Request, res: Response) => {
  try {
    const substations = await SubstationModel.find().lean();
    const okRes: ApiResponse<typeof substations> = { success: true, data: substations };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to query substations',
    };
    return res.status(500).json(errRes);
  }
});

export { networkRouter };
