import { formatMoney } from '../../shared/money.js';
import { CATEGORIES, type Category } from '../../shared/types.js';
import { sessionDto } from '../dto.js';
import { recordActivity } from '../events.js';
import {
  badRequest,
  created,
  notFound,
  ok,
  optionalString,
  route,
  toNumber,
} from '../http.js';
import { SessionModel, type SessionDoc } from '../models.js';
import {
  buildSession,
  diffSession,
  displayNameOf,
  memberName,
  normalizeDate,
  normalizeItems,
  requireGroup,
} from './shared.js';

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Cursor {
  date: number;
  createdAt: number;
  id: string;
}

function decodeCursor(value: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (!Number.isFinite(parsed.date) || !Number.isFinite(parsed.createdAt) || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(doc: SessionDoc): string {
  const cursor: Cursor = { date: doc.date, createdAt: doc.createdAt, id: doc._id.toString() };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function sessionSourceOf(value: unknown): SessionDoc['source'] {
  return value === 'text' || value === 'receipt' || value === 'whatsapp' ? value : 'manual';
}

export const sessionRoutes = [
  /** History + search. Filtering runs in the database so it stays fast over years of data. */
  route('GET', 'groups/:groupId/sessions', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const groupId = group._id.toString();

    const filter: Record<string, unknown> = { groupId, deletedAt: null };

    const search = optionalString(ctx.query.q, 80);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      const matchingMembers = group.members
        .filter(member => pattern.test(member.displayName) || pattern.test(member.username))
        .map(member => member.userId);
      filter.$or = [
        { searchText: pattern },
        { paidByName: pattern },
        ...(matchingMembers.length ? [{ paidBy: { $in: matchingMembers } }] : []),
        ...(matchingMembers.length ? [{ 'items.owners': { $in: matchingMembers } }] : []),
      ];
    }

    const from = toNumber(ctx.query.from, 0);
    const to = toNumber(ctx.query.to, 0);
    if (from || to) {
      const range: Record<string, number> = {};
      if (from) range.$gte = normalizeDate(from) - 12 * 60 * 60 * 1000;
      if (to) range.$lte = normalizeDate(to) + 12 * 60 * 60 * 1000;
      filter.date = range;
    }

    const payer = optionalString(ctx.query.payer, 40);
    if (payer) filter.paidBy = payer;

    const member = optionalString(ctx.query.member, 40);
    if (member) filter['items.owners'] = member;

    const category = optionalString(ctx.query.category, 40);
    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      filter['items.category'] = category as Category;
    }

    const cursor = decodeCursor(optionalString(ctx.query.cursor, 400));
    if (cursor) {
      const after = [
        { date: { $lt: cursor.date } },
        { date: cursor.date, createdAt: { $lt: cursor.createdAt } },
        { date: cursor.date, createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
      filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: after }];
    }

    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, toNumber(ctx.query.limit, PAGE_SIZE)));
    const docs = await SessionModel.find(filter)
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const page = docs.slice(0, limit);
    return ok({
      sessions: page.map(sessionDto),
      nextCursor: docs.length > limit && page.length ? encodeCursor(page[page.length - 1]) : '',
    });
  }),

  route('POST', 'groups/:groupId/sessions', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const actorId = ctx.user._id.toString();

    const paidBy = String(ctx.body.paidBy ?? actorId);
    if (!group.memberIds.includes(paidBy)) throw badRequest('The payer must be a member of this group.');

    const shop = optionalString(ctx.body.shop, 80);
    const notes = optionalString(ctx.body.notes, 500);
    const items = normalizeItems(ctx.body.items, group);
    const { total, shares, searchText } = buildSession(items, shop, notes);
    const now = Date.now();

    const doc = await SessionModel.create({
      groupId: group._id.toString(),
      date: normalizeDate(ctx.body.date),
      shop,
      notes,
      paidBy,
      paidByName: memberName(group, paidBy),
      createdBy: actorId,
      createdByName: displayNameOf(ctx.user),
      items,
      total,
      shares,
      source: sessionSourceOf(ctx.body.source),
      searchText,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const where = shop ? ` at ${shop}` : '';
    await recordActivity({
      group,
      actorId,
      actorName: displayNameOf(ctx.user),
      type: 'session.created',
      summary: `${displayNameOf(ctx.user)} added ${items.length} item${items.length === 1 ? '' : 's'}${where} · ${formatMoney(total)}`,
      changes: items.map(item => `${item.name} ${formatMoney(item.amount)}`),
      targetId: doc._id.toString(),
      amount: total,
      notification: {
        title: `${displayNameOf(ctx.user)} added ${formatMoney(total)}${where}`,
        body: items
          .slice(0, 4)
          .map(item => item.name)
          .join(', ') + (items.length > 4 ? ` +${items.length - 4} more` : ''),
      },
    });

    return created({ session: sessionDto(doc) });
  }),

  route('PATCH', 'groups/:groupId/sessions/:sessionId', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const doc = await SessionModel.findOne({
      _id: ctx.params.sessionId,
      groupId: group._id.toString(),
      deletedAt: null,
    });
    if (!doc) throw notFound('That session no longer exists.');

    const before = doc.toObject() as SessionDoc;
    const actorId = ctx.user._id.toString();

    const paidBy = ctx.body.paidBy === undefined ? doc.paidBy : String(ctx.body.paidBy);
    if (!group.memberIds.includes(paidBy)) throw badRequest('The payer must be a member of this group.');

    const shop = ctx.body.shop === undefined ? doc.shop : optionalString(ctx.body.shop, 80);
    const notes = ctx.body.notes === undefined ? doc.notes : optionalString(ctx.body.notes, 500);
    const date = ctx.body.date === undefined ? doc.date : normalizeDate(ctx.body.date);

    // Owners already on the session stay valid even if they have since left the group.
    const historicOwners = before.items.flatMap(item => item.owners ?? []);
    const items = ctx.body.items === undefined
      ? before.items
      : normalizeItems(ctx.body.items, group, historicOwners);

    const { total, shares, searchText } = buildSession(items, shop, notes);
    const changes = diffSession(before, { date, shop, notes, paidBy, items }, userId => memberName(group, userId));

    if (changes.length === 0) return ok({ session: sessionDto(doc), unchanged: true });

    doc.date = date;
    doc.shop = shop;
    doc.notes = notes;
    doc.paidBy = paidBy;
    doc.paidByName = memberName(group, paidBy);
    doc.items = items;
    doc.total = total;
    doc.shares = shares;
    doc.searchText = searchText;
    doc.updatedAt = Date.now();
    await doc.save();

    await recordActivity({
      group,
      actorId,
      actorName: displayNameOf(ctx.user),
      type: 'session.updated',
      summary: `${displayNameOf(ctx.user)} edited a session${doc.shop ? ` at ${doc.shop}` : ''}`,
      changes,
      targetId: doc._id.toString(),
      amount: total,
      notification: {
        title: `${displayNameOf(ctx.user)} edited a session`,
        body: changes.slice(0, 3).join(' · '),
      },
    });

    return ok({ session: sessionDto(doc) });
  }),

  route('DELETE', 'groups/:groupId/sessions/:sessionId', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const doc = await SessionModel.findOne({
      _id: ctx.params.sessionId,
      groupId: group._id.toString(),
      deletedAt: null,
    });
    if (!doc) throw notFound('That session no longer exists.');

    // Soft delete so delta sync can tell other devices to drop it.
    doc.deletedAt = Date.now();
    doc.updatedAt = doc.deletedAt;
    await doc.save();

    const where = doc.shop ? ` at ${doc.shop}` : '';
    await recordActivity({
      group,
      actorId: ctx.user._id.toString(),
      actorName: displayNameOf(ctx.user),
      type: 'session.deleted',
      summary: `${displayNameOf(ctx.user)} deleted a session${where} · ${formatMoney(doc.total)}`,
      changes: doc.items.map(item => `${item.name} ${formatMoney(item.amount)}`),
      targetId: doc._id.toString(),
      amount: doc.total,
      notification: {
        title: `${displayNameOf(ctx.user)} deleted a session`,
        body: `${formatMoney(doc.total)}${where} — balances updated.`,
      },
    });

    return ok({ deleted: true, id: doc._id.toString() });
  }),
];
