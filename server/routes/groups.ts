import crypto from 'crypto';
import { balancesFromTotals, formatMoney, minimalTransfers, type Totals } from '../../shared/money.js';
import { DEFAULT_GROUP_SETTINGS, type GroupState } from '../../shared/types.js';
import { connectToDatabase } from '../db.js';
import { activityDto, groupDto, notificationDto, sessionDto, settlementDto } from '../dto.js';
import { recordActivity } from '../events.js';
import {
  badRequest,
  conflict,
  created,
  forbidden,
  notFound,
  ok,
  optionalString,
  requireString,
  route,
  toNumber,
} from '../http.js';
import {
  ActivityModel,
  Group,
  NotificationModel,
  SessionModel,
  SettlementModel,
  User,
  type GroupDoc,
} from '../models.js';
import { displayNameOf, memberName, requireGroup, requireOwner } from './shared.js';
import { MONTH_KEY_EXPRESSION, monthKeyOf } from '../time.js';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SNAPSHOT_SESSIONS = 60;
const SNAPSHOT_SETTLEMENTS = 40;
const SNAPSHOT_ACTIVITIES = 40;
const SNAPSHOT_NOTIFICATIONS = 40;

function newInviteCode(): string {
  const bytes = crypto.randomBytes(7);
  return Array.from(bytes, byte => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join('');
}

async function createUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newInviteCode();
    const clash = await Group.findOne({ inviteCode: code }).select('_id');
    if (!clash) return code;
  }
  throw new Error('Could not allocate an invite code. Please try again.');
}

/** Money totals straight from the database, so balances stay exact at any history size. */
async function ledgerFor(groupId: string, memberIds: string[]) {
  const [sessionFacets] = await SessionModel.aggregate([
    { $match: { groupId, deletedAt: null } },
    {
      $facet: {
        paid: [{ $group: { _id: '$paidBy', value: { $sum: '$total' } } }],
        owed: [
          { $project: { pairs: { $objectToArray: { $ifNull: ['$shares', {}] } } } },
          { $unwind: '$pairs' },
          { $group: { _id: '$pairs.k', value: { $sum: '$pairs.v' } } },
        ],
        // Computed here rather than on the client, which only holds the most
        // recent page of sessions and would undercount once history grows.
        monthly: [{ $group: { _id: MONTH_KEY_EXPRESSION, value: { $sum: '$total' } } }],
        totals: [
          {
            $group: {
              _id: null,
              groupTotal: { $sum: '$total' },
              sessionCount: { $sum: 1 },
              itemCount: { $sum: { $size: { $ifNull: ['$items', []] } } },
              firstSessionAt: { $min: '$date' },
              lastSessionAt: { $max: '$date' },
            },
          },
        ],
      },
    },
  ]);

  const [settlementFacets] = await SettlementModel.aggregate([
    { $match: { groupId, deletedAt: null } },
    {
      $facet: {
        out: [{ $group: { _id: '$fromUser', value: { $sum: '$amount' } } }],
        received: [{ $group: { _id: '$toUser', value: { $sum: '$amount' } } }],
        count: [{ $count: 'value' }],
      },
    },
  ]);

  const toMap = (rows: { _id: string; value: number }[] | undefined): Totals =>
    Object.fromEntries((rows ?? []).filter(row => row._id).map(row => [row._id, row.value]));

  const totals = sessionFacets?.totals?.[0] ?? {};
  const thisMonth = monthKeyOf();
  const monthTotal =
    (sessionFacets?.monthly ?? []).find((row: { _id: string }) => row._id === thisMonth)?.value ?? 0;

  const balances = balancesFromTotals(
    memberIds,
    toMap(sessionFacets?.paid),
    toMap(sessionFacets?.owed),
    toMap(settlementFacets?.out),
    toMap(settlementFacets?.received)
  );

  return {
    balances,
    transfers: minimalTransfers(balances),
    totals: {
      groupTotal: totals.groupTotal ?? 0,
      monthTotal,
      sessionCount: totals.sessionCount ?? 0,
      itemCount: totals.itemCount ?? 0,
      settlementCount: settlementFacets?.count?.[0]?.value ?? 0,
      firstSessionAt: totals.firstSessionAt ?? null,
      lastSessionAt: totals.lastSessionAt ?? null,
    },
  };
}

export const groupRoutes = [
  route('GET', 'groups', async ctx => {
    await connectToDatabase();
    const userId = ctx.user._id.toString();
    const groups = await Group.find({ memberIds: userId, deletedAt: null }).sort({ updatedAt: -1 });

    // One aggregation for every group's headline numbers, rather than N queries.
    const groupIds = groups.map(group => group._id.toString());
    const rows = groupIds.length
      ? await SessionModel.aggregate([
          { $match: { groupId: { $in: groupIds }, deletedAt: null } },
          {
            $group: {
              _id: '$groupId',
              groupTotal: { $sum: '$total' },
              sessionCount: { $sum: 1 },
              lastSessionAt: { $max: '$date' },
            },
          },
        ])
      : [];
    const summary = new Map(rows.map(row => [row._id as string, row]));

    return ok({
      groups: groups.map(group => {
        const stats = summary.get(group._id.toString());
        return {
          ...groupDto(group),
          summary: {
            groupTotal: stats?.groupTotal ?? 0,
            sessionCount: stats?.sessionCount ?? 0,
            lastSessionAt: stats?.lastSessionAt ?? null,
          },
        };
      }),
    });
  }),

  route('POST', 'groups', async ctx => {
    await connectToDatabase();
    if (!ctx.user.profileComplete) throw badRequest('Finish your profile before creating a group.');

    const name = requireString(ctx.body.name, 'Group name', 60);
    const emoji = optionalString(ctx.body.emoji, 8) || '🏠';
    const userId = ctx.user._id.toString();
    const now = Date.now();

    const group = await Group.create({
      name,
      emoji,
      ownerId: userId,
      inviteCode: await createUniqueInviteCode(),
      settings: { ...DEFAULT_GROUP_SETTINGS },
      members: [
        {
          userId,
          displayName: displayNameOf(ctx.user),
          username: ctx.user.username ?? '',
          role: 'owner',
          joinedAt: now,
        },
      ],
      memberIds: [userId],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await recordActivity({
      group,
      actorId: userId,
      actorName: displayNameOf(ctx.user),
      type: 'group.created',
      summary: `${displayNameOf(ctx.user)} created the group "${name}"`,
      targetId: group._id.toString(),
    });

    return created({ group: groupDto(group) });
  }),

  route('POST', 'groups/join', async ctx => {
    await connectToDatabase();
    if (!ctx.user.profileComplete) throw badRequest('Finish your profile before joining a group.');

    const code = requireString(ctx.body.code, 'Invite code', 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const group = await Group.findOne({ inviteCode: code, deletedAt: null });
    if (!group) throw notFound('That invite code is not valid.');

    const userId = ctx.user._id.toString();
    if (group.memberIds.includes(userId)) return ok({ group: groupDto(group), alreadyMember: true });

    group.members.push({
      userId,
      displayName: displayNameOf(ctx.user),
      username: ctx.user.username ?? '',
      role: 'member',
      joinedAt: Date.now(),
    });
    group.memberIds.push(userId);
    group.updatedAt = Date.now();
    await group.save();

    await recordActivity({
      group,
      actorId: userId,
      actorName: displayNameOf(ctx.user),
      type: 'member.joined',
      summary: `${displayNameOf(ctx.user)} joined the group`,
      targetId: userId,
      notification: {
        title: `${displayNameOf(ctx.user)} joined ${group.name}`,
        body: 'They can now add and share expenses.',
      },
    });

    return ok({ group: groupDto(group) });
  }),

  /**
   * The single read the app polls. `since=0` returns a full snapshot; any later
   * value returns only what changed, including tombstones for deleted rows, so
   * every member converges on identical data within one poll interval.
   */
  route('GET', 'groups/:groupId/state', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const groupId = group._id.toString();
    const userId = ctx.user._id.toString();
    const since = Math.max(0, toNumber(ctx.query.since, 0));
    const full = since === 0;
    const now = Date.now();

    const sessionQuery = full
      ? SessionModel.find({ groupId, deletedAt: null }).sort({ date: -1, createdAt: -1 }).limit(SNAPSHOT_SESSIONS)
      : SessionModel.find({ groupId, deletedAt: null, updatedAt: { $gt: since } }).sort({ updatedAt: -1 }).limit(200);

    const settlementQuery = full
      ? SettlementModel.find({ groupId, deletedAt: null }).sort({ createdAt: -1 }).limit(SNAPSHOT_SETTLEMENTS)
      : SettlementModel.find({ groupId, deletedAt: null, updatedAt: { $gt: since } }).sort({ updatedAt: -1 }).limit(200);

    const activityQuery = ActivityModel.find(
      full ? { groupId } : { groupId, createdAt: { $gt: since } }
    )
      .sort({ createdAt: -1 })
      .limit(full ? SNAPSHOT_ACTIVITIES : 100);

    const notificationQuery = NotificationModel.find(
      full ? { userId } : { userId, createdAt: { $gt: since } }
    )
      .sort({ createdAt: -1 })
      .limit(full ? SNAPSHOT_NOTIFICATIONS : 100);

    const [sessions, settlements, activities, notifications, unreadCount, removedSessions, removedSettlements, ledger] =
      await Promise.all([
        sessionQuery,
        settlementQuery,
        activityQuery,
        notificationQuery,
        NotificationModel.countDocuments({ userId, read: false }),
        full ? [] : SessionModel.find({ groupId, deletedAt: { $gt: since } }).select('_id').limit(200),
        full ? [] : SettlementModel.find({ groupId, deletedAt: { $gt: since } }).select('_id').limit(200),
        ledgerFor(groupId, group.memberIds ?? []),
      ]);

    const state: GroupState = {
      now,
      group: groupDto(group),
      balances: ledger.balances,
      transfers: ledger.transfers,
      totals: ledger.totals,
      sessions: sessions.map(sessionDto),
      settlements: settlements.map(settlementDto),
      activities: activities.map(activityDto),
      notifications: notifications.map(notificationDto),
      unreadCount,
      removed: {
        sessions: removedSessions.map(doc => doc._id.toString()),
        settlements: removedSettlements.map(doc => doc._id.toString()),
      },
      full,
    };

    return ok(state);
  }),

  route('PATCH', 'groups/:groupId', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    requireOwner(group, ctx.user);
    const previousName = group.name;

    if (ctx.body.name !== undefined) group.name = requireString(ctx.body.name, 'Group name', 60);
    if (ctx.body.emoji !== undefined) group.emoji = optionalString(ctx.body.emoji, 8) || '🏠';
    if (ctx.body.assumeSharedWhenUnspecified !== undefined) {
      group.settings.assumeSharedWhenUnspecified = Boolean(ctx.body.assumeSharedWhenUnspecified);
    }
    if (ctx.body.transferOwnershipTo !== undefined) {
      const nextOwner = String(ctx.body.transferOwnershipTo);
      if (!group.memberIds.includes(nextOwner)) throw badRequest('That person is not in this group.');
      group.ownerId = nextOwner;
      group.members = group.members.map(member => ({
        ...member,
        role: member.userId === nextOwner ? 'owner' : 'member',
      }));
    }

    group.updatedAt = Date.now();
    await group.save();

    if (group.name !== previousName) {
      await recordActivity({
        group,
        actorId: ctx.user._id.toString(),
        actorName: displayNameOf(ctx.user),
        type: 'group.renamed',
        summary: `${displayNameOf(ctx.user)} renamed the group to "${group.name}"`,
        targetId: group._id.toString(),
        notification: { title: `"${previousName}" is now "${group.name}"`, body: 'The group was renamed.' },
      });
    }

    return ok({ group: groupDto(group) });
  }),

  route('POST', 'groups/:groupId/invite/rotate', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    requireOwner(group, ctx.user);
    group.inviteCode = await createUniqueInviteCode();
    group.updatedAt = Date.now();
    await group.save();
    return ok({ group: groupDto(group) });
  }),

  route('POST', 'groups/:groupId/members', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    requireOwner(group, ctx.user);

    const username = requireString(ctx.body.username, 'Username', 30).replace(/^@/, '').toLowerCase();
    const member = await User.findOne({ usernameLower: username });
    if (!member) throw notFound(`No one is registered as @${username}.`);

    const memberId = member._id.toString();
    if (group.memberIds.includes(memberId)) throw conflict(`${displayNameOf(member)} is already in this group.`);

    group.members.push({
      userId: memberId,
      displayName: displayNameOf(member),
      username: member.username ?? '',
      role: 'member',
      joinedAt: Date.now(),
    });
    group.memberIds.push(memberId);
    group.updatedAt = Date.now();
    await group.save();

    await recordActivity({
      group,
      actorId: ctx.user._id.toString(),
      actorName: displayNameOf(ctx.user),
      type: 'member.added',
      summary: `${displayNameOf(ctx.user)} added ${displayNameOf(member)} to the group`,
      targetId: memberId,
      notification: {
        title: `${displayNameOf(member)} was added to ${group.name}`,
        body: `Added by ${displayNameOf(ctx.user)}.`,
      },
    });

    return ok({ group: groupDto(group) });
  }),

  route('DELETE', 'groups/:groupId/members/:userId', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const actorId = ctx.user._id.toString();
    const targetId = ctx.params.userId;
    const leaving = targetId === actorId;

    if (!leaving) requireOwner(group, ctx.user);
    if (!group.memberIds.includes(targetId)) throw notFound('That person is not in this group.');
    if (targetId === group.ownerId) {
      throw badRequest('Transfer ownership to someone else before leaving or removing the owner.');
    }

    // Removing someone mid-ledger would strand their share, so require a clean slate.
    const ledger = await ledgerFor(group._id.toString(), group.memberIds);
    const balance = ledger.balances.find(entry => entry.userId === targetId);
    if (balance && balance.net !== 0) {
      const name = memberName(group, targetId);
      throw badRequest(
        balance.net > 0
          ? `${name} is still owed ${formatMoney(balance.net)}. Settle up first.`
          : `${name} still owes ${formatMoney(-balance.net)}. Settle up first.`
      );
    }

    const removedName = memberName(group, targetId);
    group.members = group.members.filter(member => member.userId !== targetId);
    group.memberIds = group.memberIds.filter(userId => userId !== targetId);
    group.updatedAt = Date.now();
    await group.save();

    await recordActivity({
      group,
      actorId,
      actorName: displayNameOf(ctx.user),
      type: leaving ? 'member.left' : 'member.removed',
      summary: leaving
        ? `${removedName} left the group`
        : `${displayNameOf(ctx.user)} removed ${removedName} from the group`,
      targetId,
      notification: {
        title: leaving ? `${removedName} left ${group.name}` : `${removedName} was removed from ${group.name}`,
        body: leaving ? 'Their past expenses stay in the history.' : `Removed by ${displayNameOf(ctx.user)}.`,
      },
      alsoNotify: leaving ? [] : [targetId],
    });

    return ok({ group: groupDto(group) });
  }),

  route('DELETE', 'groups/:groupId', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    requireOwner(group, ctx.user);
    if ((group.memberIds ?? []).length > 1) {
      throw forbidden('Remove the other members before deleting this group.');
    }
    group.deletedAt = Date.now();
    group.updatedAt = Date.now();
    await group.save();
    return ok({ deleted: true });
  }),
];

export { ledgerFor };
export type { GroupDoc };
