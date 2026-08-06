/**
 * Insights, computed entirely by MongoDB aggregation so the numbers stay fast
 * and identical for every member regardless of how much history has loaded on
 * their device.
 */

import type { GroupStats, StatsBucket } from '../../shared/types.js';
import { ok, route, toNumber } from '../http.js';
import { SessionModel } from '../models.js';
import { memberName, requireGroup } from './shared.js';
import { MONTH_KEY_EXPRESSION, STATS_TIMEZONE, monthLabel, recentMonthKeys } from '../time.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const statsRoutes = [
  route('GET', 'groups/:groupId/stats', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const groupId = group._id.toString();
    const months = Math.min(24, Math.max(3, toNumber(ctx.query.months, 6)));

    // Axis and buckets are both derived in STATS_TIMEZONE so they always line up.
    const keys = recentMonthKeys(months);
    const monthOf = MONTH_KEY_EXPRESSION;
    // Filter by the month key rather than a timestamp, so the window boundary
    // uses exactly the same zone as the bucketing.
    const withinWindow = { $expr: { $gte: [monthOf, keys[0]] } };

    const [sessionFacets] = await SessionModel.aggregate([
      { $match: { groupId, deletedAt: null } },
      {
        $facet: {
          monthly: [{ $match: withinWindow }, { $group: { _id: monthOf, value: { $sum: '$total' } } }],
          contribution: [
            { $match: withinWindow },
            { $group: { _id: { month: monthOf, userId: '$paidBy' }, value: { $sum: '$total' } } },
          ],
          weekday: [
            {
              $group: {
                _id: { $dayOfWeek: { date: { $toDate: '$date' }, timezone: STATS_TIMEZONE } },
                value: { $sum: 1 },
              },
            },
          ],
          activeDays: [{ $group: { _id: '$date' } }, { $count: 'value' }],
          span: [{ $group: { _id: null, first: { $min: '$date' }, last: { $max: '$date' }, count: { $sum: 1 } } }],
          byMember: [
            { $project: { pairs: { $objectToArray: { $ifNull: ['$shares', {}] } } } },
            { $unwind: '$pairs' },
            { $group: { _id: '$pairs.k', value: { $sum: '$pairs.v' } } },
          ],
        },
      },
    ]);

    const [itemFacets] = await SessionModel.aggregate([
      { $match: { groupId, deletedAt: null } },
      { $unwind: '$items' },
      {
        $facet: {
          byCategory: [{ $group: { _id: '$items.category', value: { $sum: '$items.amount' } } }],
          topItems: [
            {
              $group: {
                _id: { $toLower: '$items.name' },
                label: { $first: '$items.name' },
                count: { $sum: 1 },
                total: { $sum: '$items.amount' },
              },
            },
            { $sort: { count: -1, total: -1 } },
            { $limit: 10 },
          ],
          sharedVsPersonal: [
            {
              $group: {
                _id: { $cond: [{ $lte: [{ $size: '$items.owners' }, 1] }, 'personal', 'shared'] },
                value: { $sum: '$items.amount' },
              },
            },
          ],
          personalByMember: [
            { $match: { $expr: { $eq: [{ $size: '$items.owners' }, 1] } } },
            { $group: { _id: { $arrayElemAt: ['$items.owners', 0] }, value: { $sum: '$items.amount' } } },
          ],
        },
      },
    ]);

    const rows = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
    const nameOf = (userId: string) => memberName(group, userId);

    type Bucket = { _id: string; value: number };
    const monthlyMap = new Map<string, number>(
      rows<Bucket>(sessionFacets?.monthly).map(row => [row._id, row.value])
    );
    const monthly: StatsBucket[] = keys.map(key => ({
      key,
      label: monthLabel(key),
      value: monthlyMap.get(key) ?? 0,
    }));

    const contributionByUser = new Map<string, Map<string, number>>();
    for (const row of rows(sessionFacets?.contribution) as { _id: { month: string; userId: string }; value: number }[]) {
      const perMonth = contributionByUser.get(row._id.userId) ?? new Map<string, number>();
      perMonth.set(row._id.month, row.value);
      contributionByUser.set(row._id.userId, perMonth);
    }

    const contributionByMember = group.members.map(member => {
      const perMonth = contributionByUser.get(member.userId) ?? new Map<string, number>();
      return {
        userId: member.userId,
        monthly: keys.map(key => ({ key, label: monthLabel(key), value: perMonth.get(key) ?? 0 })),
      };
    });

    const weekdayRows = rows(sessionFacets?.weekday) as { _id: number; value: number }[];
    const busiest = weekdayRows.slice().sort((a, b) => b.value - a.value)[0];
    const span = rows(sessionFacets?.span)[0] as
      | { first: number; last: number; count: number }
      | undefined;
    const weeks = span ? Math.max(1, (span.last - span.first) / (7 * 24 * 60 * 60 * 1000)) : 1;

    const sharedVsPersonalRows = rows(itemFacets?.sharedVsPersonal) as { _id: string; value: number }[];

    const bucket = (rowsIn: { _id: string; value: number }[], label: (id: string) => string): StatsBucket[] =>
      rowsIn
        .filter(row => row._id)
        .map(row => ({ key: row._id, label: label(row._id), value: row.value }))
        .sort((a, b) => b.value - a.value);

    const stats: GroupStats = {
      monthly,
      byMember: bucket(rows<Bucket>(sessionFacets?.byMember), nameOf),
      byCategory: bucket(rows<Bucket>(itemFacets?.byCategory), id => id),
      personalByMember: bucket(rows<Bucket>(itemFacets?.personalByMember), nameOf),
      topItems: rows<{ label: string; count: number; total: number }>(itemFacets?.topItems).map(row => ({
        name: row.label,
        count: row.count,
        total: row.total,
      })),
      sharedVsPersonal: {
        shared: sharedVsPersonalRows.find(row => row._id === 'shared')?.value ?? 0,
        personal: sharedVsPersonalRows.find(row => row._id === 'personal')?.value ?? 0,
      },
      contributionByMember,
      frequency: {
        sessionsPerWeek: span ? Number((span.count / weeks).toFixed(1)) : 0,
        activeDays: (rows(sessionFacets?.activeDays)[0] as { value: number } | undefined)?.value ?? 0,
        busiestWeekday: busiest ? WEEKDAYS[busiest._id - 1] ?? '—' : '—',
      },
    };

    return ok(stats);
  }),
];
