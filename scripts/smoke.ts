/**
 * End-to-end API check against a running dev server.
 *
 *   npm run dev          (in one terminal)
 *   npm run smoke        (in another)
 *
 * It creates three throwaway users, drives every route the app uses, asserts the
 * money invariants after each mutation, and deletes everything it created. Safe
 * to run against a real database: it only ever touches its own records.
 */

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { connectToDatabase } from '../server/db.js';
import {
  ActivityModel,
  Group,
  NotificationModel,
  SessionModel,
  SettlementModel,
  User,
} from '../server/models.js';
import { formatMoney } from '../shared/money.js';
import { parseExpenseText } from '../shared/parser.js';
import type { GroupState, MemberBalance, Session } from '../shared/types.js';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SUFFIX = Math.random().toString(36).slice(2, 8);

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

const netOf = (balances: MemberBalance[], userId: string) =>
  balances.find(entry => entry.userId === userId)?.net ?? 0;

await connectToDatabase();

// ── Throwaway accounts ───────────────────────────────────────────────────────
const people = [
  { key: 'rajiv', displayName: 'Rajiv', username: `smoke_rajiv_${SUFFIX}` },
  { key: 'ashutosh', displayName: 'Ashutosh', username: `smoke_ashu_${SUFFIX}` },
  { key: 'bastav', displayName: 'Bastav', username: `smoke_bastav_${SUFFIX}` },
] as const;

const actors: Record<string, { userId: string; token: string; displayName: string; username: string }> = {};

for (const person of people) {
  const created = await User.create({
    email: `smoke_${person.key}_${SUFFIX}@example.invalid`,
    displayName: person.displayName,
    username: person.username,
    usernameLower: person.username.toLowerCase(),
    profileComplete: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  actors[person.key] = {
    userId: created._id.toString(),
    token: jwt.sign({ sub: created._id.toString() }, process.env.JWT_SECRET as string, { expiresIn: '1h' }),
    displayName: person.displayName,
    username: person.username,
  };
}

const rajiv = actors.rajiv;
const ashutosh = actors.ashutosh;
const bastav = actors.bastav;

let groupId = '';

try {
  console.log('\n── Auth ──');
  const me = await call<{ user: { userId: string; displayName: string } }>(rajiv.token, 'GET', 'me');
  check('GET /me', me.status === 200 && me.data.user.displayName === 'Rajiv', JSON.stringify(me.data));

  const noAuth = await call('', 'GET', 'me');
  check('unauthenticated request is rejected', noAuth.status === 401, String(noAuth.status));

  const badEmail = await call(rajiv.token, 'POST', 'auth/request-otp', { email: 'not-an-email' });
  check('invalid email rejected', badEmail.status === 400, String(badEmail.status));

  const badCode = await call('', 'POST', 'auth/verify-otp', { email: 'nobody@example.invalid', code: '000000' });
  check('unknown OTP rejected', badCode.status === 400, String(badCode.status));

  const available = await call<{ available: boolean }>(
    rajiv.token,
    'GET',
    `me/username-available?username=${ashutosh.username}`
  );
  check('taken username reported unavailable', available.status === 200 && !available.data.available);

  console.log('\n── SMTP transport ──');
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 12000,
    });
    await transport.verify();
    check('SMTP credentials accepted (no email sent)', true);
  } catch (error) {
    check('SMTP credentials accepted (no email sent)', false, (error as Error).message);
  }

  console.log('\n── Group ──');
  const created = await call<{ group: { id: string; inviteCode: string } }>(rajiv.token, 'POST', 'groups', {
    name: `Smoke Flat ${SUFFIX}`,
    emoji: '🏠',
  });
  check('create group', created.status === 201 && Boolean(created.data.group.id));
  groupId = created.data.group.id;
  const inviteCode = created.data.group.inviteCode;
  check('invite code issued', /^[A-Z0-9]{7}$/.test(inviteCode), inviteCode);

  const added = await call<{ group: { members: unknown[] } }>(rajiv.token, 'POST', `groups/${groupId}/members`, {
    username: ashutosh.username,
  });
  check('owner adds a member by username', added.status === 200 && added.data.group.members.length === 2);

  const joined = await call<{ group: { members: unknown[] } }>(bastav.token, 'POST', 'groups/join', {
    code: inviteCode,
  });
  check('member joins with invite code', joined.status === 200 && joined.data.group.members.length === 3);

  const outsiderAdd = await call(ashutosh.token, 'POST', `groups/${groupId}/members`, {
    username: rajiv.username,
  });
  check('non-owner cannot add members', outsiderAdd.status === 403, String(outsiderAdd.status));

  console.log('\n── Parse and save the spec examples ──');
  const members = [
    { userId: rajiv.userId, displayName: 'Rajiv', username: rajiv.username },
    { userId: ashutosh.userId, displayName: 'Ashutosh', username: ashutosh.username },
    { userId: bastav.userId, displayName: 'Bastav', username: bastav.username },
  ];

  const parsed = parseExpenseText(
    `Reliance Fresh
Vegetables - 130/3
Milk - 100/3
Chocolate - 20 B
Biscuit - 40 Rajiv
Juice - 20 Ashutosh
Chicken - 420 AR
Paneer - 180 A,R
Soap - 40 (B)
Eggs=120 R
Rice 300 all`,
    { members, payerId: rajiv.userId, assumeSharedWhenUnspecified: true }
  );
  check('parser read all 10 lines', parsed.rows.length === 10, `got ${parsed.rows.length}`);
  check('parser found the shop', parsed.shop === 'Reliance Fresh', parsed.shop);
  check('parser is confident', parsed.confidence >= 0.85, String(parsed.confidence));

  const savedSession = await call<{ session: Session }>(rajiv.token, 'POST', `groups/${groupId}/sessions`, {
    date: new Date().toISOString().slice(0, 10),
    shop: parsed.shop,
    notes: 'Weekly groceries',
    paidBy: rajiv.userId,
    source: 'text',
    items: parsed.rows.map(row => ({
      name: row.name,
      amount: row.amount,
      owners: row.owners,
      category: row.category,
    })),
  });
  check('save session', savedSession.status === 201, JSON.stringify(savedSession.data).slice(0, 200));

  const session = savedSession.data.session;
  const shareSum = Object.values(session.shares).reduce((sum, value) => sum + value, 0);
  check('session shares sum exactly to total', shareSum === session.total, `${shareSum} vs ${session.total}`);
  check(
    'every item splits exactly',
    session.items.every(
      item => Object.values(item.shares).reduce((sum, value) => sum + value, 0) === item.amount
    )
  );
  check('total is ₹1370', session.total === 137000, formatMoney(session.total));

  // Second payer, so balances are non-trivial.
  const second = await call<{ session: Session }>(ashutosh.token, 'POST', `groups/${groupId}/sessions`, {
    date: new Date().toISOString().slice(0, 10),
    shop: 'Corner shop',
    paidBy: ashutosh.userId,
    source: 'manual',
    items: [
      { name: 'Milk', amount: 10000, owners: [rajiv.userId, ashutosh.userId, bastav.userId], category: 'Dairy' },
      { name: 'Shampoo', amount: 15000, owners: [bastav.userId], category: 'Personal Care' },
    ],
  });
  check('second member can add a session', second.status === 201);

  console.log('\n── Validation ──');
  const noOwners = await call(rajiv.token, 'POST', `groups/${groupId}/sessions`, {
    paidBy: rajiv.userId,
    items: [{ name: 'Mystery', amount: 5000, owners: [], category: 'Miscellaneous' }],
  });
  check('item with no owners rejected', noOwners.status === 400, String(noOwners.status));

  const strangerOwner = await call(rajiv.token, 'POST', `groups/${groupId}/sessions`, {
    paidBy: rajiv.userId,
    items: [{ name: 'Ghost', amount: 5000, owners: ['507f1f77bcf86cd799439011'], category: 'Miscellaneous' }],
  });
  check('owner outside the group rejected', strangerOwner.status === 400, String(strangerOwner.status));

  const zeroAmount = await call(rajiv.token, 'POST', `groups/${groupId}/sessions`, {
    paidBy: rajiv.userId,
    items: [{ name: 'Free', amount: 0, owners: [rajiv.userId], category: 'Miscellaneous' }],
  });
  check('zero amount rejected', zeroAmount.status === 400, String(zeroAmount.status));

  // A client trying to dictate its own shares must be ignored, not trusted.
  const forged = await call<{ session: Session }>(rajiv.token, 'POST', `groups/${groupId}/sessions`, {
    paidBy: rajiv.userId,
    items: [
      {
        name: 'Forged shares',
        amount: 10000,
        owners: [rajiv.userId, ashutosh.userId],
        category: 'Miscellaneous',
        shares: { [rajiv.userId]: 1, [ashutosh.userId]: 99999 },
      },
    ],
  });
  check(
    'client-supplied shares are ignored',
    forged.status === 201 && forged.data.session.items[0].shares[rajiv.userId] === 5000,
    JSON.stringify(forged.data.session?.items?.[0]?.shares)
  );
  await call(rajiv.token, 'DELETE', `groups/${groupId}/sessions/${forged.data.session.id}`);

  console.log('\n── State sync and balances ──');
  const state = await call<GroupState>(rajiv.token, 'GET', `groups/${groupId}/state?since=0`);
  check('state snapshot', state.status === 200 && state.data.full === true);
  check('snapshot lists both sessions', state.data.sessions.length === 2, String(state.data.sessions.length));

  const netTotal = state.data.balances.reduce((sum, entry) => sum + entry.net, 0);
  check('balances sum to zero', netTotal === 0, String(netTotal));
  check(
    'direct transfers retain each original payer',
    state.data.transfers.some(transfer => transfer.to === rajiv.userId) &&
      state.data.transfers.some(transfer => transfer.to === ashutosh.userId),
    JSON.stringify(state.data.transfers)
  );
  check(
    'group total matches sessions',
    state.data.totals.groupTotal === 137000 + 25000,
    formatMoney(state.data.totals.groupTotal)
  );
  check('activity log recorded every change', state.data.activities.length >= 5, String(state.data.activities.length));

  const ashutoshState = await call<GroupState>(ashutosh.token, 'GET', `groups/${groupId}/state?since=0`);
  check(
    'every member sees identical balances',
    JSON.stringify(ashutoshState.data.balances) === JSON.stringify(state.data.balances)
  );
  check('members are notified of others activity', ashutoshState.data.unreadCount > 0, String(ashutoshState.data.unreadCount));

  const delta = await call<GroupState>(rajiv.token, 'GET', `groups/${groupId}/state?since=${state.data.now}`);
  check('delta returns no stale rows', delta.status === 200 && delta.data.full === false);

  console.log('\n── Editing ──');
  const editedItems = session.items.map((item, index) =>
    index === 0 ? { ...item, amount: 15000 } : item
  );
  const edited = await call<{ session: Session }>(
    bastav.token,
    'PATCH',
    `groups/${groupId}/sessions/${session.id}`,
    { items: editedItems, shop: 'Reliance Fresh (edited)', paidBy: rajiv.userId }
  );
  check('any member can edit', edited.status === 200, JSON.stringify(edited.data).slice(0, 160));
  check('edit recalculates the total', edited.data.session.total === 137000 + 2000, formatMoney(edited.data.session.total));
  check(
    'edited shares still sum exactly',
    Object.values(edited.data.session.shares).reduce((sum, value) => sum + value, 0) ===
      edited.data.session.total
  );

  const afterEdit = await call<GroupState>(rajiv.token, 'GET', `groups/${groupId}/state?since=0`);
  check('balances still sum to zero after an edit', afterEdit.data.balances.reduce((sum, e) => sum + e.net, 0) === 0);
  const editActivity = afterEdit.data.activities.find(entry => entry.type === 'session.updated');
  check('edit is in the audit trail with field detail', Boolean(editActivity?.changes.length), JSON.stringify(editActivity?.changes));

  console.log('\n── Settlement ──');
  const transfers = afterEdit.data.transfers;
  check('transfers exist while balances are open', transfers.length > 0, String(transfers.length));

  const foreign = transfers.find(t => t.from !== rajiv.userId && t.to !== rajiv.userId);
  if (foreign) {
    const denied = await call(rajiv.token, 'POST', `groups/${groupId}/settlements`, {
      fromUser: foreign.from,
      toUser: foreign.to,
      amount: foreign.amount,
    });
    check("cannot settle someone else's transfer", denied.status === 403, String(denied.status));
  } else {
    check("cannot settle someone else's transfer", true, 'no third-party transfer in this scenario');
  }

  // Clear every suggested transfer, each recorded by the person who owes it.
  for (const transfer of transfers) {
    const payer = Object.values(actors).find(actor => actor.userId === transfer.from);
    if (!payer) continue;
    const result = await call(payer.token, 'POST', `groups/${groupId}/settlements`, {
      fromUser: transfer.from,
      toUser: transfer.to,
      amount: transfer.amount,
      note: 'smoke test',
    });
    check(`settle ${formatMoney(transfer.amount)}`, result.status === 201, JSON.stringify(result.data).slice(0, 140));
  }

  const settled = await call<GroupState>(rajiv.token, 'GET', `groups/${groupId}/state?since=0`);
  check('everyone is square after settling', settled.data.transfers.length === 0, JSON.stringify(settled.data.transfers));
  check('all nets are zero', settled.data.balances.every(entry => entry.net === 0), JSON.stringify(settled.data.balances.map(b => b.net)));

  const settlementList = await call<{ settlements: unknown[] }>(rajiv.token, 'GET', `groups/${groupId}/settlements`);
  check('settlement history is kept', settlementList.data.settlements.length === transfers.length);

  console.log('\n── Search ──');
  const searchPaneer = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?q=paneer`
  );
  check('search by item name', searchPaneer.data.sessions.length === 1, String(searchPaneer.data.sessions.length));

  const searchShop = await call<{ sessions: Session[] }>(rajiv.token, 'GET', `groups/${groupId}/sessions?q=corner`);
  check('search by shop', searchShop.data.sessions.length === 1, String(searchShop.data.sessions.length));

  const searchNotes = await call<{ sessions: Session[] }>(rajiv.token, 'GET', `groups/${groupId}/sessions?q=weekly`);
  check('search by notes', searchNotes.data.sessions.length === 1, String(searchNotes.data.sessions.length));

  const searchPerson = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?q=Ashutosh`
  );
  check('search by member name', searchPerson.data.sessions.length >= 1, String(searchPerson.data.sessions.length));

  // Vegetables only appears in the first session; Personal Care appears in both
  // (Soap in session one, Shampoo in session two), so it proves the filter spans
  // sessions rather than just matching the most recent one.
  const byCategory = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?category=Vegetables`
  );
  check('filter by category', byCategory.data.sessions.length === 1, String(byCategory.data.sessions.length));

  const sharedCategory = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?category=Personal%20Care`
  );
  check(
    'category filter spans sessions',
    sharedCategory.data.sessions.length === 2,
    String(sharedCategory.data.sessions.length)
  );

  const byPayer = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?payer=${ashutosh.userId}`
  );
  check('filter by payer', byPayer.data.sessions.length === 1, String(byPayer.data.sessions.length));

  const byDate = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?from=${Date.now() - 86400000}&to=${Date.now()}`
  );
  check('filter by date range', byDate.data.sessions.length === 2, String(byDate.data.sessions.length));

  const noMatch = await call<{ sessions: Session[] }>(
    rajiv.token,
    'GET',
    `groups/${groupId}/sessions?q=zzzznothing`
  );
  check('search with no matches is empty', noMatch.data.sessions.length === 0);

  console.log('\n── Insights ──');
  const stats = await call<{
    monthly: { value: number }[];
    byCategory: { key: string }[];
    topItems: unknown[];
    sharedVsPersonal: { shared: number; personal: number };
    frequency: { sessionsPerWeek: number };
  }>(rajiv.token, 'GET', `groups/${groupId}/stats?months=6`);
  check('stats respond', stats.status === 200);
  check('monthly series is padded to 6 buckets', stats.data.monthly.length === 6, String(stats.data.monthly.length));
  check('current month has spending', stats.data.monthly[5].value > 0, String(stats.data.monthly[5].value));
  check('categories are aggregated', stats.data.byCategory.length >= 4, String(stats.data.byCategory.length));
  check('top items ranked', stats.data.topItems.length > 0);
  check(
    'shared vs personal both present',
    stats.data.sharedVsPersonal.shared > 0 && stats.data.sharedVsPersonal.personal > 0,
    JSON.stringify(stats.data.sharedVsPersonal)
  );

  console.log('\n── Notifications ──');
  const notifications = await call<{ notifications: { id: string }[]; unreadCount: number }>(
    bastav.token,
    'GET',
    'notifications'
  );
  check('notifications delivered to other members', notifications.data.notifications.length > 0);
  const read = await call<{ unreadCount: number }>(bastav.token, 'POST', 'notifications/read', { all: true });
  check('mark all read', read.data.unreadCount === 0, String(read.data.unreadCount));

  console.log('\n── Membership guards ──');
  const stranger = await User.create({
    email: `smoke_outsider_${SUFFIX}@example.invalid`,
    displayName: 'Outsider',
    username: `smoke_out_${SUFFIX}`,
    usernameLower: `smoke_out_${SUFFIX}`,
    profileComplete: true,
  });
  const strangerToken = jwt.sign({ sub: stranger._id.toString() }, process.env.JWT_SECRET as string, {
    expiresIn: '1h',
  });
  const peek = await call(strangerToken, 'GET', `groups/${groupId}/state?since=0`);
  check('non-member cannot read a group', peek.status === 404, String(peek.status));
  const intrude = await call(strangerToken, 'POST', `groups/${groupId}/sessions`, {
    paidBy: stranger._id.toString(),
    items: [{ name: 'Intrusion', amount: 100, owners: [stranger._id.toString()], category: 'Miscellaneous' }],
  });
  check('non-member cannot write to a group', intrude.status === 404, String(intrude.status));
  await User.deleteOne({ _id: stranger._id });

  console.log('\n── Deletion ──');
  const beforeDelete = await call<GroupState>(rajiv.token, 'GET', `groups/${groupId}/state?since=0`);
  const removed = await call(rajiv.token, 'DELETE', `groups/${groupId}/sessions/${session.id}`);
  check('delete session', removed.status === 200, String(removed.status));

  const afterDelete = await call<GroupState>(rajiv.token, 'GET', `groups/${groupId}/state?since=0`);
  check(
    'group total drops by the deleted amount',
    afterDelete.data.totals.groupTotal === beforeDelete.data.totals.groupTotal - 139000,
    `${formatMoney(afterDelete.data.totals.groupTotal)} vs ${formatMoney(beforeDelete.data.totals.groupTotal)}`
  );
  check('balances still sum to zero after deletion', afterDelete.data.balances.reduce((sum, e) => sum + e.net, 0) === 0);

  const tombstone = await call<GroupState>(
    ashutosh.token,
    'GET',
    `groups/${groupId}/state?since=${beforeDelete.data.now}`
  );
  check('deletion is broadcast as a tombstone', tombstone.data.removed.sessions.includes(session.id), JSON.stringify(tombstone.data.removed));

  console.log('\n── Member removal guard ──');
  const openBalance = netOf(afterDelete.data.balances, bastav.userId);
  const removeMember = await call<{ error?: string }>(
    rajiv.token,
    'DELETE',
    `groups/${groupId}/members/${bastav.userId}`
  );
  if (openBalance !== 0) {
    check('cannot remove a member who still owes or is owed', removeMember.status === 400, String(removeMember.status));
  } else {
    check('settled member can be removed', removeMember.status === 200, String(removeMember.status));
  }

  console.log('\n── Bad routes ──');
  const missing = await call(rajiv.token, 'GET', 'nope/nothing');
  check('unknown route is a 404', missing.status === 404, String(missing.status));
} finally {
  // ── Clean up everything this run created ───────────────────────────────────
  if (groupId) {
    await SessionModel.deleteMany({ groupId });
    await SettlementModel.deleteMany({ groupId });
    await ActivityModel.deleteMany({ groupId });
    await NotificationModel.deleteMany({ groupId });
    await Group.deleteOne({ _id: groupId });
  }
  await User.deleteMany({ email: { $regex: `^smoke_.*_${SUFFIX}@example.invalid$` } });
  await mongoose.disconnect();
}

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const failure of failures) console.log(`  x ${failure}`);
  process.exit(1);
}
console.log('The rebuilt API behaves correctly end to end.\n');
