/**
 * Live checks for the three AI routes. Costs a few Gemini calls, so it is kept
 * out of `npm run smoke`.
 *
 *   npm run dev
 *   npm run smoke:ai
 *
 * The receipt case renders a synthetic till slip with a built-in bitmap font, so
 * the image path (base64 stripping, MIME type, response coercion) is exercised
 * for real rather than mocked — that path was silently broken before.
 */

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import zlib from 'zlib';
import { connectToDatabase } from '../server/db.js';
import { ActivityModel, Group, NotificationModel, SessionModel, User } from '../server/models.js';
import type { DraftItem } from '../shared/types.js';

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

/* ── Minimal 5x7 bitmap font, enough for a till slip ───────────────────────── */

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10011', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '01100', '00100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '*': ['00000', '01010', '00100', '11111', '00100', '01010', '00000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function renderReceipt(lines: string[], scale = 5): string {
  const charWidth = 6 * scale;
  const lineHeight = 10 * scale;
  const marginX = 8 * scale;
  const marginY = 6 * scale;
  const width = marginX * 2 + Math.max(...lines.map(line => line.length)) * charWidth;
  const height = marginY * 2 + lines.length * lineHeight;

  const rgba = Buffer.alloc(width * height * 4, 0);
  // Paper white background.
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = 250;
    rgba[index * 4 + 1] = 249;
    rgba[index * 4 + 2] = 246;
    rgba[index * 4 + 3] = 255;
  }

  const plot = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    rgba[offset] = 24;
    rgba[offset + 1] = 24;
    rgba[offset + 2] = 28;
  };

  lines.forEach((line, lineIndex) => {
    const baseY = marginY + lineIndex * lineHeight;
    [...line.toUpperCase()].forEach((character, charIndex) => {
      const glyph = GLYPHS[character] ?? GLYPHS[' '];
      const baseX = marginX + charIndex * charWidth;
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((pixel, columnIndex) => {
          if (pixel !== '1') return;
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              plot(baseX + columnIndex * scale + dx, baseY + rowIndex * scale + dy);
            }
          }
        });
      });
    });
  });

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return `data:image/png;base64,${png.toString('base64')}`;
}

/* ── Drive the routes ─────────────────────────────────────────────────────── */

async function call<T>(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as T };
}

await connectToDatabase();

const people = [
  ['rajiv', 'Rajiv'],
  ['ashutosh', 'Ashutosh'],
  ['bastav', 'Bastav'],
] as const;

const actors: Record<string, { userId: string; token: string; username: string }> = {};
for (const [key, displayName] of people) {
  const username = `ai_${key}_${SUFFIX}`;
  const created = await User.create({
    email: `ai_${key}_${SUFFIX}@example.invalid`,
    displayName,
    username,
    usernameLower: username,
    profileComplete: true,
  });
  actors[key] = {
    userId: created._id.toString(),
    token: jwt.sign({ sub: created._id.toString() }, process.env.JWT_SECRET as string, { expiresIn: '1h' }),
    username,
  };
}

const rajiv = actors.rajiv;
let groupId = '';

try {
  const group = await call<{ group: { id: string } }>(rajiv.token, 'POST', 'groups', {
    name: `AI Smoke ${SUFFIX}`,
  });
  groupId = group.data.group.id;
  await call(rajiv.token, 'POST', `groups/${groupId}/members`, { username: actors.ashutosh.username });
  await call(rajiv.token, 'POST', `groups/${groupId}/members`, { username: actors.bastav.username });

  const nameOf = (userId: string) =>
    Object.entries(actors).find(([, actor]) => actor.userId === userId)?.[0] ?? userId;

  console.log('\n── AI text parsing (deliberately messy) ──');
  const messy = await call<{ items: DraftItem[]; shop: string; usedAi: boolean; warning?: string }>(
    rajiv.token,
    'POST',
    `groups/${groupId}/ai/text`,
    {
      // Run-together lines, OCR-style damage and mixed separators: exactly the
      // input the rule parser is meant to hand off.
      text: `bought stuff today frm big bazar
2kg tamatar 85 rupees for all of us
chiken 1 kg -> 420 (ashuosh and rajv only)
1 pkt bread 45 bastav ka
choco 20/- for me`,
      payerId: rajiv.userId,
    }
  );
  check('AI text route responds', messy.status === 200, JSON.stringify(messy.data).slice(0, 200));
  check('AI extracted items', messy.data.items?.length >= 3, String(messy.data.items?.length));
  if (messy.data.warning) console.log(`       note: ${messy.data.warning}`);

  for (const item of messy.data.items ?? []) {
    console.log(
      `       ${item.name} · ₹${item.amount} · ${item.owners.map(nameOf).join('+') || 'unassigned'}${
        item.needsOwners ? ' · NEEDS OWNERS' : ''
      }`
    );
  }
  check(
    'AI never returns an unknown member id',
    (messy.data.items ?? []).every(item =>
      item.owners.every(owner => Object.values(actors).some(actor => actor.userId === owner))
    )
  );
  check(
    'AI amounts are usable numbers',
    (messy.data.items ?? []).every(item => Number(item.amount) > 0)
  );

  console.log('\n── AI receipt scanning ──');
  const receipt = renderReceipt([
    'FRESH MART',
    'MG ROAD BENGALURU',
    'BILL NO: 4471',
    'DATE: 02/08/2026',
    '----------------------',
    'AMUL MILK 1L      62.00',
    'BROWN BREAD       45.00',
    'TOMATO 1KG        38.50',
    'DETTOL SOAP       55.00',
    'MAGGI 4 PACK     108.00',
    '----------------------',
    'SUBTOTAL         308.50',
    'CGST 2.5%          7.71',
    'TOTAL            316.21',
    'CASH             320.00',
    'CHANGE             3.79',
    '** THANK YOU **',
  ]);
  console.log(`       synthetic receipt: ${Math.round(receipt.length * 0.75 / 1024)} KB`);

  const scanned = await call<{ items: DraftItem[]; shop: string; date: string }>(
    rajiv.token,
    'POST',
    `groups/${groupId}/ai/receipt`,
    { imageBase64: receipt, mimeType: 'image/png', payerId: rajiv.userId }
  );
  check('receipt route responds', scanned.status === 200, JSON.stringify(scanned.data).slice(0, 220));
  const scannedItems = scanned.data.items ?? [];
  for (const item of scannedItems) console.log(`       ${item.name} · ₹${item.amount}`);
  check('receipt items extracted', scannedItems.length >= 4, String(scannedItems.length));
  check(
    'totals and taxes excluded',
    !scannedItems.some(item => /subtotal|total|cgst|gst|cash|change|thank/i.test(item.name)),
    scannedItems.map(item => item.name).join(', ')
  );
  check('shop name read', /mart/i.test(scanned.data.shop ?? ''), scanned.data.shop);
  check(
    'receipt items default to shared by everyone',
    scannedItems.every(item => item.owners.length === 3),
    JSON.stringify(scannedItems.map(item => item.owners.length))
  );

  console.log('\n── AI WhatsApp import ──');
  const chat = await call<{
    sessions: { date: string; shop: string; payerName: string; payerId: string; items: DraftItem[] }[];
  }>(rajiv.token, 'POST', `groups/${groupId}/ai/whatsapp`, {
    text: `[01/08/26, 8:02 pm] Rajiv: guys im at reliance fresh
[01/08/26, 8:03 pm] Ashutosh: get milk also
[01/08/26, 8:31 pm] Rajiv: Vegetables - 130/3
[01/08/26, 8:31 pm] Rajiv: Milk - 100/3
[01/08/26, 8:32 pm] Rajiv: Chocolate - 20 B
[01/08/26, 8:33 pm] Bastav: thanks bhai
[01/08/26, 9:10 pm] Ashutosh: whos cooking tomorrow
[02/08/26, 7:15 pm] Ashutosh: went to the meat shop
[02/08/26, 7:16 pm] Ashutosh: Chicken - 420 AR
[02/08/26, 7:16 pm] Ashutosh: Paneer - 180 A,R
[02/08/26, 7:40 pm] Rajiv: ok noted
[03/08/26, 10:00 am] Bastav: good morning`,
  });
  check('whatsapp route responds', chat.status === 200, JSON.stringify(chat.data).slice(0, 200));
  const sessions = chat.data.sessions ?? [];
  check('conversation split into separate trips', sessions.length >= 2, String(sessions.length));
  for (const session of sessions) {
    console.log(
      `       ${session.date || 'no date'} · ${session.shop || 'no shop'} · paid by ${
        session.payerName || '?'
      } · ${session.items.length} items`
    );
    for (const item of session.items) {
      console.log(`         - ${item.name} ₹${item.amount} ${item.owners.map(nameOf).join('+')}`);
    }
  }
  check(
    'chatter excluded from items',
    sessions.every(session =>
      session.items.every(item => !/cooking|morning|thanks|noted|whos/i.test(item.name))
    )
  );
  check(
    'payers mapped to real members',
    sessions.every(session => !session.payerId || Object.values(actors).some(a => a.userId === session.payerId))
  );
  check(
    'ownership initials understood',
    sessions.some(session =>
      session.items.some(item => item.name.toLowerCase().includes('chicken') && item.owners.length === 2)
    ),
    'expected Chicken (AR) to resolve to two owners'
  );
} finally {
  if (groupId) {
    await SessionModel.deleteMany({ groupId });
    await ActivityModel.deleteMany({ groupId });
    await NotificationModel.deleteMany({ groupId });
    await Group.deleteOne({ _id: groupId });
  }
  await User.deleteMany({ email: { $regex: `^ai_.*_${SUFFIX}@example.invalid$` } });
  await mongoose.disconnect();
}

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const failure of failures) console.log(`  x ${failure}`);
  process.exit(1);
}
console.log('All three AI routes work against the live model.\n');
