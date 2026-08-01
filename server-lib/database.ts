import mongoose from 'mongoose';
import dns from 'dns';

// Ensure Node.js can resolve MongoDB Atlas SRV records in local environments
if (!process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch {
    // Ignore fallback if custom DNS setup fails
  }
}

let connection: Promise<typeof mongoose> | undefined;

export function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured on the server.');

  if (!connection) {
    connection = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME || 'expense_split_db',
      serverSelectionTimeoutMS: 10000
    }).then(m => {
      console.log(`[Database] Connected to MongoDB database: "${m.connection.name}"`);
      return m;
    });
  }

  return connection;
}
