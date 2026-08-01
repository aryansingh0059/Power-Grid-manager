import mongoose from 'mongoose';

/**
 * Opens the Mongoose connection.
 * Throws on failure so the caller can decide whether to abort or continue.
 */
export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri, {
    // Fail fast rather than hanging during startup
    serverSelectionTimeoutMS: 5_000,
  });
  console.log('[db] connected to MongoDB');
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('[db] MongoDB reconnected');
});
