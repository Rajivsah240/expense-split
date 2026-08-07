import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { HttpError } from '../server/http.js';
import { readPushSubscription } from '../server/routes/push.js';

let passed = 0;

function check(label: string, assertion: () => void) {
  assertion();
  passed += 1;
  console.log(`  OK  ${label}`);
}

function rejectsSubscription(label: string, endpoint: string) {
  check(label, () => {
    assert.throws(
      () =>
        readPushSubscription({
          endpoint,
          keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
        }),
      error => error instanceof HttpError && error.status === 400
    );
  });
}

console.log('\n-- Web Push validation --');

for (const hostname of [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'wns2-db5p.notify.windows.com',
]) {
  check(`accepts ${hostname}`, () => {
    const parsed = readPushSubscription({
      endpoint: `https://${hostname}/push/capability-token`,
      expirationTime: null,
      keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
    });
    assert.equal(parsed.endpoint, `https://${hostname}/push/capability-token`);
    assert.equal(parsed.expirationTime, null);
  });
}

rejectsSubscription('rejects non-HTTPS endpoints', 'http://fcm.googleapis.com/push/token');
rejectsSubscription('rejects private-network endpoints', 'https://127.0.0.1/push/token');
rejectsSubscription('rejects trusted-host suffix tricks', 'https://fcm.googleapis.com.attacker.example/push/token');
rejectsSubscription('rejects credential-based host tricks', 'https://fcm.googleapis.com@127.0.0.1/push/token');

check('rejects malformed encryption keys', () => {
  assert.throws(
    () =>
      readPushSubscription({
        endpoint: 'https://fcm.googleapis.com/push/token',
        keys: { p256dh: 'not+base64url', auth: 'short' },
      }),
    error => error instanceof HttpError && error.status === 400
  );
});

console.log('\n-- Service worker notification behavior --');

type WorkerEvent = {
  data?: { json: () => unknown; text: () => string };
  notification?: { data?: { url?: string }; close: () => void };
  waitUntil: (promise: Promise<unknown>) => void;
};

const listeners = new Map<string, (event: WorkerEvent) => void>();
const shown: { title: string; options: Record<string, unknown> }[] = [];
let navigatedTo = '';
let focused = false;
let openedUrl = '';

const windowClient = {
  url: 'https://expense.test/',
  async navigate(url: string) {
    navigatedTo = url;
    return this;
  },
  async focus() {
    focused = true;
    return this;
  },
};

const worker = {
  location: { origin: 'https://expense.test' },
  addEventListener(type: string, listener: (event: WorkerEvent) => void) {
    listeners.set(type, listener);
  },
  registration: {
    async showNotification(title: string, options: Record<string, unknown>) {
      shown.push({ title, options });
    },
  },
  clients: {
    async matchAll() {
      return [windowClient];
    },
    async openWindow(url: string) {
      openedUrl = url;
      return null;
    },
  },
};

const source = await readFile(new URL('../public/push-sw.js', import.meta.url), 'utf8');
vm.runInNewContext(source, { self: worker, URL, Date }, { filename: 'push-sw.js' });

const pushPromises: Promise<unknown>[] = [];
listeners.get('push')!({
  data: {
    json: () => ({
      title: 'New expense',
      body: 'Rajiv added groceries',
      groupName: 'Flat 302',
      notificationId: '507f1f77bcf86cd799439011',
      createdAt: 1_700_000_000_000,
      url: '/?group=507f1f77bcf86cd799439012&notification=507f1f77bcf86cd799439011',
    }),
    text: () => '',
  },
  waitUntil: promise => pushPromises.push(promise),
});
await Promise.all(pushPromises);

check('push displays a tagged OS notification', () => {
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, 'New expense');
  assert.equal(shown[0].options.body, 'Flat 302: Rajiv added groceries');
  assert.equal(shown[0].options.tag, 'expense-split:507f1f77bcf86cd799439011');
  assert.equal(shown[0].options.icon, '/icons/icon-192.png');
});

const clickPromises: Promise<unknown>[] = [];
let closed = false;
listeners.get('notificationclick')!({
  notification: {
    data: { url: '/?group=507f1f77bcf86cd799439012&notification=507f1f77bcf86cd799439011' },
    close: () => {
      closed = true;
    },
  },
  waitUntil: promise => clickPromises.push(promise),
});
await Promise.all(clickPromises);

check('click closes, navigates, and focuses the existing app', () => {
  assert.equal(closed, true);
  assert.equal(
    navigatedTo,
    'https://expense.test/?group=507f1f77bcf86cd799439012&notification=507f1f77bcf86cd799439011'
  );
  assert.equal(focused, true);
  assert.equal(openedUrl, '');
});

console.log(`\n${passed} Web Push checks passed\n`);
