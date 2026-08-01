import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { telemetryRouter } from './routes/telemetry';
import { incidentsRouter } from './routes/incidents';

const app = express();

app.use(cors());
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/incidents', incidentsRouter);

// 404 catch-all (keeps the response JSON)
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

export { app };
