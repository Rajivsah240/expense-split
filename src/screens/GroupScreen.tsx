/**
 * The group shell: sticky app bar, bottom tab navigation with a raised Add
 * button in the middle, and the sheets that every tab can open.
 *
 * Navigation is a bottom bar rather than a drawer because this is a phone-first
 * app — the five things you do live under your thumb.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Bell,
  ChevronLeft,
  CloudOff,
  Home,
  MoreHorizontal,
  Plus,
  Receipt,
} from 'lucide-react';
import type { Me, NotificationPrefs, Session } from '@shared/types';
import { AddSheet } from '../components/AddSheet';
import { NotificationsSheet } from '../components/NotificationsSheet';
import { SessionSheet } from '../components/SessionSheet';
import { SettleSheet } from '../components/SettleSheet';
import { WhatsappImportSheet } from '../components/WhatsappImportSheet';
import { Spinner } from '../components/ui';
import { useGroupState } from '../hooks/useGroupState';
import { HistoryTab } from './HistoryTab';
import { HomeTab } from './HomeTab';
import { MoreTab } from './MoreTab';
import { StatsTab } from './StatsTab';

type Tab = 'home' | 'history' | 'stats' | 'more';

const TABS: { value: Tab; label: string; icon: typeof Home }[] = [
  { value: 'home', label: 'Home', icon: Home },
  { value: 'history', label: 'History', icon: Receipt },
  { value: 'stats', label: 'Insights', icon: BarChart3 },
  { value: 'more', label: 'More', icon: MoreHorizontal },
];

interface GroupScreenProps {
  me: Me;
  groupId: string;
  onBack: () => void;
  onSaveProfile: (patch: {
    displayName?: string;
    username?: string;
    notificationPrefs?: Partial<NotificationPrefs>;
  }) => Promise<unknown>;
  onCheckUsername: (username: string) => Promise<{ available: boolean; reason: string }>;
  onSignOut: () => void;
  /** Set by the manifest shortcut (?action=add) to open the add flow on launch. */
  initialAction?: 'add' | 'balances' | null;
  onActionHandled: () => void;
  /** Set when the app was opened by tapping a native notification. */
  initialNotificationId?: string | null;
  onNotificationHandled: () => void;
}

export function GroupScreen({
  me,
  groupId,
  onBack,
  onSaveProfile,
  onCheckUsername,
  onSignOut,
  initialAction,
  onActionHandled,
  initialNotificationId,
  onNotificationHandled,
}: GroupScreenProps) {
  const state = useGroupState(groupId);
  const [tab, setTab] = useState<Tab>('home');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const markingNotification = useRef<string | null>(null);

  useEffect(() => {
    if (!initialAction || !state.group) return;
    if (initialAction === 'add') setAdding(true);
    if (initialAction === 'balances') setSettling(true);
    onActionHandled();
  }, [initialAction, state.group, onActionHandled]);

  useEffect(() => {
    if (!initialNotificationId || !state.group || markingNotification.current === initialNotificationId) return;
    markingNotification.current = initialNotificationId;
    void state
      .markNotificationsRead([initialNotificationId])
      .then(onNotificationHandled)
      .catch(() => {
        markingNotification.current = null;
      });
  }, [initialNotificationId, state.group, state.markNotificationsRead, onNotificationHandled]);

  // Keep the open session sheet in step with incoming sync updates.
  useEffect(() => {
    if (!openSession) return;
    const fresh = state.sessions.find(session => session.id === openSession.id);
    if (fresh && fresh.updatedAt !== openSession.updatedAt) setOpenSession(fresh);
  }, [state.sessions, openSession]);

  if (state.loading && !state.group) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!state.group) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[15px] font-semibold text-ink">{state.error || 'This group is unavailable.'}</p>
        <button type="button" onClick={onBack} className="text-[13.5px] font-bold text-brand">
          Back to your groups
        </button>
      </div>
    );
  }

  const group = state.group;

  return (
    <div className="min-h-dvh">
      <header className="bar-blur sticky top-0 z-30 border-b border-line pt-safe">
        <div className="shell flex h-14 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to your groups"
            className="tap -ml-2 shrink-0 rounded-xl text-muted active:bg-surface-2"
          >
            <ChevronLeft className="size-[22px]" />
          </button>

          <span className="shrink-0 text-[19px]" aria-hidden>
            {group.emoji}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15.5px] font-extrabold leading-tight tracking-[-0.01em] text-ink">
              {group.name}
            </h1>
            <p className="truncate text-[11.5px] text-muted">
              {group.members.length} member{group.members.length === 1 ? '' : 's'}
              {state.offline && ' · offline'}
            </p>
          </div>

          {state.offline && (
            <span className="tap shrink-0 text-warn" title="Showing the last data received">
              <CloudOff className="size-[18px]" />
            </span>
          )}

          <button
            type="button"
            onClick={() => setNotifying(true)}
            aria-label={state.unreadCount > 0 ? `${state.unreadCount} unread notifications` : 'Notifications'}
            className="tap relative -mr-2 shrink-0 rounded-xl text-muted active:bg-surface-2"
          >
            <Bell className="size-[20px]" />
            {state.unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex min-w-[17px] items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold leading-[16px] text-white">
                {state.unreadCount > 9 ? '9+' : state.unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="shell page-pad pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {tab === 'home' && (
              <HomeTab
                state={state}
                currentUserId={me.userId}
                onSettle={() => setSettling(true)}
              />
            )}
            {tab === 'history' && (
              <HistoryTab
                groupId={groupId}
                members={state.members}
                currentUserId={me.userId}
                revision={state.revision}
                onOpenSession={setOpenSession}
              />
            )}
            {tab === 'stats' && <StatsTab groupId={groupId} revision={state.revision} />}
            {tab === 'more' && (
              <MoreTab
                me={me}
                state={state}
                group={group}
                onSaveProfile={onSaveProfile}
                onCheckUsername={onCheckUsername}
                onSignOut={onSignOut}
                onLeftGroup={onBack}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation. The middle slot is the primary action, not a tab. */}
      <nav className="bar-blur fixed inset-x-0 bottom-0 z-30 border-t border-line pb-safe">
        <div className="shell flex h-[62px] items-stretch">
          {TABS.slice(0, 2).map(entry => (
            <TabButton key={entry.value} entry={entry} active={tab === entry.value} onClick={() => setTab(entry.value)} />
          ))}

          <div className="flex w-[76px] shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Add expenses"
              className="-mt-6 flex size-[56px] items-center justify-center rounded-full bg-brand text-white shadow-[var(--shadow-brand)] transition-transform active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </button>
          </div>

          {TABS.slice(2).map(entry => (
            <TabButton key={entry.value} entry={entry} active={tab === entry.value} onClick={() => setTab(entry.value)} />
          ))}
        </div>
      </nav>

      <AddSheet
        open={adding}
        onClose={() => setAdding(false)}
        group={group}
        members={state.members}
        currentUserId={me.userId}
        onSaved={session => {
          state.applySession(session);
          void state.sync();
        }}
        onOpenWhatsapp={() => setImporting(true)}
      />

      <WhatsappImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        group={group}
        members={state.members}
        currentUserId={me.userId}
        onImported={sessions => {
          sessions.forEach(state.applySession);
          void state.sync();
        }}
      />

      <SettleSheet
        open={settling}
        onClose={() => setSettling(false)}
        group={group}
        members={state.members}
        transfers={state.transfers}
        settlements={state.settlements}
        currentUserId={me.userId}
        onChanged={() => void state.sync()}
      />

      <NotificationsSheet
        open={notifying}
        onClose={() => setNotifying(false)}
        notifications={state.notifications}
        unreadCount={state.unreadCount}
        onMarkRead={state.markNotificationsRead}
        onClear={state.clearNotifications}
      />

      <SessionSheet
        session={openSession}
        group={group}
        members={state.members}
        currentUserId={me.userId}
        onClose={() => setOpenSession(null)}
        onUpdated={session => {
          state.applySession(session);
          setOpenSession(session);
          void state.sync();
        }}
        onDeleted={sessionId => {
          state.dropSession(sessionId);
          void state.sync();
        }}
      />
    </div>
  );
}

function TabButton({
  entry,
  active,
  onClick,
}: {
  entry: { value: Tab; label: string; icon: typeof Home };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
        active ? 'text-brand' : 'text-faint'
      }`}
    >
      <Icon className="size-[21px]" strokeWidth={active ? 2.5 : 2} />
      <span className={`text-[10.5px] ${active ? 'font-bold' : 'font-semibold'}`}>{entry.label}</span>
    </button>
  );
}
