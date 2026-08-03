/**
 * Guards and the canonical session write path.
 *
 * Item shares are always recomputed here from (amount, owners) — a client can
 * never post its own share numbers, which is what keeps the ledger exact.
 */

import { isCategory } from '../../shared/categories.js';
import { aggregateShares, formatMoney, splitEvenly, sumValues } from '../../shared/money.js';
import type { Category, Paise } from '../../shared/types.js';
import { connectToDatabase } from '../db.js';
import { badRequest, forbidden, notFound } from '../http.js';
import {
  Group,
  type GroupDoc,
  type GroupDocument,
  type SessionDoc,
  type SessionItemDoc,
  type UserDoc,
} from '../models.js';

export const MAX_ITEMS = 200;
export const MAX_AMOUNT: Paise = 100_000_000; // ₹10,00,000 per line item

export async function requireGroup(user: UserDoc, groupId: string): Promise<GroupDocument> {
  await connectToDatabase();
  if (!/^[a-f\d]{24}$/i.test(groupId)) throw notFound('That group does not exist.');
  const group = await Group.findOne({ _id: groupId, deletedAt: null, memberIds: user._id.toString() });
  if (!group) throw notFound('That group does not exist, or you are not a member of it.');
  return group;
}

export function requireOwner(group: GroupDoc, user: UserDoc): void {
  if (group.ownerId !== user._id.toString()) {
    throw forbidden('Only the group owner can do that.');
  }
}

export function memberName(group: GroupDoc, userId: string): string {
  return group.members.find(member => member.userId === userId)?.displayName || 'Member';
}

export function displayNameOf(user: UserDoc): string {
  return user.displayName || user.email.split('@')[0] || 'Member';
}

/** Anchor a date to local noon so timezone shifts can never move it a day. */
export function normalizeDate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    date.setHours(12, 0, 0, 0);
    return date.getTime();
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
  }
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return now.getTime();
}

export interface NormalizedSession {
  items: SessionItemDoc[];
  total: Paise;
  shares: Record<string, Paise>;
  searchText: string;
}

export function normalizeItems(
  rawItems: unknown,
  group: GroupDoc,
  extraAllowedOwners: string[] = []
): SessionItemDoc[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw badRequest('Add at least one item.');
  }
  if (rawItems.length > MAX_ITEMS) {
    throw badRequest(`A session can hold at most ${MAX_ITEMS} items.`);
  }

  const allowed = new Set([...(group.memberIds ?? []), ...extraAllowedOwners]);

  return rawItems.map((raw, index): SessionItemDoc => {
    if (!raw || typeof raw !== 'object') throw badRequest(`Item ${index + 1} is not valid.`);
    const record = raw as Record<string, unknown>;

    const name = String(record.name ?? '').trim().slice(0, 120);
    if (!name) throw badRequest(`Item ${index + 1} needs a name.`);

    const amount = Math.round(Number(record.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest(`"${name}" needs a price greater than zero.`);
    }
    if (amount > MAX_AMOUNT) {
      throw badRequest(`"${name}" is above the ${formatMoney(MAX_AMOUNT)} per-item limit.`);
    }

    const owners = Array.isArray(record.owners) ? [...new Set(record.owners.map(String))] : [];
    if (owners.length === 0) throw badRequest(`Choose who shares "${name}".`);
    const stranger = owners.find(userId => !allowed.has(userId));
    if (stranger) throw badRequest(`"${name}" is assigned to someone who is not in this group.`);

    const category: Category = isCategory(record.category) ? record.category : 'Miscellaneous';

    return {
      id: String(record.id ?? '').trim() || `item_${Date.now().toString(36)}_${index}`,
      name,
      amount,
      owners,
      // Recomputed server-side, always. Never trusted from the request.
      shares: splitEvenly(amount, owners),
      category,
    };
  });
}

export function buildSession(items: SessionItemDoc[], shop: string, notes: string): NormalizedSession {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const shares = aggregateShares(items);

  // Cheap assertion on the invariant the whole ledger rests on.
  if (sumValues(shares) !== total) {
    throw badRequest('Could not split these items exactly. Please check the prices.');
  }

  const searchText = [shop, notes, ...items.map(item => item.name), ...items.map(item => item.category)]
    .join(' ')
    .toLowerCase()
    .slice(0, 2000);

  return { items, total, shares, searchText };
}

/** Human-readable field-level diff for the activity log. */
export function diffSession(
  before: SessionDoc,
  after: { date: number; shop: string; notes: string; paidBy: string; items: SessionItemDoc[] },
  nameOf: (userId: string) => string
): string[] {
  const changes: string[] = [];

  if (before.paidBy !== after.paidBy) {
    changes.push(`Payer ${nameOf(before.paidBy)} → ${nameOf(after.paidBy)}`);
  }
  if (before.date !== after.date) {
    const format = (value: number) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    changes.push(`Date ${format(before.date)} → ${format(after.date)}`);
  }
  if ((before.shop || '') !== after.shop) {
    changes.push(after.shop ? `Shop "${before.shop || 'none'}" → "${after.shop}"` : `Shop "${before.shop}" removed`);
  }
  if ((before.notes || '') !== after.notes) {
    changes.push('Notes updated');
  }

  const beforeById = new Map(before.items.map(item => [item.id, item]));
  const afterById = new Map(after.items.map(item => [item.id, item]));

  for (const item of after.items) {
    const previous = beforeById.get(item.id);
    if (!previous) {
      changes.push(`Added ${item.name} ${formatMoney(item.amount)}`);
      continue;
    }
    if (previous.name !== item.name) changes.push(`Renamed "${previous.name}" → "${item.name}"`);
    if (previous.amount !== item.amount) {
      changes.push(`${item.name} ${formatMoney(previous.amount)} → ${formatMoney(item.amount)}`);
    }
    const previousOwners = [...(previous.owners ?? [])].sort().join(',');
    const nextOwners = [...item.owners].sort().join(',');
    if (previousOwners !== nextOwners) {
      changes.push(`${item.name} shared by ${item.owners.map(nameOf).join(', ')}`);
    }
    if (previous.category !== item.category) {
      changes.push(`${item.name} category → ${item.category}`);
    }
  }

  for (const item of before.items) {
    if (!afterById.has(item.id)) changes.push(`Removed ${item.name} ${formatMoney(item.amount)}`);
  }

  return changes;
}
