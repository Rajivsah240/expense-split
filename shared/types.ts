/**
 * Single source of truth for data shapes, shared by the browser and the server.
 *
 * All monetary values are integer paise (1 rupee = 100 paise). Storing money as
 * integers is what makes every split, balance and settlement exact — see money.ts.
 */

export type Paise = number;

export const CATEGORIES = [
  'Vegetables',
  'Dairy',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care',
  'Cleaning',
  'Miscellaneous',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Member {
  userId: string;
  displayName: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface NotificationPrefs {
  sessionCreated: boolean;
  sessionEdited: boolean;
  sessionDeleted: boolean;
  settlementRecorded: boolean;
  memberChanged: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  sessionCreated: true,
  sessionEdited: true,
  sessionDeleted: true,
  settlementRecorded: true,
  memberChanged: true,
};

export interface Me {
  userId: string;
  email: string;
  displayName: string;
  username: string;
  profileComplete: boolean;
  notificationPrefs: NotificationPrefs;
  createdAt: number;
}

export interface GroupSettings {
  /**
   * When an input line names no owners ("Milk - 60"), assume every member shares
   * it. The parsed row is still shown with an "assumed" chip and nothing is
   * written until the user saves, so this is a default, never a silent guess.
   */
  assumeSharedWhenUnspecified: boolean;
  currency: string;
}

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  assumeSharedWhenUnspecified: true,
  currency: '₹',
};

export interface Group {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  inviteCode: string;
  settings: GroupSettings;
  members: Member[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionItem {
  id: string;
  name: string;
  amount: Paise;
  owners: string[];
  /** owner userId -> exact share in paise. Always sums to `amount`. */
  shares: Record<string, Paise>;
  category: Category;
}

export type SessionSource = 'manual' | 'text' | 'receipt' | 'whatsapp';

export interface Session {
  id: string;
  groupId: string;
  /** Midnight-anchored timestamp of the shopping date. */
  date: number;
  shop: string;
  notes: string;
  paidBy: string;
  /** Display name captured at creation time so history reads as it did then. */
  paidByName: string;
  createdBy: string;
  createdByName: string;
  items: SessionItem[];
  total: Paise;
  /** userId -> total owed across all items in this session. Sums to `total`. */
  shares: Record<string, Paise>;
  source: SessionSource;
  createdAt: number;
  updatedAt: number;
}

export interface Settlement {
  id: string;
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
}

export type ActivityType =
  | 'group.created'
  | 'group.renamed'
  | 'member.joined'
  | 'member.added'
  | 'member.removed'
  | 'member.left'
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'settlement.created'
  | 'settlement.deleted';

export interface Activity {
  id: string;
  groupId: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  /** Pre-rendered audit line, e.g. "Rajiv created a session at Reliance Fresh". */
  summary: string;
  /** Field-level changes for edits, e.g. ["Butter ₹40 → ₹45"]. */
  changes: string[];
  targetId: string;
  amount: Paise;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  groupId: string;
  groupName: string;
  type: ActivityType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: Paise;
}

/** Per-member ledger position. `net` > 0 means the member is owed money. */
export interface MemberBalance {
  userId: string;
  paid: Paise;
  owed: Paise;
  settledOut: Paise;
  settledIn: Paise;
  net: Paise;
}

export interface GroupState {
  now: number;
  group: Group;
  balances: MemberBalance[];
  /** Direct, per-person balances that preserve who paid each expense. */
  directTransfers: Transfer[];
  /** Minimum-payment plan that may consolidate direct balances across members. */
  transfers: Transfer[];
  totals: {
    groupTotal: Paise;
    /** Current calendar month, bucketed server-side in the group's timezone. */
    monthTotal: Paise;
    sessionCount: number;
    itemCount: number;
    settlementCount: number;
    firstSessionAt: number | null;
    lastSessionAt: number | null;
  };
  sessions: Session[];
  settlements: Settlement[];
  activities: Activity[];
  notifications: AppNotification[];
  unreadCount: number;
  removed: { sessions: string[]; settlements: string[] };
  /** True when the payload is a full snapshot rather than a delta. */
  full: boolean;
}

export interface StatsBucket {
  key: string;
  label: string;
  value: Paise;
}

export interface GroupStats {
  monthly: StatsBucket[];
  byMember: StatsBucket[];
  byCategory: StatsBucket[];
  personalByMember: StatsBucket[];
  topItems: { name: string; count: number; total: Paise }[];
  sharedVsPersonal: { shared: Paise; personal: Paise };
  contributionByMember: { userId: string; monthly: StatsBucket[] }[];
  frequency: { sessionsPerWeek: number; activeDays: number; busiestWeekday: string };
}

/** A row in the review table shown before anything is written. */
export interface DraftItem {
  id: string;
  name: string;
  /** Kept as text while editing so the field can be empty mid-typing. */
  amount: string;
  owners: string[];
  category: Category;
  /** Owners were defaulted rather than stated. Editable, saveable. */
  assumed: boolean;
  /** Owners could not be resolved. Blocks saving until the user picks. */
  needsOwners: boolean;
  reason: string;
}

export interface DraftSession {
  date: string;
  shop: string;
  notes: string;
  paidBy: string;
  items: DraftItem[];
  source: SessionSource;
  usedAi: boolean;
}
