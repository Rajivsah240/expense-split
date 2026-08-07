/**
 * Calendar-range insights. Every card is computed from the same server-resolved
 * range so a selected period never mixes current and all-time data.
 */

import type { GroupStats, StatsBucket } from '../../shared/types.js';
import { ok, optionalString, route } from '../http.js';
import { SessionModel } from '../models.js';
import { memberName, requireGroup } from './shared.js';
import {
  DAY_KEY_EXPRESSION,
  MONTH_KEY_EXPRESSION,
  STATS_TIMEZONE,
  resolveStatsRange,
  statsTimelineKeys,
  statsTimelineLabel,
} from '../time.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type BucketRow = { _id: string; value: number };

const rows = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function buckets(rowsIn: BucketRow[], label: (id: string) => string): StatsBucket[] {
  return rowsIn
    .filter(row => row._id)
    .map(row => ({ key: row._id, label: label(row._id), value: row.value }))
    .sort((a, b) => b.value - a.value);
}

function myShareExpression(userId: string) {
  return {
    $sum: {
      $map: {
        input: {
          $filter: {
            input: { $objectToArray: { $ifNull: ['$items.shares', {}] } },
            as: 'share',
            cond: { $eq: ['$$share.k', userId] },
          },
        },
        as: 'share',
        in: '$$share.v',
      },
    },
  };
}

export const statsRoutes = [
  route('GET', 'groups/:groupId/stats', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const groupId = group._id.toString();
    const userId = ctx.user._id.toString();
    const scope = ctx.query.scope === 'group' ? 'group' : 'mine';
    const range = resolveStatsRange(optionalString(ctx.query.period, 24), optionalString(ctx.query.date, 24));
    const dayOf = DAY_KEY_EXPRESSION;
    const timelineOf = range.bucket === 'day' ? DAY_KEY_EXPRESSION : MONTH_KEY_EXPRESSION;
    const withinRange = {
      $expr: {
        $and: [
          { $gte: [dayOf, range.from] },
          { $lte: [dayOf, range.to] },
        ],
      },
    };

    // Group scope is public shared data only. My scope includes the caller's
    // share of public items and their own private sessions—never anyone else's.
    const visibility =
      scope === 'group'
        ? { groupId, deletedAt: null, visibility: { $ne: 'private' } }
        : {
            groupId,
            deletedAt: null,
            $or: [
              { visibility: { $ne: 'private' }, 'items.owners': userId },
              { visibility: 'private', privateTo: userId },
            ],
          };
    const basePipeline = [{ $match: visibility }, { $match: withinRange }];

    const itemScope =
      scope === 'mine'
        ? [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: [{ $ifNull: ['$visibility', 'group'] }, 'private'] },
                    { $in: [userId, { $ifNull: ['$items.owners', []] }] },
                  ],
                },
              },
            },
          ]
        : [];
    const itemValue =
      scope === 'mine'
        ? {
            $cond: [
              { $eq: [{ $ifNull: ['$visibility', 'group'] }, 'private'] },
              '$items.amount',
              myShareExpression(userId),
            ],
          }
        : '$items.amount';

    const [itemFacets] = await SessionModel.aggregate([
      ...basePipeline,
      { $unwind: '$items' },
      ...itemScope,
      {
        $project: {
          timelineKey: timelineOf,
          value: itemValue,
          category: '$items.category',
          name: '$items.name',
          owners: { $ifNull: ['$items.owners', []] },
        },
      },
      {
        $facet: {
          timeline: [{ $group: { _id: '$timelineKey', value: { $sum: '$value' } } }],
          total: [{ $group: { _id: null, value: { $sum: '$value' } } }],
          byCategory: [{ $group: { _id: '$category', value: { $sum: '$value' } } }],
          topItems: [
            {
              $group: {
                _id: { $toLower: '$name' },
                label: { $first: '$name' },
                count: { $sum: 1 },
                total: { $sum: '$value' },
              },
            },
            { $sort: { count: -1, total: -1 } },
            { $limit: 10 },
          ],
          sharedVsSinglePerson: [
            {
              $group: {
                _id: { $cond: [{ $lte: [{ $size: '$owners' }, 1] }, 'single', 'shared'] },
                value: { $sum: '$value' },
              },
            },
          ],
        },
      },
    ]);

    const [sessionFacets] = await SessionModel.aggregate([
      ...basePipeline,
      {
        $facet: {
          entries: [{ $count: 'value' }],
          activeDays: [{ $group: { _id: dayOf } }, { $count: 'value' }],
          weekday: [
            {
              $group: {
                _id: { $dayOfWeek: { date: { $toDate: '$date' }, timezone: STATS_TIMEZONE } },
                value: { $sum: 1 },
              },
            },
          ],
          byMember:
            scope === 'group'
              ? [
                  { $project: { pairs: { $objectToArray: { $ifNull: ['$shares', {}] } } } },
                  { $unwind: '$pairs' },
                  { $group: { _id: '$pairs.k', value: { $sum: '$pairs.v' } } },
                ]
              : [],
        },
      },
    ]);

    const timelineMap = new Map<string, number>(rows<BucketRow>(itemFacets?.timeline).map(row => [row._id, row.value]));
    const timeline = statsTimelineKeys(range).map(key => ({
      key,
      label: statsTimelineLabel(key, range.bucket),
      value: timelineMap.get(key) ?? 0,
    }));
    const sharedRows = rows<BucketRow>(itemFacets?.sharedVsSinglePerson);
    const weekdayRows = rows<{ _id: number; value: number }>(sessionFacets?.weekday);
    const busiest = weekdayRows.slice().sort((a, b) => b.value - a.value)[0];

    const stats: GroupStats = {
      scope,
      range: { kind: range.kind, from: range.from, to: range.to, label: range.label },
      total: (rows<{ value: number }>(itemFacets?.total)[0]?.value ?? 0) as number,
      timeline,
      byMember:
        scope === 'group'
          ? buckets(rows<BucketRow>(sessionFacets?.byMember), userId => memberName(group, userId))
          : [],
      byCategory: buckets(rows<BucketRow>(itemFacets?.byCategory), id => id),
      topItems: rows<{ label: string; count: number; total: number }>(itemFacets?.topItems).map(row => ({
        name: row.label,
        count: row.count,
        total: row.total,
      })),
      sharedVsSinglePerson: {
        shared: sharedRows.find(row => row._id === 'shared')?.value ?? 0,
        singlePerson: sharedRows.find(row => row._id === 'single')?.value ?? 0,
      },
      frequency: {
        entryCount: rows<{ value: number }>(sessionFacets?.entries)[0]?.value ?? 0,
        activeDays: rows<{ value: number }>(sessionFacets?.activeDays)[0]?.value ?? 0,
        busiestWeekday: busiest ? WEEKDAYS[busiest._id - 1] ?? '—' : '—',
      },
    };

    return ok(stats);
  }),
];
