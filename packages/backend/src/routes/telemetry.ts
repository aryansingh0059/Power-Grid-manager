import { Router, Request, Response } from 'express';
import { validateTelemetryPayload } from '../ingestion/validation';
import { IngestionService } from '../ingestion/IngestionService';
import type { ApiResponse } from '@pgm/shared';
import type { IngestionResult } from '../ingestion/IngestionService';

const telemetryRouter = Router();

/**
 * POST /api/telemetry
 * Ingests single IoT telemetry message or array of telemetry messages.
 */
telemetryRouter.post('/', async (req: Request, res: Response) => {
  try {
    const isArray = Array.isArray(req.body);
    const items = isArray ? req.body : [req.body];

    if (items.length === 0) {
      const errRes: ApiResponse<null> = { success: false, error: 'Empty payload array' };
      return res.status(400).json(errRes);
    }

    const results: IngestionResult[] = [];

    for (const item of items) {
      const validation = validateTelemetryPayload(item);
      if (!validation.valid || !validation.message) {
        const errRes: ApiResponse<null> = {
          success: false,
          error: validation.error ?? 'Invalid telemetry payload',
        };
        return res.status(400).json(errRes);
      }

      const result = await IngestionService.processMessage(validation.message);
      results.push(result);
    }

    const responseData = isArray ? results : results[0];
    const okRes: ApiResponse<typeof responseData> = {
      success: true,
      data: responseData,
    };

    return res.status(200).json(okRes);
  } catch (err: unknown) {
    console.error('[api/telemetry] error:', err);
    const errRes: ApiResponse<null> = {
      success: false,
      error: (err as Error).message || 'Internal telemetry ingestion error',
    };
    return res.status(500).json(errRes);
  }
});

export { telemetryRouter };
