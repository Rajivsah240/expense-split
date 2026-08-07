import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import {
  CATEGORIES,
  DEFAULT_GROUP_SETTINGS,
  DEFAULT_NOTIFICATION_PREFS,
  type ActivityType,
  type Category,
  type Paise,
  type SessionSource,
} from '../shared/types.js';

/**
 * Documents keep money as integer paise and timestamps as epoch milliseconds so
 * the wire format needs no conversion and stays comparable for delta sync.
 */

export interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  displayName: string;
  username?: string;
  usernameLower?: string;
  profileComplete: boolean;
  notificationPrefs: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface MemberDoc {
  userId: string;
  displayName: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface GroupDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  emoji: string;
  ownerId: string;
  inviteCode: string;
  settings: { assumeSharedWhenUnspecified: boolean; currency: string };
  members: MemberDoc[];
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SessionItemDoc {
  id: string;
  name: string;
  amount: Paise;
  owners: string[];
  shares: Record<string, Paise>;
  category: Category;
}

export interface SessionDoc {
  _id: mongoose.Types.ObjectId;
  groupId: string;
  date: number;
  shop: string;
  notes: string;
  paidBy: string;
  paidByName: string;
  createdBy: string;
  createdByName: string;
  items: SessionItemDoc[];
  total: Paise;
  shares: Record<string, Paise>;
  source: SessionSource;
  visibility: 'group' | 'private';
  privateTo: string | null;
  /** Lowercased item names + shop + notes, for fast substring search. */
  searchText: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SettlementDoc {
  _id: mongoose.Types.ObjectId;
  groupId: string;
  fromUser: string;
  fromName: string;
  toUser: string;
  toName: string;
  amount: Paise;
  note: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface ActivityDoc {
  _id: mongoose.Types.ObjectId;
  groupId: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  summary: string;
  changes: string[];
  targetId: string;
  amount: Paise;
  createdAt: number;
}

export interface NotificationDoc {
  _id: mongoose.Types.ObjectId;
  userId: string;
  groupId: string;
  groupName: string;
  type: ActivityType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export interface PushSubscriptionDoc {
  _id: mongoose.Types.ObjectId;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface OtpDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  codeHash: string;
  expiresAt: Date;
  lastSentAt: Date;
  attempts: number;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, default: '', trim: true, maxlength: 50 },
    // Sparse so accounts created before onboarding don't collide on an empty value.
    username: { type: String, trim: true, maxlength: 20 },
    usernameLower: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    profileComplete: { type: Boolean, default: false },
    notificationPrefs: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_NOTIFICATION_PREFS }) },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const otpSchema = new Schema<OtpDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const memberSchema = new Schema<MemberDoc>(
  {
    userId: { type: String, required: true },
    displayName: { type: String, default: '' },
    username: { type: String, default: '' },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    joinedAt: { type: Number, default: () => Date.now() },
  },
  { _id: false }
);

const groupSchema = new Schema<GroupDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    emoji: { type: String, default: '🏠' },
    ownerId: { type: String, required: true },
    inviteCode: { type: String, required: true, unique: true },
    settings: {
      assumeSharedWhenUnspecified: {
        type: Boolean,
        default: DEFAULT_GROUP_SETTINGS.assumeSharedWhenUnspecified,
      },
      currency: { type: String, default: DEFAULT_GROUP_SETTINGS.currency },
    },
    members: { type: [memberSchema], default: [] },
    memberIds: { type: [String], default: [], index: true },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
    deletedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

const sessionItemSchema = new Schema<SessionItemDoc>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true },
    owners: { type: [String], default: [] },
    shares: { type: Schema.Types.Mixed, default: () => ({}) },
    category: { type: String, enum: CATEGORIES, default: 'Miscellaneous' },
  },
  { _id: false }
);

const sessionSchema = new Schema<SessionDoc>(
  {
    groupId: { type: String, required: true },
    date: { type: Number, required: true },
    shop: { type: String, default: '', trim: true, maxlength: 80 },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    paidBy: { type: String, required: true },
    paidByName: { type: String, default: '' },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' },
    items: { type: [sessionItemSchema], default: [] },
    total: { type: Number, required: true },
    shares: { type: Schema.Types.Mixed, default: () => ({}) },
    source: { type: String, enum: ['manual', 'text', 'receipt', 'whatsapp'], default: 'manual' },
    visibility: { type: String, enum: ['group', 'private'], default: 'group' },
    privateTo: { type: String, default: null },
    searchText: { type: String, default: '' },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
    deletedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

// Delta sync reads by (groupId, updatedAt); history reads by (groupId, date).
sessionSchema.index({ groupId: 1, updatedAt: -1 });
sessionSchema.index({ groupId: 1, date: -1, createdAt: -1 });
sessionSchema.index({ groupId: 1, deletedAt: 1, date: -1 });
sessionSchema.index({ groupId: 1, visibility: 1, privateTo: 1, deletedAt: 1, date: -1, createdAt: -1 });

const settlementSchema = new Schema<SettlementDoc>(
  {
    groupId: { type: String, required: true },
    fromUser: { type: String, required: true },
    fromName: { type: String, default: '' },
    toUser: { type: String, required: true },
    toName: { type: String, default: '' },
    amount: { type: Number, required: true },
    note: { type: String, default: '', maxlength: 300 },
    recordedBy: { type: String, required: true },
    recordedByName: { type: String, default: '' },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
    deletedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

settlementSchema.index({ groupId: 1, updatedAt: -1 });
settlementSchema.index({ groupId: 1, createdAt: -1 });

const activitySchema = new Schema<ActivityDoc>(
  {
    groupId: { type: String, required: true },
    actorId: { type: String, required: true },
    actorName: { type: String, default: '' },
    type: { type: String, required: true },
    summary: { type: String, default: '' },
    changes: { type: [String], default: [] },
    targetId: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

activitySchema.index({ groupId: 1, createdAt: -1 });

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: String, required: true },
    groupId: { type: String, required: true },
    groupName: { type: String, default: '' },
    type: { type: String, required: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

const pushSubscriptionKeysSchema = new Schema<PushSubscriptionDoc['keys']>(
  {
    p256dh: { type: String, required: true, maxlength: 256 },
    auth: { type: String, required: true, maxlength: 128 },
  },
  { _id: false }
);

const pushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    userId: { type: String, required: true },
    // The endpoint and keys are bearer capabilities. They are never returned
    // by a read API or written to logs.
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: { type: pushSubscriptionKeysSchema, required: true },
    expirationTime: { type: Number, default: null },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

pushSubscriptionSchema.index({ userId: 1, updatedAt: -1 });

const registry = mongoose.models as Record<string, Model<any>>;

export const User = (registry.User || mongoose.model<UserDoc>('User', userSchema)) as Model<UserDoc>;
export const Otp = (registry.Otp || mongoose.model<OtpDoc>('Otp', otpSchema)) as Model<OtpDoc>;
export const Group = (registry.Group || mongoose.model<GroupDoc>('Group', groupSchema)) as Model<GroupDoc>;
export const SessionModel = (registry.Session ||
  mongoose.model<SessionDoc>('Session', sessionSchema)) as Model<SessionDoc>;
export const SettlementModel = (registry.Settlement ||
  mongoose.model<SettlementDoc>('Settlement', settlementSchema)) as Model<SettlementDoc>;
export const ActivityModel = (registry.Activity ||
  mongoose.model<ActivityDoc>('Activity', activitySchema)) as Model<ActivityDoc>;
export const NotificationModel = (registry.Notification ||
  mongoose.model<NotificationDoc>('Notification', notificationSchema)) as Model<NotificationDoc>;
export const PushSubscriptionModel = (registry.PushSubscription ||
  mongoose.model<PushSubscriptionDoc>('PushSubscription', pushSubscriptionSchema)) as Model<PushSubscriptionDoc>;

/** Live documents (with .save(), .toObject()) as opposed to the plain shapes above. */
export type GroupDocument = HydratedDocument<GroupDoc>;
export type SessionDocument = HydratedDocument<SessionDoc>;
export type SettlementDocument = HydratedDocument<SettlementDoc>;
export type UserDocument = HydratedDocument<UserDoc>;
