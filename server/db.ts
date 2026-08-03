import dns from 'dns';
import mongoose from 'mongoose';

// Local Windows/ISP resolvers frequently fail on MongoDB Atlas SRV lookups.
if (!process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch {
    // Keep the platform resolver if this environment disallows changing it.
  }
}

let connection: Promise<typeof mongoose> | undefined;

/** Cached across serverless invocations so warm lambdas reuse one pool. */
export function connectToDatabase(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured on the server.');

  if (!connection) {
    connection = mongoose
      .connect(uri, {
        dbName: process.env.MONGODB_DB_NAME || 'expense_split_db',
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: 10,
      })
      .catch(error => {
        // Let the next request retry instead of caching a rejected promise.
        connection = undefined;
        throw error;
      });
  }

  return connection;
}
