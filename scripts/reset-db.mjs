/**
 * Wipes every Expense Split collection. Destructive and intentional — this is
 * the "clean slate" tool used when the schema changes shape.
 *
 *   npm run db:reset
 *
 * It refuses to run without --yes so it can never fire by accident.
 */

import dns from 'dns';
import mongoose from 'mongoose';
import readline from 'readline';

const COLLECTIONS = [
  'users',
  'otps',
  'groups',
  'sessions',
  'settlements',
  'activities',
  'notifications',
  'pushsubscriptions',
];
const LEGACY = ['teams', 'expenses'];

if (!process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch {
    /* keep the platform resolver */
  }
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Run this with: npm run db:reset');
  process.exit(1);
}

async function confirm(dbName) {
  if (process.argv.includes('--yes')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve =>
    rl.question(`\nThis DELETES all data in "${dbName}". Type the database name to confirm: `, resolve)
  );
  rl.close();
  return answer.trim() === dbName;
}

const dbName = process.env.MONGODB_DB_NAME || 'expense_split_db';

await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

const existing = (await db.listCollections().toArray()).map(entry => entry.name);
console.log(`\nDatabase: ${dbName}`);
for (const name of existing) {
  console.log(`  ${name}: ${await db.collection(name).countDocuments()} documents`);
}

if (!(await confirm(dbName))) {
  console.log('\nCancelled. Nothing was changed.');
  await mongoose.disconnect();
  process.exit(0);
}

for (const name of [...COLLECTIONS, ...LEGACY]) {
  if (!existing.includes(name)) continue;
  await db.collection(name).drop();
  console.log(`  dropped ${name}`);
}

console.log('\nDone. Indexes are recreated on first use — or run `npm run db:indexes` now.\n');
await mongoose.disconnect();
