/**
 * Document -> wire-format mappers. Every response goes through here so the
 * browser only ever sees the shapes declared in shared/types.ts.
 */

import {
  DEFAULT_GROUP_SETTINGS,
  type Activity,
  type AppNotification,
  type Group,
  type Session,
  type Settlement,
} from '../shared/types.js';
import type {
  ActivityDoc,
  GroupDoc,
  NotificationDoc,
  SessionDoc,
  SettlementDoc,
} from './models.js';

export function groupDto(doc: GroupDoc): Group {
  return {
    id: doc._id.toString(),
    name: doc.name,
    emoji: doc.emoji || '🏠',
    ownerId: doc.ownerId,
    inviteCode: doc.inviteCode,
    settings: { ...DEFAULT_GROUP_SETTINGS, ...(doc.settings ?? {}) },
    members: (doc.members ?? []).map(member => ({
      userId: member.userId,
      displayName: member.displayName || 'Member',
      username: member.username || '',
      role: member.role || 'member',
      joinedAt: member.joinedAt ?? doc.createdAt,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function sessionDto(doc: SessionDoc): Session {
  return {
    id: doc._id.toString(),
    groupId: doc.groupId,
    date: doc.date,
    shop: doc.shop || '',
    notes: doc.notes || '',
    paidBy: doc.paidBy,
    paidByName: doc.paidByName || '',
    createdBy: doc.createdBy,
    createdByName: doc.createdByName || '',
    items: (doc.items ?? []).map(item => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      owners: item.owners ?? [],
      shares: item.shares ?? {},
      category: item.category,
    })),
    total: doc.total,
    shares: doc.shares ?? {},
    source: doc.source || 'manual',
    visibility: doc.visibility === 'private' ? 'private' : 'group',
    privateTo: doc.visibility === 'private' ? doc.privateTo ?? doc.createdBy : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function settlementDto(doc: SettlementDoc): Settlement {
  return {
    id: doc._id.toString(),
    groupId: doc.groupId,
    fromUser: doc.fromUser,
    fromName: doc.fromName || '',
    toUser: doc.toUser,
    toName: doc.toName || '',
    amount: doc.amount,
    note: doc.note || '',
    recordedBy: doc.recordedBy,
    recordedByName: doc.recordedByName || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function activityDto(doc: ActivityDoc): Activity {
  return {
    id: doc._id.toString(),
    groupId: doc.groupId,
    actorId: doc.actorId,
    actorName: doc.actorName || 'Someone',
    type: doc.type,
    summary: doc.summary || '',
    changes: doc.changes ?? [],
    targetId: doc.targetId || '',
    amount: doc.amount ?? 0,
    createdAt: doc.createdAt,
  };
}

export function notificationDto(doc: NotificationDoc): AppNotification {
  return {
    id: doc._id.toString(),
    groupId: doc.groupId,
    groupName: doc.groupName || '',
    type: doc.type,
    title: doc.title || '',
    body: doc.body || '',
    read: Boolean(doc.read),
    createdAt: doc.createdAt,
  };
}
