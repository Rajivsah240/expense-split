import { api } from './api';
import { isIos, isStandalone } from './pwa';

interface PushConfig {
  enabled: boolean;
  publicKey: string;
}

// Loaded while the preferences sheet is opening so the permission and
// subscription calls can remain inside the user's tap activation on iOS.
let cachedPublicKey = '';
let savedEndpoint = '';
let cachedRegistration: ServiceWorkerRegistration | null = null;
let cachedSubscription: PushSubscription | null = null;
const SUBSCRIPTION_API_TIMEOUT_MS = 4000;

export type PushSupportIssue =
  | 'insecure'
  | 'ios-install-required'
  | 'unsupported'
  | 'server-unconfigured'
  | null;

export interface MobilePushState {
  issue: PushSupportIssue;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

function browserSupportIssue(): PushSupportIssue {
  if (typeof window === 'undefined' || !window.isSecureContext) return 'insecure';
  // iOS exposes Web Push only to apps launched from their Home Screen.
  if (isIos() && !isStandalone()) return 'ios-install-required';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return null;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function sameApplicationServerKey(subscription: PushSubscription, expected: Uint8Array<ArrayBuffer>): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  await api('push/subscriptions', {
    method: 'POST',
    body: { subscription: subscription.toJSON() },
  });
  savedEndpoint = subscription.endpoint;
}

async function deleteSavedSubscription(endpoint: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SUBSCRIPTION_API_TIMEOUT_MS);
  try {
    await api('push/subscriptions', {
      method: 'DELETE',
      body: { endpoint },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadMobilePushState(): Promise<MobilePushState> {
  const issue = browserSupportIssue();
  if (issue) return { issue, permission: 'unsupported', subscribed: false };

  const config = await api<PushConfig>('push/config');
  if (!config.enabled || !config.publicKey) {
    cachedPublicKey = '';
    return {
      issue: 'server-unconfigured',
      permission: Notification.permission,
      subscribed: false,
    };
  }
  cachedPublicKey = config.publicKey;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  cachedRegistration = registration;
  const currentKey = applicationServerKey(config.publicKey);
  // Clean up a subscription made with an older VAPID key before the user taps
  // the switch. Safari requires the replacement subscribe() call itself to be
  // invoked immediately from that tap.
  if (
    subscription &&
    (Notification.permission !== 'granted' || !sameApplicationServerKey(subscription, currentKey))
  ) {
    await subscription.unsubscribe();
    subscription = null;
    savedEndpoint = '';
  }
  cachedSubscription = subscription;
  const subscribed = subscription !== null && Notification.permission === 'granted';
  if (
    subscription &&
    Notification.permission === 'granted' &&
    subscription.endpoint !== savedEndpoint
  ) {
    await saveSubscription(subscription);
  }
  return {
    issue: null,
    permission: Notification.permission,
    subscribed,
  };
}

/**
 * Associate an already-approved browser subscription with the signed-in user.
 * This is intentionally silent and never asks for permission on app launch.
 */
export async function reconcileMobilePushSubscription(): Promise<void> {
  if (browserSupportIssue() || Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  cachedRegistration = registration;
  cachedSubscription = subscription;
  if (!subscription) return;
  if (subscription.endpoint === savedEndpoint) return;

  const config = await api<PushConfig>('push/config');
  if (!config.enabled || !config.publicKey) return;
  cachedPublicKey = config.publicKey;
  if (!sameApplicationServerKey(subscription, applicationServerKey(config.publicKey))) {
    await subscription.unsubscribe();
    cachedSubscription = null;
    return;
  }
  await saveSubscription(subscription);
}

export async function enableMobilePush(): Promise<void> {
  const issue = browserSupportIssue();
  if (issue === 'insecure') throw new Error('Mobile notifications need a secure HTTPS connection.');
  if (issue === 'ios-install-required') {
    throw new Error('On iPhone or iPad, add Expense Split to your Home Screen first.');
  }
  if (issue) throw new Error('This browser does not support mobile notifications.');

  const publicKey = cachedPublicKey;
  const registration = cachedRegistration;
  if (!publicKey || !registration) {
    throw new Error('Mobile notifications are still being prepared. Reopen this screen and try again.');
  }

  // PushManager.subscribe() both requests permission and creates the endpoint.
  // It must be the first asynchronous operation after the switch tap on Safari.
  let subscription = cachedSubscription;

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
    } catch (error) {
      if (Notification.permission === 'denied' || (error as { name?: string })?.name === 'NotAllowedError') {
        throw new Error('Notifications are blocked. Allow them in your browser or phone settings.');
      }
      throw error;
    }
    cachedSubscription = subscription;
  }

  try {
    await saveSubscription(subscription);
  } catch (error) {
    // Do not leave a device subscribed to a previous account if association
    // with the current account could not be secured on the server.
    await subscription.unsubscribe().catch(() => false);
    cachedSubscription = null;
    throw error;
  }
}

export async function disableMobilePush(): Promise<void> {
  if (browserSupportIssue()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  // Unsubscribe locally without waiting for a slow network request. The server
  // call remains authenticated and is bounded so sign-out cannot hang forever.
  const [serverResult, localResult] = await Promise.allSettled([
    deleteSavedSubscription(subscription.endpoint),
    subscription.unsubscribe(),
  ]);
  if (localResult.status === 'fulfilled') {
    savedEndpoint = '';
    cachedSubscription = null;
  }
  if (serverResult.status === 'rejected') throw serverResult.reason;
  if (localResult.status === 'rejected') throw localResult.reason;
}

export async function unsubscribeMobilePushLocally(): Promise<void> {
  savedEndpoint = '';
  cachedSubscription = null;
  if (browserSupportIssue()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
}

/** Remove private notification delivery before the local auth token is cleared. */
export async function removeMobilePushOnSignOut(): Promise<void> {
  try {
    await disableMobilePush();
  } catch {
    // Local unsubscribe is attempted even when the server is unreachable. The
    // next delivery receives 404/410 and prunes the server's stale endpoint.
  } finally {
    savedEndpoint = '';
  }
}
