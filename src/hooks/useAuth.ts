import { useEffect, useState } from 'react';
import { api, ApiError, clearAccessToken, getAccessToken, setAccessToken } from '../lib/api';
import { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }

    api<{ user: UserProfile }>('auth/me')
      .then(({ user }) => setUser(user))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) clearAccessToken();
        console.warn('Could not restore the signed-in session:', error);
      })
      .finally(() => setLoading(false));
  }, []);

  const requestOtp = async (email: string) => {
    await api('auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  };

  const verifyOtp = async (email: string, otp: string) => {
    const result = await api<{ token: string; user: UserProfile }>('auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });
    setAccessToken(result.token);
    setUser(result.user);
  };

  const logout = async () => {
    clearAccessToken();
    setUser(null);
  };

  const updateUsername = async (username: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await api<{ user: UserProfile }>('auth/username', {
        method: 'PATCH',
        body: JSON.stringify({ username })
      });
      setUser(result.user);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unable to update username.' };
    }
  };

  const updateProfile = async (data: { displayName?: string; username?: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await api<{ user: UserProfile }>('auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
      setUser(result.user);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unable to update profile.' };
    }
  };

  return { user, loading, requestOtp, verifyOtp, logout, updateUsername, updateProfile };
}
