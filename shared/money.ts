/**
 * Deterministic money maths. Every amount is an integer number of paise, so
 * there is no floating point drift anywhere in the ledger.
 *
 * The invariants this module guarantees:
 *   - sum(splitEvenly(total, owners)) === total, exactly, for any total/owner count
 *   - sum(session.shares) === session.total
 *   - sum(balances.net) === 0
 * These are what make "who owes whom" verifiable rather than approximately right.
 */

import type { MemberBalance, Paise, Session, Settlement, Transfer } from './types.js';

/** Parse user input ("130", "1,560.50", "₹99") into paise. Returns null if unusable. */
export function parseAmount(input: string | number | null | undefined): Paise | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function toRupees(paise: Paise): number {
  return Math.round(paise) / 100;
}

/** Whole rupees stay whole ("₹130"); anything with paise keeps two decimals ("₹43.34"). */
export function formatMoney(paise: Paise, currency = '₹'): string {
  const negative = paise < 0;
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.trunc(absolute / 100);
  const remainder = absolute % 100;
  const whole = rupees.toLocaleString('en-IN');
  const text = remainder === 0 ? whole : `${whole}.${String(remainder).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${currency}${text}`;
}

/**
 * Split `total` across `owners` so the parts sum back to `total` exactly.
 * The remainder paise are handed out in a stable order (sorted userId) so the
 * same input always produces the same split on every device and every reload.
 */
export function splitEvenly(total: Paise, owners: string[]): Record<string, Paise> {
  const shares: Record<string, Paise> = {};
  const unique = [...new Set(owners)];
  if (unique.length === 0) return shares;

  const amount = Math.round(total);
  const base = Math.trunc(amount / unique.length);
  let remainder = amount - base * unique.length;
  const order = [...unique].sort();

  for (const userId of order) shares[userId] = base;

  // Hand the leftover paise out one at a time; negative totals shed them the same way.
  const step = remainder >= 0 ? 1 : -1;
  let index = 0;
  while (remainder !== 0) {
    shares[order[index % order.length]] += step;
    remainder -= step;
    index += 1;
  }
  return shares;
}

export function sumValues(map: Record<string, Paise>): Paise {
  let total = 0;
  for (const value of Object.values(map)) total += value;
  return total;
}

/** Roll per-item shares up into one map for the whole session. */
export function aggregateShares(items: { shares: Record<string, Paise> }[]): Record<string, Paise> {
  const shares: Record<string, Paise> = {};
  for (const item of items) {
    for (const [userId, amount] of Object.entries(item.shares)) {
      shares[userId] = (shares[userId] ?? 0) + amount;
    }
  }
  return shares;
}

export type Totals = Record<string, Paise>;

/** A debt or credit between two specific members. */
export interface PairwiseEntry {
  from: string;
  to: string;
  amount: Paise;
}

/**
 * Net a list of directed amounts without routing money through unrelated
 * members. A positive entry means `from` owes `to`; an entry in the opposite
 * direction cancels it first. This is useful for showing the person who
 * actually paid for an expense, alongside the optional minimum-payment plan.
 */
export function netPairwiseTransfers(entries: PairwiseEntry[]): Transfer[] {
  const pairs = new Map<string, { first: string; second: string; amount: Paise }>();

  for (const entry of entries) {
    const from = String(entry.from ?? '');
    const to = String(entry.to ?? '');
    const amount = Math.round(entry.amount);
    if (!from || !to || from === to || !Number.isFinite(amount) || amount === 0) continue;

    const [first, second] = from < to ? [from, to] : [to, from];
    const key = `${first}\u0000${second}`;
    const pair = pairs.get(key) ?? { first, second, amount: 0 };
    pair.amount += from === first ? amount : -amount;
    pairs.set(key, pair);
  }

  return [...pairs.values()]
    .filter(pair => pair.amount !== 0)
    .map(pair =>
      pair.amount > 0
        ? { from: pair.first, to: pair.second, amount: pair.amount }
        : { from: pair.second, to: pair.first, amount: -pair.amount }
    )
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/**
 * Direct balances retain the payer-to-owner relationship from every expense.
 * Settlements reverse that relationship, so a payment from A to B reduces the
 * direct balance from A to B.
 */
export function computeDirectTransfers(
  sessions: Pick<Session, 'paidBy' | 'shares'>[],
  settlements: Pick<Settlement, 'fromUser' | 'toUser' | 'amount'>[]
): Transfer[] {
  const entries: PairwiseEntry[] = [];

  for (const session of sessions) {
    for (const [ownerId, amount] of Object.entries(session.shares ?? {})) {
      if (ownerId !== session.paidBy) entries.push({ from: ownerId, to: session.paidBy, amount });
    }
  }
  for (const settlement of settlements) {
    entries.push({ from: settlement.toUser, to: settlement.fromUser, amount: settlement.amount });
  }

  return netPairwiseTransfers(entries);
}

/**
 * The single definition of a member's ledger position. Both the in-memory path
 * (computeBalances) and the database aggregation path feed into this, so the two
 * can never drift apart.
 */
export function balancesFromTotals(
  memberIds: string[],
  paid: Totals,
  owed: Totals,
  settledOut: Totals,
  settledIn: Totals
): MemberBalance[] {
  const userIds = new Set<string>([
    ...memberIds,
    ...Object.keys(paid),
    ...Object.keys(owed),
    ...Object.keys(settledOut),
    ...Object.keys(settledIn),
  ]);

  const result: MemberBalance[] = [];
  for (const userId of userIds) {
    const entry: MemberBalance = {
      userId,
      paid: paid[userId] ?? 0,
      owed: owed[userId] ?? 0,
      settledOut: settledOut[userId] ?? 0,
      settledIn: settledIn[userId] ?? 0,
      net: 0,
    };
    // Paying a settlement reduces what you owe; receiving one reduces what you are owed.
    entry.net = entry.paid - entry.owed + entry.settledOut - entry.settledIn;
    result.push(entry);
  }

  const membership = new Set(memberIds);
  result.sort((a, b) => {
    const aIn = membership.has(a.userId) ? 0 : 1;
    const bIn = membership.has(b.userId) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return b.net - a.net;
  });
  return result;
}

export function computeBalances(
  memberIds: string[],
  sessions: Pick<Session, 'paidBy' | 'total' | 'shares'>[],
  settlements: Pick<Settlement, 'fromUser' | 'toUser' | 'amount'>[]
): MemberBalance[] {
  const paid: Totals = {};
  const owed: Totals = {};
  const settledOut: Totals = {};
  const settledIn: Totals = {};

  for (const session of sessions) {
    paid[session.paidBy] = (paid[session.paidBy] ?? 0) + session.total;
    for (const [userId, amount] of Object.entries(session.shares ?? {})) {
      owed[userId] = (owed[userId] ?? 0) + amount;
    }
  }
  for (const settlement of settlements) {
    settledOut[settlement.fromUser] = (settledOut[settlement.fromUser] ?? 0) + settlement.amount;
    settledIn[settlement.toUser] = (settledIn[settlement.toUser] ?? 0) + settlement.amount;
  }

  return balancesFromTotals(memberIds, paid, owed, settledOut, settledIn);
}

/**
 * Greedy max-debtor / max-creditor matching. On integer paise this always
 * clears every balance in at most (members - 1) transfers, which is the minimum
 * possible for a connected group.
 */
export function minimalTransfers(balances: MemberBalance[]): Transfer[] {
  const debtors = balances
    .filter(entry => entry.net < 0)
    .map(entry => ({ userId: entry.userId, amount: -entry.net }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
  const creditors = balances
    .filter(entry => entry.net > 0)
    .map(entry => ({ userId: entry.userId, amount: entry.net }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) transfers.push({ from: debtor.userId, to: creditor.userId, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) d += 1;
    if (creditor.amount === 0) c += 1;
  }
  return transfers;
}
