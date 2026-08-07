/**
 * Parser + money regression suite. Run with: npm run test
 *
 * Every ownership format and money invariant promised in the product spec has a
 * case here, so a parser tweak can never silently break "Chicken - 420 AR".
 */

import { parseExpenseText, createResolver } from '../shared/parser.js';
import {
  splitEvenly,
  computeBalances,
  computeDirectTransfers,
  parseAmount,
  sumValues,
} from '../shared/money.js';
import type { ParserMember } from '../shared/parser.js';
import { dateKeyOf, resolveStatsRange, statsTimelineKeys } from '../server/time.js';

const RAJIV = 'u_rajiv';
const ASHUTOSH = 'u_ashutosh';
const BASTAV = 'u_bastav';

const members: ParserMember[] = [
  { userId: RAJIV, displayName: 'Rajiv', username: 'rajiv_sah' },
  { userId: ASHUTOSH, displayName: 'Ashutosh', username: 'ashutosh' },
  { userId: BASTAV, displayName: 'Bastav', username: 'bastav' },
];

const ALL = [RAJIV, ASHUTOSH, BASTAV];

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

function parse(text: string, payerId = RAJIV, assumeShared = true) {
  return parseExpenseText(text, { members, payerId, assumeSharedWhenUnspecified: assumeShared });
}

// ── Ownership formats from the spec ───────────────────────────────────────────
const ownershipCases: [string, string[], string][] = [
  ['Vegetables - 130/3', ALL, 'Vegetables'],
  ['Milk - 100/3', ALL, 'Milk'],
  ['Chocolate - 20 B', [BASTAV], 'Chocolate'],
  ['Biscuit - 40 Rajiv', [RAJIV], 'Biscuit'],
  ['Juice - 20 Ashutosh', [ASHUTOSH], 'Juice'],
  ['Chicken - 420 AR', [ASHUTOSH, RAJIV], 'Chicken'],
  ['Paneer - 180 A,R', [ASHUTOSH, RAJIV], 'Paneer'],
  ['Soap - 40 (B)', [BASTAV], 'Soap'],
  ['Milk 60 /3', ALL, 'Milk'],
  ['Eggs=120 R', [RAJIV], 'Eggs'],
  ['Rice 300 all', ALL, 'Rice'],
  ['Reliance Fresh - 1560/3', ALL, 'Reliance Fresh'],
  ['Shampoo 150 (Rajiv)', [RAJIV], 'Shampoo'],
  ['Curd 45 AB', [ASHUTOSH, BASTAV], 'Curd'],
  ['Bread 50 RB', [RAJIV, BASTAV], 'Bread'],
  ['Dal 200 A/R', [ASHUTOSH, RAJIV], 'Dal'],
  ['Ghee 480 Ashutosh Rajiv', [ASHUTOSH, RAJIV], 'Ghee'],
  ['Tea 90 me', [RAJIV], 'Tea'],
  ['Coffee 250 myself', [RAJIV], 'Coffee'],
  ['Onion 60 everyone', ALL, 'Onion'],
  ['Butter — 55 — B', [BASTAV], 'Butter'],
  ['Atta ₹450 /3', ALL, 'Atta'],
  ['Sugar Rs. 80 A', [ASHUTOSH], 'Sugar'],
  ['Oil 1,250 all', ALL, 'Oil'],
  ['Maggi 140/-  B', [BASTAV], 'Maggi'],
  ['Dairy Milk 20 R', [RAJIV], 'Dairy Milk'],
  ['7Up 40 B', [BASTAV], '7Up'],
  ['Paneer  -   180   A , R', [ASHUTOSH, RAJIV], 'Paneer'],
  ['Ashutosh biscuit 40 A', [ASHUTOSH], 'Ashutosh biscuit'],
  ['Rajv - 30 Rajv', [RAJIV], 'Rajv'],
  ['Ashuosh juice 25 Ashuosh', [ASHUTOSH], 'Ashuosh juice'],
  ['Vegetables:130:all', ALL, 'Vegetables'],
  ['Milk 100 A+B', [ASHUTOSH, BASTAV], 'Milk'],
  ['Curd 60 @bastav', [BASTAV], 'Curd'],
  ['Tomato 35.50 /3', ALL, 'Tomato'],
];

for (const [input, expectedOwners, expectedName] of ownershipCases) {
  const result = parse(input);
  const row = result.rows[0];
  if (!row) {
    check(`parse "${input}"`, false, 'no row produced');
    continue;
  }
  check(`owners "${input}"`, same(row.owners, expectedOwners), `got ${JSON.stringify(row.owners)}`);
  check(`name "${input}"`, row.name === expectedName, `got "${row.name}"`);
  check(`resolved "${input}"`, !row.needsOwners, row.reason);
}

// ── Amounts ──────────────────────────────────────────────────────────────────
check('amount 130', parse('Vegetables - 130/3').rows[0]?.amount === 13000);
check('amount 35.50', parse('Tomato 35.50 /3').rows[0]?.amount === 3550);
check('amount 1,250', parse('Oil 1,250 all').rows[0]?.amount === 125000);
check('amount 1560', parse('Reliance Fresh - 1560/3').rows[0]?.amount === 156000);
check('parseAmount ₹99', parseAmount('₹99') === 9900);
check('parseAmount blank', parseAmount('') === null);

// ── Multi-line block from the spec ────────────────────────────────────────────
const block = parse(`Vegetables - 130/3
Milk - 100/3
Chocolate - 20 B
Biscuit - 40 Rajiv
Juice - 20 Ashutosh`);
check('block row count', block.rows.length === 5, `got ${block.rows.length}`);
check('block confident', block.confidence >= 0.85, `confidence ${block.confidence}`);
check('block no shop', block.shop === '', `got "${block.shop}"`);

// ── Shop header detection ────────────────────────────────────────────────────
const withShop = parse(`Reliance Fresh
Milk 60 /3
Eggs 120 R`);
check('shop detected', withShop.shop === 'Reliance Fresh', `got "${withShop.shop}"`);
check('shop rows', withShop.rows.length === 2, `got ${withShop.rows.length}`);

// ── Ambiguity: never guess ───────────────────────────────────────────────────
const noOwner = parse('Milk - 60', RAJIV, false);
check('ask when unspecified', noOwner.rows[0]?.needsOwners === true);
check('ask lowers confidence', noOwner.confidence < 0.85);

const assumedOwner = parse('Milk - 60', RAJIV, true);
check('assume shared flag', assumedOwner.rows[0]?.assumed === true);
check('assume shared owners', same(assumedOwner.rows[0]?.owners ?? [], ALL));
check('assume shared stays confident', assumedOwner.confidence >= 0.85);

const unknownOwner = parse('Milk - 60 Xyz');
check('unknown owner flagged', unknownOwner.rows[0]?.needsOwners === true, unknownOwner.rows[0]?.reason);

const wrongCount = parse('Milk - 60 /4');
check('split count mismatch flagged', wrongCount.rows[0]?.needsOwners === true, wrongCount.rows[0]?.reason);

// ── Initial collisions must be flagged, not guessed ───────────────────────────
const collide: ParserMember[] = [
  { userId: 'u1', displayName: 'Rajiv', username: 'rajiv' },
  { userId: 'u2', displayName: 'Ravi', username: 'ravi' },
  { userId: 'u3', displayName: 'Bastav', username: 'bastav' },
];
const collided = parseExpenseText('Milk 60 R', { members: collide, payerId: 'u1' });
check('shared initial flagged', collided.rows[0]?.needsOwners === true, collided.rows[0]?.reason);
const collidedFull = parseExpenseText('Milk 60 Ravi', { members: collide, payerId: 'u1' });
check('full name beats initial', same(collidedFull.rows[0]?.owners ?? [], ['u2']));

// ── WhatsApp-style pasted lines ──────────────────────────────────────────────
const whatsapp = parse(`[02/08/26, 9:12 pm] Ashutosh: Vegetables - 130/3
[02/08/26, 9:13 pm] Ashutosh: Chocolate - 20 B
[02/08/26, 9:14 pm] Rajiv: ok thanks`);
check('whatsapp rows', whatsapp.rows.length === 2, `got ${whatsapp.rows.length}`);
check('whatsapp sender hint', whatsapp.senderHint === 'Ashutosh', `got "${whatsapp.senderHint}"`);
check('whatsapp chatter ignored', whatsapp.skipped.length === 0, JSON.stringify(whatsapp.skipped));

// ── Chatter without digits should not become a shop name ─────────────────────
const chatter = parse(`going to market
Milk 60 /3`);
check('chatter as shop', chatter.shop === 'going to market');

// ── Money invariants ─────────────────────────────────────────────────────────
for (const total of [10000, 10001, 10002, 1, 99, 156000, 33333, 7]) {
  for (const size of [1, 2, 3, 4, 5, 7]) {
    const owners = Array.from({ length: size }, (_, i) => `member_${i}`);
    const shares = splitEvenly(total, owners);
    check(
      `split exact ${total}/${size}`,
      sumValues(shares) === total,
      `sum ${sumValues(shares)} != ${total}`
    );
    const values = Object.values(shares);
    check(
      `split fair ${total}/${size}`,
      Math.max(...values) - Math.min(...values) <= 1,
      `spread ${Math.max(...values) - Math.min(...values)}`
    );
  }
}

check('split is stable', JSON.stringify(splitEvenly(10000, ['b', 'a', 'c'])) === JSON.stringify(splitEvenly(10000, ['c', 'b', 'a'])));

// 100/3 is the classic case the old app got wrong: payer was credited 100.00
// while the three shares only summed to 99.99.
const threeWay = splitEvenly(10000, ALL);
check('100/3 sums exactly', sumValues(threeWay) === 10000, `${sumValues(threeWay)}`);

// ── Balances and settlement ──────────────────────────────────────────────────
const sessions = [
  { paidBy: RAJIV, total: 13000, shares: splitEvenly(13000, ALL) },
  { paidBy: RAJIV, total: 42000, shares: splitEvenly(42000, [ASHUTOSH, RAJIV]) },
  { paidBy: BASTAV, total: 2000, shares: splitEvenly(2000, [BASTAV]) },
];
const balances = computeBalances(ALL, sessions, []);
check('balances sum to zero', balances.reduce((sum, entry) => sum + entry.net, 0) === 0);

// Direct balances retain the person who actually paid. Payments are never
// routed through another member to reduce the number of transfers.
const directSessions: { paidBy: string; total: number; shares: Record<string, number> }[] = [
  {
    paidBy: ASHUTOSH,
    total: 121768,
    shares: { [RAJIV]: 102768, [BASTAV]: 19000 },
  },
  {
    paidBy: BASTAV,
    total: 19000,
    shares: { [RAJIV]: 19000 },
  },
];
const directBalances = computeDirectTransfers(directSessions, []);
check(
  'direct balances preserve the payer',
  JSON.stringify(directBalances) ===
    JSON.stringify([
      { from: BASTAV, to: ASHUTOSH, amount: 19000 },
      { from: RAJIV, to: ASHUTOSH, amount: 102768 },
      { from: RAJIV, to: BASTAV, amount: 19000 },
    ]),
  JSON.stringify(directBalances)
);
const directAfterPayment = computeDirectTransfers(directSessions, [
  { fromUser: RAJIV, toUser: BASTAV, amount: 19000 },
]);
check(
  'direct settlement clears only that payer balance',
  JSON.stringify(directAfterPayment) ===
    JSON.stringify([
      { from: BASTAV, to: ASHUTOSH, amount: 19000 },
      { from: RAJIV, to: ASHUTOSH, amount: 102768 },
    ]),
  JSON.stringify(directAfterPayment)
);

const directAfterRajivPaysEveryone = computeDirectTransfers(directSessions, [
  { fromUser: RAJIV, toUser: ASHUTOSH, amount: 102768 },
  { fromUser: RAJIV, toUser: BASTAV, amount: 19000 },
]);
check(
  'paying each original payer keeps the remaining balance separate',
  JSON.stringify(directAfterRajivPaysEveryone) === JSON.stringify([{ from: BASTAV, to: ASHUTOSH, amount: 19000 }]),
  JSON.stringify(directAfterRajivPaysEveryone)
);

const directAfterEveryonePays = computeDirectTransfers(directSessions, [
  { fromUser: RAJIV, toUser: ASHUTOSH, amount: 102768 },
  { fromUser: RAJIV, toUser: BASTAV, amount: 19000 },
  { fromUser: BASTAV, toUser: ASHUTOSH, amount: 19000 },
]);
check('direct payments fully settle the group', directAfterEveryonePays.length === 0, JSON.stringify(directAfterEveryonePays));

// ── Resolver direct cases ────────────────────────────────────────────────────
const { resolve } = createResolver({ members, payerId: RAJIV });
const resolverCases: [string, string[]][] = [
  ['/3', ALL],
  ['All', ALL],
  ['A', [ASHUTOSH]],
  ['R', [RAJIV]],
  ['B', [BASTAV]],
  ['Rajiv', [RAJIV]],
  ['Ashutosh', [ASHUTOSH]],
  ['Bastav', [BASTAV]],
  ['Me', [RAJIV]],
  ['Myself', [RAJIV]],
  ['(A)', [ASHUTOSH]],
  ['(Rajiv)', [RAJIV]],
  ['AB', [ASHUTOSH, BASTAV]],
  ['AR', [ASHUTOSH, RAJIV]],
  ['RB', [RAJIV, BASTAV]],
  ['A,B', [ASHUTOSH, BASTAV]],
  ['A/R', [ASHUTOSH, RAJIV]],
  ['Ashutosh Rajiv', [ASHUTOSH, RAJIV]],
  ['rajiv_sah', [RAJIV]],
  ['ashu', [ASHUTOSH]],
];
for (const [token, expected] of resolverCases) {
  const result = resolve(token);
  check(`resolve "${token}"`, result.ok && same(result.owners, expected), `${JSON.stringify(result)}`);
}

// Calendar ranges must operate on civil dates, not browser/server timestamps.
const leapDay = resolveStatsRange('day', '2024-02-29');
check('custom day keeps the selected calendar date', leapDay.from === '2024-02-29' && leapDay.to === '2024-02-29');

const selectedWeek = resolveStatsRange('week', '2026-08-06');
check('custom week starts on Monday', selectedWeek.from === '2026-08-03' && selectedWeek.to === '2026-08-09');
check('custom week gets seven daily buckets', statsTimelineKeys(selectedWeek).length === 7);

const selectedMonth = resolveStatsRange('month', '2024-02');
check('custom month includes leap day', selectedMonth.from === '2024-02-01' && selectedMonth.to === '2024-02-29');
check('custom month is charted by day', selectedMonth.bucket === 'day' && statsTimelineKeys(selectedMonth).length === 29);

const selectedYear = resolveStatsRange('year', '2024');
check('custom year covers the full year', selectedYear.from === '2024-01-01' && selectedYear.to === '2024-12-31');
check('custom year is charted by month', selectedYear.bucket === 'month' && statsTimelineKeys(selectedYear).length === 12);

const fixedNow = Date.UTC(2026, 7, 6, 12, 0, 0);
const invalidMonth = resolveStatsRange('month', '2026-99', fixedNow);
check(
  'invalid calendar input falls back safely',
  invalidMonth.from === `${dateKeyOf(fixedNow).slice(0, 7)}-01`
);

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('All parser and money invariants hold.');
