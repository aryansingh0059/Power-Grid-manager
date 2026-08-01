import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { HealthResponse } from '@pgm/shared';

const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const dbStatus: HealthResponse['db'] =
    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    db: dbStatus,
  };

  res.json(body);
});

export { healthRouter };
