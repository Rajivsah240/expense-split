import { formatMoney, parseAmount } from '../../shared/money.js';
import { settlementDto } from '../dto.js';
import { recordActivity } from '../events.js';
import { badRequest, created, forbidden, notFound, ok, optionalString, route, toNumber } from '../http.js';
import { SettlementModel } from '../models.js';
import { MAX_AMOUNT, displayNameOf, memberName, requireGroup } from './shared.js';

export const settlementRoutes = [
  route('GET', 'groups/:groupId/settlements', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const before = toNumber(ctx.query.before, 0);
    const limit = Math.min(100, Math.max(1, toNumber(ctx.query.limit, 30)));

    const docs = await SettlementModel.find({
      groupId: group._id.toString(),
      deletedAt: null,
      ...(before ? { createdAt: { $lt: before } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const page = docs.slice(0, limit);
    return ok({
      settlements: page.map(settlementDto),
      nextBefore: docs.length > limit && page.length ? page[page.length - 1].createdAt : 0,
    });
  }),

  route('POST', 'groups/:groupId/settlements', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const actorId = ctx.user._id.toString();

    const fromUser = String(ctx.body.fromUser ?? '');
    const toUser = String(ctx.body.toUser ?? '');
    if (!group.memberIds.includes(fromUser) || !group.memberIds.includes(toUser)) {
      throw badRequest('Both people must be members of this group.');
    }
    if (fromUser === toUser) throw badRequest('A settlement needs two different people.');

    // You can only record a payment you are part of — never someone else's.
    if (actorId !== fromUser && actorId !== toUser) {
      throw forbidden('You can only mark settlements that involve you.');
    }

    const amount = typeof ctx.body.amount === 'number' ? Math.round(ctx.body.amount) : parseAmount(String(ctx.body.amount ?? ''));
    if (amount === null || amount <= 0) throw badRequest('Enter an amount greater than zero.');
    if (amount > MAX_AMOUNT) throw badRequest(`Settlements are capped at ${formatMoney(MAX_AMOUNT)}.`);

    const now = Date.now();
    const fromName = memberName(group, fromUser);
    const toName = memberName(group, toUser);

    const doc = await SettlementModel.create({
      groupId: group._id.toString(),
      fromUser,
      fromName,
      toUser,
      toName,
      amount,
      note: optionalString(ctx.body.note, 300),
      recordedBy: actorId,
      recordedByName: displayNameOf(ctx.user),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await recordActivity({
      group,
      actorId,
      actorName: displayNameOf(ctx.user),
      type: 'settlement.created',
      summary: `${displayNameOf(ctx.user)} marked ${fromName} → ${toName} ${formatMoney(amount)} as settled`,
      targetId: doc._id.toString(),
      amount,
      notification: {
        title: `${fromName} paid ${toName} ${formatMoney(amount)}`,
        body: `Recorded by ${displayNameOf(ctx.user)}. Balances updated.`,
      },
    });

    return created({ settlement: settlementDto(doc) });
  }),

  route('DELETE', 'groups/:groupId/settlements/:settlementId', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const actorId = ctx.user._id.toString();
    const doc = await SettlementModel.findOne({
      _id: ctx.params.settlementId,
      groupId: group._id.toString(),
      deletedAt: null,
    });
    if (!doc) throw notFound('That settlement no longer exists.');

    if (doc.recordedBy !== actorId && group.ownerId !== actorId) {
      throw forbidden('Only the person who recorded this settlement can undo it.');
    }

    doc.deletedAt = Date.now();
    doc.updatedAt = doc.deletedAt;
    await doc.save();

    await recordActivity({
      group,
      actorId,
      actorName: displayNameOf(ctx.user),
      type: 'settlement.deleted',
      summary: `${displayNameOf(ctx.user)} undid ${doc.fromName} → ${doc.toName} ${formatMoney(doc.amount)}`,
      targetId: doc._id.toString(),
      amount: doc.amount,
      notification: {
        title: `A settlement was undone`,
        body: `${doc.fromName} → ${doc.toName} ${formatMoney(doc.amount)} was reversed by ${displayNameOf(ctx.user)}.`,
      },
    });

    return ok({ deleted: true, id: doc._id.toString() });
  }),
];
