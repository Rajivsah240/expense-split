import { connectToDatabase } from '../db.js';
import { badRequest, created, HttpError, ok, route } from '../http.js';
import { PushSubscriptionModel } from '../models.js';
import { getPushPublicConfig } from '../push.js';

const KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * Push endpoints are server-side POST targets, so accepting an arbitrary URL
 * would create an authenticated SSRF primitive. These are the production Web
 * Push services used by the browsers this PWA supports.
 */
function isTrustedPushHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'fcm.googleapis.com' ||
    host === 'push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host === 'push.apple.com' ||
    host.endsWith('.push.apple.com') ||
    host === 'notify.windows.com' ||
    host.endsWith('.notify.windows.com')
  );
}

export function readPushSubscription(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('Invalid push subscription.');
  }

  const input = value as Record<string, unknown>;
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
  const keys = input.keys as Record<string, unknown> | undefined;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : '';

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw badRequest('Invalid push subscription endpoint.');
  }

  if (
    endpoint.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !isTrustedPushHost(url.hostname)
  ) {
    throw badRequest('Unsupported push subscription endpoint.');
  }
  if (
    p256dh.length < 32 ||
    p256dh.length > 256 ||
    auth.length < 8 ||
    auth.length > 128 ||
    !KEY_PATTERN.test(p256dh) ||
    !KEY_PATTERN.test(auth)
  ) {
    throw badRequest('Invalid push subscription keys.');
  }

  const rawExpiration = input.expirationTime;
  const expirationTime =
    typeof rawExpiration === 'number' && Number.isFinite(rawExpiration) ? Math.round(rawExpiration) : null;

  return { endpoint, keys: { p256dh, auth }, expirationTime };
}

export const pushRoutes = [
  route('GET', 'push/config', async () => ok(getPushPublicConfig())),

  route('POST', 'push/subscriptions', async ctx => {
    if (!getPushPublicConfig().enabled) {
      throw new HttpError(503, 'Mobile notifications are not configured on the server.');
    }

    const subscription = readPushSubscription(ctx.body.subscription);
    const userId = ctx.user._id.toString();
    const now = Date.now();
    await connectToDatabase();

    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          keys: subscription.keys,
          expirationTime: subscription.expirationTime,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, runValidators: true }
    );

    // Keep forgotten test installs and old browser profiles from growing without
    // bound while still allowing one account on several real devices.
    const overflow = await PushSubscriptionModel.find({ userId })
      .sort({ updatedAt: -1 })
      .skip(10)
      .select('_id')
      .lean();
    if (overflow.length) {
      await PushSubscriptionModel.deleteMany({ _id: { $in: overflow.map(entry => entry._id) } });
    }

    return created({ subscribed: true });
  }),

  route('DELETE', 'push/subscriptions', async ctx => {
    const endpoint = typeof ctx.body.endpoint === 'string' ? ctx.body.endpoint.trim() : '';
    if (!endpoint || endpoint.length > 2048) throw badRequest('Push subscription endpoint is required.');

    await connectToDatabase();
    await PushSubscriptionModel.deleteOne({
      userId: ctx.user._id.toString(),
      endpoint,
    });
    return ok({ subscribed: false });
  }),
];
