import { activityDto, notificationDto } from '../dto.js';
import { connectToDatabase } from '../db.js';
import { ok, requireArray, route, toNumber } from '../http.js';
import { ActivityModel, NotificationModel } from '../models.js';
import { requireGroup } from './shared.js';

export const feedRoutes = [
  route('GET', 'groups/:groupId/activity', async ctx => {
    const group = await requireGroup(ctx.user, ctx.params.groupId);
    const before = toNumber(ctx.query.before, 0);
    const limit = Math.min(100, Math.max(1, toNumber(ctx.query.limit, 40)));

    const docs = await ActivityModel.find({
      groupId: group._id.toString(),
      ...(before ? { createdAt: { $lt: before } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const page = docs.slice(0, limit);
    return ok({
      activities: page.map(activityDto),
      nextBefore: docs.length > limit && page.length ? page[page.length - 1].createdAt : 0,
    });
  }),

  route('GET', 'notifications', async ctx => {
    await connectToDatabase();
    const userId = ctx.user._id.toString();
    const before = toNumber(ctx.query.before, 0);
    const limit = Math.min(100, Math.max(1, toNumber(ctx.query.limit, 40)));

    const docs = await NotificationModel.find({
      userId,
      ...(before ? { createdAt: { $lt: before } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const page = docs.slice(0, limit);
    return ok({
      notifications: page.map(notificationDto),
      unreadCount: await NotificationModel.countDocuments({ userId, read: false }),
      nextBefore: docs.length > limit && page.length ? page[page.length - 1].createdAt : 0,
    });
  }),

  route('POST', 'notifications/read', async ctx => {
    await connectToDatabase();
    const userId = ctx.user._id.toString();

    if (ctx.body.all === true) {
      await NotificationModel.updateMany({ userId, read: false }, { $set: { read: true } });
    } else {
      const ids = requireArray(ctx.body.ids, 'ids')
        .map(String)
        .filter(id => /^[a-f\d]{24}$/i.test(id))
        .slice(0, 200);
      if (ids.length) {
        await NotificationModel.updateMany({ userId, _id: { $in: ids } }, { $set: { read: true } });
      }
    }

    return ok({ unreadCount: await NotificationModel.countDocuments({ userId, read: false }) });
  }),

  route('DELETE', 'notifications', async ctx => {
    await connectToDatabase();
    await NotificationModel.deleteMany({ userId: ctx.user._id.toString() });
    return ok({ cleared: true, unreadCount: 0 });
  }),
];
