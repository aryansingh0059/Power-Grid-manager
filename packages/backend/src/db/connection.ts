import mongoose from 'mongoose';

/**
 * Opens the Mongoose connection.
 * Throws on failure so the caller can decide whether to abort or continue.
 */
export async function connectDB(
  uri: string,
  maxRetries = 10,
  delayMs = 2000
): Promise<void> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5_000,
      });
      console.log('[db] connected to MongoDB');
      return;
    } catch (err) {
      attempt++;
      console.warn(
        `[db] MongoDB connection attempt ${attempt}/${maxRetries} failed: ${(err as Error).message}`
      );
      if (attempt >= maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('[db] MongoDB reconnected');
});
