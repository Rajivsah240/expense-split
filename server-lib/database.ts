import mongoose from 'mongoose';

let connection: Promise<typeof mongoose> | undefined;

export function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured on the server.');

  if (!connection) {
    connection = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  }

  return connection;
}
