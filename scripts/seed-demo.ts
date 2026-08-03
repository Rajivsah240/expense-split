/**
 * Seeds a demo group with the spec's own examples and prints a sign-in token.
 * Used for visual checks and manual walkthroughs.
 *
 *   npm run seed:demo              create
 *   npm run seed:demo -- --clean   remove everything it created
 */

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectToDatabase } from '../server/db.js';
import {
  ActivityModel,
  Group,
  NotificationModel,
  SessionModel,
  SettlementModel,
  User,
} from '../server/models.js';
import { parseExpenseText } from '../shared/parser.js';

const TAG = 'demo_seed';
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

await connectToDatabase();

async function cleanup() {
  const users = await User.find({ email: { $regex: `@${TAG}\\.invalid$` } }).select('_id');
  const ids = users.map(user => user._id.toString());
  const groups = await Group.find({ ownerId: { $in: ids } }).select('_id');
  for (const group of groups) {
    const groupId = group._id.toString();
    await SessionModel.deleteMany({ groupId });
    await SettlementModel.deleteMany({ groupId });
    await ActivityModel.deleteMany({ groupId });
    await NotificationModel.deleteMany({ groupId });
    await Group.deleteOne({ _id: groupId });
  }
  await NotificationModel.deleteMany({ userId: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  console.log(`Removed ${users.length} demo user(s) and ${groups.length} demo group(s).`);
}

if (process.argv.includes('--clean')) {
  await cleanup();
  await mongoose.disconnect();
  process.exit(0);
}

await cleanup();

const people = [
  ['Rajiv', 'rajiv_demo'],
  ['Ashutosh', 'ashutosh_demo'],
  ['Bastav', 'bastav_demo'],
] as const;

const actors: { userId: string; token: string; displayName: string; username: string }[] = [];
for (const [displayName, username] of people) {
  const user = await User.create({
    email: `${username}@${TAG}.invalid`,
    displayName,
    username,
    usernameLower: username,
    profileComplete: true,
  });
  actors.push({
    userId: user._id.toString(),
    token: jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET as string, { expiresIn: '7d' }),
    displayName,
    username,
  });
}

const [rajiv, ashutosh, bastav] = actors;

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(data)}`);
  return data as T;
}

const { group } = await call<{ group: { id: string; inviteCode: string } }>(rajiv.token, 'POST', 'groups', {
  name: 'Flat 302',
  emoji: '🏠',
});
const groupId = group.id;

await call(rajiv.token, 'POST', `groups/${groupId}/members`, { username: ashutosh.username });
await call(rajiv.token, 'POST', `groups/${groupId}/members`, { username: bastav.username });

const members = actors.map(actor => ({
  userId: actor.userId,
  displayName: actor.displayName,
  username: actor.username,
}));

const dayOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const trips: { days: number; payer: typeof rajiv; shop: string; notes?: string; text: string }[] = [
  {
    days: 0,
    payer: rajiv,
    shop: 'Reliance Fresh',
    notes: 'Weekly groceries',
    text: `Vegetables - 130/3
Milk - 100/3
Chocolate - 20 B
Biscuit - 40 Rajiv
Juice - 20 Ashutosh`,
  },
  {
    days: 1,
    payer: ashutosh,
    shop: 'Meat shop',
    text: `Chicken - 420 AR
Paneer - 180 A,R
Soap - 40 (B)`,
  },
  {
    days: 3,
    payer: bastav,
    shop: 'Corner store',
    text: `Milk 60 /3
Eggs=120 R
Rice 300 all
Detergent 210 all`,
  },
  {
    days: 6,
    payer: rajiv,
    shop: 'Big Bazaar',
    notes: 'Monthly stock-up',
    text: `Atta 450 all
Oil 340 all
Sugar 90 all
Shampoo 260 Ashutosh
Toothpaste 95 B`,
  },
  {
    days: 9,
    payer: ashutosh,
    shop: '',
    text: `Tomato 45 /3
Onion 60 /3
Coriander 15 all
Paneer 180 AR`,
  },
  {
    days: 14,
    payer: bastav,
    shop: 'Reliance Fresh',
    text: `Bread 45 all
Butter 55 all
Coffee 380 RB
Chips 40 B`,
  },
  {
    days: 21,
    payer: rajiv,
    shop: 'Vegetable market',
    text: `Vegetables 220 all
Fruits 180 all
Curd 45 /3`,
  },
  {
    days: 34,
    payer: ashutosh,
    shop: 'DMart',
    notes: 'Last month',
    text: `Rice 620 all
Dal 240 all
Masala 160 all
Dettol 85 all
Face wash 320 Ashutosh`,
  },
];

let count = 0;
for (const trip of trips) {
  const parsed = parseExpenseText(trip.text, {
    members,
    payerId: trip.payer.userId,
    assumeSharedWhenUnspecified: true,
  });
  if (parsed.rows.some(row => row.needsOwners)) {
    throw new Error(`Seed text failed to parse cleanly: ${JSON.stringify(parsed.rows.filter(r => r.needsOwners))}`);
  }
  await call(trip.payer.token, 'POST', `groups/${groupId}/sessions`, {
    date: dayOffset(trip.days),
    shop: trip.shop,
    notes: trip.notes ?? '',
    paidBy: trip.payer.userId,
    source: 'text',
    items: parsed.rows.map(row => ({
      name: row.name,
      amount: row.amount,
      owners: row.owners,
      category: row.category,
    })),
  });
  count += 1;
}

// One historical settlement, so the history view has something in it.
await call(bastav.token, 'POST', `groups/${groupId}/settlements`, {
  fromUser: bastav.userId,
  toUser: rajiv.userId,
  amount: 25000,
  note: 'UPI',
});

const state = await call<{ balances: { userId: string; net: number }[]; totals: { groupTotal: number } }>(
  rajiv.token,
  'GET',
  `groups/${groupId}/state?since=0`
);

console.log(`\nSeeded "Flat 302" with ${count} shopping trips.`);
console.log(`Group total: ₹${(state.totals.groupTotal / 100).toFixed(2)}`);
for (const balance of state.balances) {
  const actor = actors.find(entry => entry.userId === balance.userId);
  console.log(`  ${actor?.displayName ?? balance.userId}: ₹${(balance.net / 100).toFixed(2)}`);
}
console.log(`\nGROUP_ID=${groupId}`);
console.log(`TOKEN=${rajiv.token}`);

await mongoose.disconnect();
