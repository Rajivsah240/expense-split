import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types.js';
import {
  USERNAME_PATTERN,
  normalizeEmail,
  requestOtp,
  serializeMe,
  verifyOtp,
} from '../auth.js';
import { connectToDatabase } from '../db.js';
import { badRequest, conflict, created, ok, requireString, route } from '../http.js';
import { Group, User } from '../models.js';

export const authRoutes = [
  route(
    'POST',
    'auth/request-otp',
    async ctx => ok(await requestOtp(normalizeEmail(ctx.body.email))),
    false
  ),

  route(
    'POST',
    'auth/verify-otp',
    async ctx => {
      const email = normalizeEmail(ctx.body.email);
      const code = String(ctx.body.code ?? ctx.body.otp ?? '').replace(/\D/g, '');
      return created(await verifyOtp(email, code));
    },
    false
  ),

  route('GET', 'me', async ctx => ok({ user: serializeMe(ctx.user) })),

  route('GET', 'me/username-available', async ctx => {
    const username = String(ctx.query.username ?? '').trim().replace(/^@/, '');
    if (!USERNAME_PATTERN.test(username)) {
      return ok({ available: false, reason: '3–20 letters, numbers or underscores.' });
    }
    await connectToDatabase();
    const existing = await User.findOne({ usernameLower: username.toLowerCase() }).select('_id');
    const mine = existing && existing._id.toString() === ctx.user._id.toString();
    return ok({
      available: !existing || Boolean(mine),
      reason: existing && !mine ? `@${username} is already taken.` : '',
    });
  }),

  route('PATCH', 'me', async ctx => {
    const userId = ctx.user._id.toString();
    const update: Record<string, unknown> = { updatedAt: Date.now() };

    if (ctx.body.displayName !== undefined) {
      update.displayName = requireString(ctx.body.displayName, 'Display name', 50);
    }

    if (ctx.body.username !== undefined) {
      const username = String(ctx.body.username).trim().replace(/^@/, '');
      if (!USERNAME_PATTERN.test(username)) {
        throw badRequest('Username must be 3–20 letters, numbers or underscores.');
      }
      update.username = username;
      update.usernameLower = username.toLowerCase();
    }

    if (ctx.body.notificationPrefs !== undefined) {
      const incoming = ctx.body.notificationPrefs as Record<string, unknown>;
      if (!incoming || typeof incoming !== 'object') throw badRequest('Invalid notification preferences.');
      const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(ctx.user.notificationPrefs ?? {}) };
      for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
        if (key in incoming) prefs[key as keyof typeof DEFAULT_NOTIFICATION_PREFS] = Boolean(incoming[key]);
      }
      update.notificationPrefs = prefs;
    }

    const displayName = (update.displayName as string) ?? ctx.user.displayName;
    const username = (update.username as string) ?? ctx.user.username;
    if (displayName && username) update.profileComplete = true;

    await connectToDatabase();
    let updated;
    try {
      updated = await User.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw conflict(`@${update.username} is already taken.`);
      }
      throw error;
    }
    if (!updated) throw badRequest('That account no longer exists.');

    // Keep the denormalised member snapshots in step with the live profile so
    // member lists and pickers never show a stale name.
    if (update.displayName !== undefined || update.username !== undefined) {
      await Group.updateMany(
        { memberIds: userId },
        {
          $set: {
            'members.$[entry].displayName': updated.displayName,
            'members.$[entry].username': updated.username ?? '',
            updatedAt: Date.now(),
          },
        },
        { arrayFilters: [{ 'entry.userId': userId }] }
      );
    }

    return ok({ user: serializeMe(updated) });
  }),
];
