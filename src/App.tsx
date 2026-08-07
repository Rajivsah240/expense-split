import { useCallback, useEffect, useState } from 'react';
import { AppMark } from './components/AppMark';
import { ConfirmProvider, Spinner, ToastProvider, useToast } from './components/ui';
import { useAuth } from './hooks/useAuth';
import { recallGroup, rememberGroup, useGroups } from './hooks/useGroups';
import { useServiceWorker } from './lib/pwa';
import { reconcileMobilePushSubscription, removeMobilePushOnSignOut } from './lib/push';
import { AuthScreen } from './screens/AuthScreen';
import { GroupScreen } from './screens/GroupScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';

type LaunchAction = 'add' | 'balances' | null;

interface LaunchIntent {
  action: LaunchAction;
  groupId: string | null;
  notificationId: string | null;
}

/** Read manifest shortcuts and notification-click deep links. */
function readLaunchIntent(): LaunchIntent {
  if (typeof window === 'undefined') return { action: null, groupId: null, notificationId: null };
  const search = new URLSearchParams(window.location.search);
  const actionValue = search.get('action');
  const groupValue = search.get('group') ?? '';
  const notificationValue = search.get('notification') ?? '';
  return {
    action: actionValue === 'add' || actionValue === 'balances' ? actionValue : null,
    groupId: /^[a-f\d]{24}$/i.test(groupValue) ? groupValue : null,
    notificationId: /^[a-f\d]{24}$/i.test(notificationValue) ? notificationValue : null,
  };
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppRoutes />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AppRoutes() {
  const toast = useToast();
  const { me, loading, requestOtp, verifyOtp, saveProfile, checkUsername, signOut } = useAuth();
  const signedIn = Boolean(me?.profileComplete);
  const groups = useGroups(signedIn);
  const { offlineReady, dismissOfflineReady } = useServiceWorker();
  const [launchIntent] = useState(readLaunchIntent);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [launchAction, setLaunchAction] = useState<LaunchAction>(launchIntent.action);
  const [launchNotificationId, setLaunchNotificationId] = useState<string | null>(launchIntent.notificationId);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!launchIntent.action && !launchIntent.groupId && !launchIntent.notificationId) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('action');
    url.searchParams.delete('group');
    url.searchParams.delete('notification');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [launchIntent]);

  useEffect(() => {
    if (offlineReady) {
      toast('Ready to work offline.', 'info');
      dismissOfflineReady();
    }
  }, [offlineReady, toast, dismissOfflineReady]);

  useEffect(() => {
    if (!signedIn) return;
    // Re-associate an already-approved device subscription after sign-in. This
    // never triggers the browser permission prompt.
    const reconcile = () => void reconcileMobilePushSubscription().catch(() => {});
    const reconcileWhenVisible = () => {
      if (document.visibilityState === 'visible') reconcile();
    };

    reconcile();
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcileWhenVisible);
    return () => {
      window.removeEventListener('focus', reconcile);
      document.removeEventListener('visibilitychange', reconcileWhenVisible);
    };
  }, [signedIn, me?.userId]);

  // Reopen whichever group you were last looking at — one less tap every launch.
  // Gated on `loaded`, not `loading`: see the note in useGroups.
  useEffect(() => {
    if (restored || !groups.loaded || !signedIn) return;
    const requested = launchIntent.groupId;
    const remembered = recallGroup();
    if (requested && groups.groups.some(group => group.id === requested)) {
      setActiveGroupId(requested);
      rememberGroup(requested);
    } else if (remembered && groups.groups.some(group => group.id === remembered)) {
      setActiveGroupId(remembered);
    } else if (groups.groups.length === 1) {
      setActiveGroupId(groups.groups[0].id);
    }
    setRestored(true);
  }, [restored, groups.loaded, groups.groups, signedIn, launchIntent.groupId]);

  const openGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    rememberGroup(groupId);
  }, []);

  const closeGroup = useCallback(() => {
    setActiveGroupId(null);
    rememberGroup(null);
    void groups.refresh();
  }, [groups]);

  const handleSignOut = useCallback(() => {
    void (async () => {
      try {
        // Delete the server association while the auth token still exists, then
        // unsubscribe locally so a shared phone cannot receive the old account's alerts.
        await removeMobilePushOnSignOut();
      } finally {
        rememberGroup(null);
        setActiveGroupId(null);
        setRestored(false);
        signOut();
      }
    })();
  }, [signOut]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <AppMark size={54} />
        <Spinner />
      </div>
    );
  }

  if (!me) {
    return <AuthScreen onRequestOtp={requestOtp} onVerifyOtp={verifyOtp} />;
  }

  if (!me.profileComplete) {
    return <OnboardingScreen me={me} onSave={saveProfile} onCheckUsername={checkUsername} />;
  }

  if (activeGroupId) {
    return (
      <GroupScreen
        key={activeGroupId}
        me={me}
        groupId={activeGroupId}
        onBack={closeGroup}
        onSaveProfile={saveProfile}
        onCheckUsername={checkUsername}
        onSignOut={handleSignOut}
        initialAction={launchAction}
        onActionHandled={() => setLaunchAction(null)}
        initialNotificationId={activeGroupId === launchIntent.groupId ? launchNotificationId : null}
        onNotificationHandled={() => setLaunchNotificationId(null)}
      />
    );
  }

  return (
    <GroupsScreen
      me={me}
      groups={groups.groups}
      loading={groups.loading}
      error={groups.error}
      onOpen={openGroup}
      onCreate={async (name, emoji) => {
        const group = await groups.createGroup(name, emoji);
        openGroup(group.id);
      }}
      onJoin={async code => {
        const result = await groups.joinGroup(code);
        openGroup(result.group.id);
        return result;
      }}
      onSignOut={handleSignOut}
      onSaveProfile={saveProfile}
      onCheckUsername={checkUsername}
    />
  );
}
