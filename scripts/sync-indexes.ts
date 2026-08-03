/**
 * Creates every index declared in the schemas. Mongoose builds these lazily in
 * the background, so running this once after a reset (or after adding an index)
 * makes the first real query fast instead of the tenth.
 *
 *   npm run db:indexes
 */

import { connectToDatabase } from '../server/db.js';
import {
  ActivityModel,
  Group,
  NotificationModel,
  Otp,
  SessionModel,
  SettlementModel,
  User,
} from '../server/models.js';
import mongoose from 'mongoose';

const models = [
  ['users', User],
  ['otps', Otp],
  ['groups', Group],
  ['sessions', SessionModel],
  ['settlements', SettlementModel],
  ['activities', ActivityModel],
  ['notifications', NotificationModel],
] as const;

await connectToDatabase();

for (const [label, model] of models) {
  await model.syncIndexes();
  const indexes = await model.collection.indexes();
  console.log(`${label}: ${indexes.map(index => index.name).join(', ')}`);
}

console.log('\nAll indexes are in place.');
await mongoose.disconnect();
