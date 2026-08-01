import { Router, Request, Response } from 'express';
import { ScheduledOutageModel } from '../db/models/ScheduledOutage';
import type { ApiResponse } from '@pgm/shared';

const outagesRouter = Router();

/**
 * GET /api/outages
 * Query list of scheduled outages.
 */
outagesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, feederId, dtId } = req.query;

    const filter: Record<string, unknown> = {};
    if (typeof status === 'string' && status) filter.status = status;
    if (typeof feederId === 'string' && feederId) filter.feederId = feederId;
    if (typeof dtId === 'string' && dtId) filter.dtId = dtId;

    const outages = await ScheduledOutageModel.find(filter)
      .sort({ startAt: -1 })
      .lean();

    const okRes: ApiResponse<typeof outages> = { success: true, data: outages };
    return res.json(okRes);
  } catch (err: unknown) {
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Failed to query scheduled outages',
    };
    return res.status(500).json(errRes);
  }
});

export { outagesRouter };
