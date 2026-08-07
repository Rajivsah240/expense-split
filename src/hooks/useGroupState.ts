/**
 * Group data synchroniser.
 *
 * One endpoint (`groups/:id/state`) is polled with a `since` watermark: the first
 * call returns a snapshot, every later call returns only what changed plus
 * tombstones for deletions. Polling is paused while the tab is hidden and
 * resumed immediately on focus, so a phone coming out of your pocket is up to
 * date before you can read the screen.
 *
 * Vercel runs this API on serverless functions where a long-lived socket has
 * nowhere to live, so short-interval delta polling is the honest choice here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Activity,
  AppNotification,
  Group,
  GroupState,
  MemberBalance,
  Session,
  Settlement,
  Transfer,
} from '@shared/types';
import { api, ApiError } from '../lib/api';

const POLL_INTERVAL_MS = 7000;
/** Overlap the watermark slightly so a write racing the response is never missed. */
const WATERMARK_SLACK_MS = 2500;

export interface GroupData {
  group: Group | null;
  balances: MemberBalance[];
  transfers: Transfer[];
  totals: GroupState['totals'];
  sessions: Session[];
  settlements: Settlement[];
  activities: Activity[];
  notifications: AppNotification[];
  unreadCount: number;
}

const EMPTY_TOTALS: GroupState['totals'] = {
  groupTotal: 0,
  monthTotal: 0,
  sessionCount: 0,
  itemCount: 0,
  settlementCount: 0,
  firstSessionAt: null,
  lastSessionAt: null,
};

const EMPTY: GroupData = {
  group: null,
  balances: [],
  transfers: [],
  totals: EMPTY_TOTALS,
  sessions: [],
  settlements: [],
  activities: [],
  notifications: [],
  unreadCount: 0,
};

const bySessionOrder = (a: Session, b: Session) => b.date - a.date || b.createdAt - a.createdAt;

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  removed: string[],
  sort?: (a: T, b: T) => number
): T[] {
  if (!incoming.length && !removed.length) return existing;
  const byId = new Map(existing.map(entry => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  for (const id of removed) byId.delete(id);
  const merged = [...byId.values()];
  return sort ? merged.sort(sort) : merged;
}

export function useGroupState(groupId: string | null) {
  const [data, setData] = useState<GroupData>(EMPTY);
  const [loading, setLoading] = useState(Boolean(groupId));
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  /** Bumped on every change so dependent views (search results) can refetch. */
  const [revision, setRevision] = useState(0);

  const watermark = useRef(0);
  const inFlight = useRef(false);
  const activeGroup = useRef<string | null>(groupId);

  useEffect(() => {
    activeGroup.current = groupId;
    watermark.current = 0;
    setData(EMPTY);
    setError('');
    setOffline(false);
    setLoading(Boolean(groupId));
  }, [groupId]);

  const sync = useCallback(async () => {
    if (!groupId || inFlight.current) return;
    inFlight.current = true;
    try {
      const state = await api<GroupState>(`groups/${groupId}/state`, {
        query: { since: watermark.current },
      });
      // A group switch during the request would otherwise write stale data.
      if (activeGroup.current !== groupId) return;

      watermark.current = Math.max(0, state.now - WATERMARK_SLACK_MS);

      setData(previous => {
        const sessions = state.full
          ? state.sessions
          : mergeById(previous.sessions, state.sessions, state.removed.sessions, bySessionOrder);
        const settlements = state.full
          ? state.settlements
          : mergeById(
              previous.settlements,
              state.settlements,
              state.removed.settlements,
              (a, b) => b.createdAt - a.createdAt
            );
        const activities = state.full
          ? state.activities
          : mergeById(previous.activities, state.activities, [], (a, b) => b.createdAt - a.createdAt).slice(0, 200);
        const notifications = state.full
          ? state.notifications
          : mergeById(previous.notifications, state.notifications, [], (a, b) => b.createdAt - a.createdAt).slice(0, 100);

        return {
          group: state.group,
          balances: state.balances,
          transfers: state.transfers,
          totals: state.totals,
          sessions: state.full ? [...sessions].sort(bySessionOrder) : sessions,
          settlements,
          activities,
          notifications,
          unreadCount: state.unreadCount,
        };
      });

      const changed =
        state.full ||
        state.sessions.length > 0 ||
        state.settlements.length > 0 ||
        state.removed.sessions.length > 0 ||
        state.removed.settlements.length > 0;
      if (changed) setRevision(current => current + 1);

      setError('');
      setOffline(false);
    } catch (caught) {
      if (activeGroup.current !== groupId) return;
      const isNetwork = caught instanceof ApiError && caught.status === 0;
      if (isNetwork) {
        setOffline(true);
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not load this group.');
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    void sync();

    let timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, POLL_INTERVAL_MS);

    const syncNow = () => {
      if (document.visibilityState === 'visible') void sync();
    };

    document.addEventListener('visibilitychange', syncNow);
    window.addEventListener('focus', syncNow);
    window.addEventListener('online', syncNow);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncNow);
      window.removeEventListener('focus', syncNow);
      window.removeEventListener('online', syncNow);
      timer = 0;
    };
  }, [groupId, sync]);

  /** Apply a server response straight away, then let the next poll reconcile. */
  const applySession = useCallback((session: Session) => {
    // Private expenses intentionally never enter group state. Bump the revision
    // so the owner's History/Insights refetches without exposing it on Home.
    if (session.visibility === 'private') {
      setRevision(current => current + 1);
      return;
    }
    setData(previous => ({
      ...previous,
      sessions: mergeById(previous.sessions, [session], [], bySessionOrder),
    }));
    setRevision(current => current + 1);
  }, []);

  const dropSession = useCallback((sessionId: string) => {
    setData(previous => ({
      ...previous,
      sessions: previous.sessions.filter(session => session.id !== sessionId),
    }));
    setRevision(current => current + 1);
  }, []);

  const markNotificationsRead = useCallback(async (ids?: string[]) => {
    const body = ids?.length ? { ids } : { all: true };
    const result = await api<{ unreadCount: number }>('notifications/read', { method: 'POST', body });
    setData(previous => ({
      ...previous,
      unreadCount: result.unreadCount,
      notifications: previous.notifications.map(notification =>
        !ids || ids.includes(notification.id) ? { ...notification, read: true } : notification
      ),
    }));
  }, []);

  const clearNotifications = useCallback(async () => {
    await api('notifications', { method: 'DELETE' });
    setData(previous => ({ ...previous, notifications: [], unreadCount: 0 }));
  }, []);

  const members = useMemo(() => data.group?.members ?? [], [data.group]);

  const nameOf = useCallback(
    (userId: string) => members.find(member => member.userId === userId)?.displayName || 'Member',
    [members]
  );

  return {
    ...data,
    members,
    nameOf,
    loading,
    error,
    offline,
    revision,
    sync,
    applySession,
    dropSession,
    markNotificationsRead,
    clearNotifications,
  };
}

export type GroupStateApi = ReturnType<typeof useGroupState>;
