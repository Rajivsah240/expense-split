import { useCallback, useEffect, useState } from 'react';
import type { Group, Paise } from '@shared/types';
import { api } from '../lib/api';

export interface GroupListEntry extends Group {
  summary: { groupTotal: Paise; sessionCount: number; lastSessionAt: number | null };
}

const LAST_GROUP_KEY = 'expense_split_last_group';

export const rememberGroup = (groupId: string | null) => {
  try {
    if (groupId) localStorage.setItem(LAST_GROUP_KEY, groupId);
    else localStorage.removeItem(LAST_GROUP_KEY);
  } catch {
    /* ignore */
  }
};

export const recallGroup = (): string | null => {
  try {
    return localStorage.getItem(LAST_GROUP_KEY);
  } catch {
    return null;
  }
};

export function useGroups(enabled: boolean) {
  const [groups, setGroups] = useState<GroupListEntry[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  /**
   * True only once a fetch has actually completed. `loading` alone is not enough
   * to gate on: it is still false during the render where `enabled` flips true,
   * so anything waiting on "loading === false" would run against an empty list.
   */
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await api<{ groups: GroupListEntry[] }>('groups');
      setGroups(result.groups);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your groups.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setGroups([]);
      setLoading(false);
      setLoaded(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [enabled, refresh]);

  const createGroup = useCallback(
    async (name: string, emoji: string) => {
      const result = await api<{ group: Group }>('groups', { method: 'POST', body: { name, emoji } });
      await refresh();
      return result.group;
    },
    [refresh]
  );

  const joinGroup = useCallback(
    async (code: string) => {
      const result = await api<{ group: Group; alreadyMember?: boolean }>('groups/join', {
        method: 'POST',
        body: { code },
      });
      await refresh();
      return result;
    },
    [refresh]
  );

  return { groups, loading, loaded, error, refresh, createGroup, joinGroup };
}
