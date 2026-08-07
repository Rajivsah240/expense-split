/**
 * Best-effort Web Push delivery.
 *
 * In-app notification rows remain the source of truth. Push is an additional
 * delivery channel, so a provider outage must never make an expense mutation
 * look as though it failed after its database writes already succeeded.
 */

import webPush from 'web-push';
import type { NotificationDoc } from './models.js';
import { PushSubscriptionModel } from './models.js';

type PushNotification = Pick<
  NotificationDoc,
  '_id' | 'userId' | 'groupId' | 'groupName' | 'title' | 'body' | 'createdAt'
>;

let vapidState: 'unchecked' | 'ready' | 'unavailable' = 'unchecked';

function configureVapid(): boolean {
  if (vapidState !== 'unchecked') return vapidState === 'ready';

  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) {
    vapidState = 'unavailable';
    return false;
  }

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    vapidState = 'ready';
    return true;
  } catch {
    // Do not include the thrown value: malformed-key errors can echo secrets.
    console.error('[push] VAPID configuration is invalid; mobile delivery is disabled.');
    vapidState = 'unavailable';
    return false;
  }
}

export function getPushPublicConfig(): { enabled: boolean; publicKey: string } {
  const enabled = configureVapid();
  return {
    enabled,
    publicKey: enabled ? process.env.VAPID_PUBLIC_KEY!.trim() : '',
  };
}

function isExpiredSubscriptionError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushNotifications(notifications: PushNotification[]): Promise<void> {
  if (!notifications.length || !configureVapid()) return;

  try {
    const notificationByUser = new Map(notifications.map(notification => [notification.userId, notification]));
    const subscriptions = await PushSubscriptionModel.find({
      userId: { $in: [...notificationByUser.keys()] },
    }).lean();
    if (!subscriptions.length) return;

    const staleEndpoints: string[] = [];
    let failedCount = 0;

    await Promise.all(
      subscriptions.map(async subscription => {
        const notification = notificationByUser.get(subscription.userId);
        if (!notification) return;

        const notificationId = notification._id.toString();
        const payload = JSON.stringify({
          title: notification.title.slice(0, 120),
          body: notification.body.slice(0, 280),
          groupName: notification.groupName.slice(0, 80),
          notificationId,
          groupId: notification.groupId,
          createdAt: notification.createdAt,
          url: `/?group=${encodeURIComponent(notification.groupId)}&notification=${encodeURIComponent(notificationId)}`,
        });

        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            payload,
            {
              TTL: 60 * 60 * 24,
              urgency: 'high',
              // Keep an external push provider from holding an already-saved
              // expense open until the serverless function itself times out.
              timeout: 5000,
            }
          );
        } catch (error) {
          if (isExpiredSubscriptionError(error)) {
            staleEndpoints.push(subscription.endpoint);
          } else {
            failedCount += 1;
          }
        }
      })
    );

    if (staleEndpoints.length) {
      await PushSubscriptionModel.deleteMany({ endpoint: { $in: staleEndpoints } });
    }
    if (failedCount) {
      console.warn(`[push] ${failedCount} mobile notification delivery attempt(s) failed.`);
    }
  } catch {
    console.warn('[push] Mobile notification delivery failed; the in-app notifications were still saved.');
  }
}
