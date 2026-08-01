import 'dotenv/config';
import { app } from './app';
import { connectDB } from './db/connection';

const PORT = Number(process.env.PORT ?? 4000);
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/pgm';

async function start(): Promise<void> {
  try {
    await connectDB(MONGO_URI);
  } catch (err) {
    // Start the HTTP server even if MongoDB is unavailable on boot.
    // The health endpoint will report db: "disconnected" in that case.
    // Mongoose will automatically retry the connection in the background.
    console.warn('[startup] MongoDB unavailable — starting without DB:', (err as Error).message);
  }

  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[startup] fatal:', err);
  process.exit(1);
});
