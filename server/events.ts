/**
 * Audit trail + notification fan-out.
 *
 * Every mutation calls recordActivity exactly once. The activity row is the
 * permanent audit line; notifications are per-member copies filtered by each
 * member's own preferences.
 */

import { DEFAULT_NOTIFICATION_PREFS, type ActivityType, type Paise } from '../shared/types.js';
import { ActivityModel, NotificationModel, User, type GroupDoc } from './models.js';

const PREF_FOR_TYPE: Record<ActivityType, keyof typeof DEFAULT_NOTIFICATION_PREFS> = {
  'group.created': 'memberChanged',
  'group.renamed': 'memberChanged',
  'member.joined': 'memberChanged',
  'member.added': 'memberChanged',
  'member.removed': 'memberChanged',
  'member.left': 'memberChanged',
  'session.created': 'sessionCreated',
  'session.updated': 'sessionEdited',
  'session.deleted': 'sessionDeleted',
  'settlement.created': 'settlementRecorded',
  'settlement.deleted': 'settlementRecorded',
};

export interface RecordActivityInput {
  group: GroupDoc;
  actorId: string;
  actorName: string;
  type: ActivityType;
  summary: string;
  changes?: string[];
  targetId?: string;
  amount?: Paise;
  notification?: { title: string; body: string };
  /** Extra recipients outside the member list, e.g. a member who was just removed. */
  alsoNotify?: string[];
}

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const groupId = input.group._id.toString();
  const createdAt = Date.now();

  await ActivityModel.create({
    groupId,
    actorId: input.actorId,
    actorName: input.actorName,
    type: input.type,
    summary: input.summary,
    changes: (input.changes ?? []).slice(0, 25),
    targetId: input.targetId ?? '',
    amount: input.amount ?? 0,
    createdAt,
  });

  if (!input.notification) return;

  const recipients = new Set<string>([
    ...(input.group.memberIds ?? []),
    ...(input.alsoNotify ?? []),
  ]);
  recipients.delete(input.actorId);
  if (recipients.size === 0) return;

  const prefKey = PREF_FOR_TYPE[input.type];
  const users = await User.find({ _id: { $in: [...recipients] } }).select('notificationPrefs');

  const documents = users
    .filter(user => {
      const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(user.notificationPrefs ?? {}) };
      return prefs[prefKey] !== false;
    })
    .map(user => ({
      userId: user._id.toString(),
      groupId,
      groupName: input.group.name,
      type: input.type,
      title: input.notification!.title,
      body: input.notification!.body,
      read: false,
      createdAt,
    }));

  if (documents.length) await NotificationModel.insertMany(documents, { ordered: false });
}
