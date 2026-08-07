import { useCallback, useEffect, useState } from 'react';
import type { Me, NotificationPrefs } from '@shared/types';
import {
  api,
  clearPrivateApiCache,
  clearToken,
  getToken,
  setToken,
  setUnauthorizedHandler,
} from '../lib/api';
import { unsubscribeMobilePushLocally } from '../lib/push';

export interface AuthState {
  me: Me | null;
  loading: boolean;
}

export function useAuth() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const signOut = useCallback(() => {
    clearToken();
    void clearPrivateApiCache();
    setMe(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      void clearPrivateApiCache();
      void unsubscribeMobilePushLocally();
    });
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api<{ user: Me }>('me')
      .then(result => {
        if (!cancelled) setMe(result.user);
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          void clearPrivateApiCache();
          void unsubscribeMobilePushLocally();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestOtp = useCallback(async (email: string) => {
    await api('auth/request-otp', { method: 'POST', body: { email } });
  }, []);

  const verifyOtp = useCallback(async (email: string, code: string) => {
    const result = await api<{ token: string; user: Me }>('auth/verify-otp', {
      method: 'POST',
      body: { email, code },
    });
    await clearPrivateApiCache();
    setToken(result.token);
    setMe(result.user);
    return result.user;
  }, []);

  const saveProfile = useCallback(
    async (patch: { displayName?: string; username?: string; notificationPrefs?: Partial<NotificationPrefs> }) => {
      const result = await api<{ user: Me }>('me', { method: 'PATCH', body: patch });
      setMe(result.user);
      return result.user;
    },
    []
  );

  const checkUsername = useCallback(async (username: string) => {
    return api<{ available: boolean; reason: string }>('me/username-available', { query: { username } });
  }, []);

  return { me, loading, requestOtp, verifyOtp, saveProfile, checkUsername, signOut };
}
