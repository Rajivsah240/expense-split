import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Team, UserProfile } from '../types';

export function useTeams(user: UserProfile | null) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    if (!user) return;
    const result = await api<{ teams: Team[] }>('teams');
    setTeams(result.teams);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadTeams().catch(error => console.warn('Could not load teams:', error)).finally(() => setLoading(false));
  }, [user, loadTeams]);

  const createTeam = async (name: string) => {
    const { team } = await api<{ team: Team }>('teams', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    setTeams(current => [team, ...current]);
  };

  const addMemberToTeam = async (teamId: string, username: string) => {
    const { team } = await api<{ team: Team }>(`teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ username })
    });
    setTeams(current => current.map(item => item.id === teamId ? team : item));
  };

  const removeMemberFromTeam = async (teamId: string, memberId: string) => {
    const { team } = await api<{ team: Team }>(`teams/${teamId}/members/${memberId}`, { method: 'DELETE' });
    setTeams(current => current.map(item => item.id === teamId ? team : item));
  };

  return { teams, loading, createTeam, addMemberToTeam, removeMemberFromTeam };
}
