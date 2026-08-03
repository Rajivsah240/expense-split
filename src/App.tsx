import { useCallback, useEffect, useState } from 'react';
import { AppMark } from './components/AppMark';
import { ConfirmProvider, Spinner, ToastProvider, useToast } from './components/ui';
import { useAuth } from './hooks/useAuth';
import { recallGroup, rememberGroup, useGroups } from './hooks/useGroups';
import { useServiceWorker } from './lib/pwa';
import { AuthScreen } from './screens/AuthScreen';
import { GroupScreen } from './screens/GroupScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';

type LaunchAction = 'add' | 'balances' | null;

/** Read the PWA manifest shortcut, then clean the URL so a refresh doesn't repeat it. */
function readLaunchAction(): LaunchAction {
  if (typeof window === 'undefined') return null;
  const action = new URLSearchParams(window.location.search).get('action');
  if (action === 'add' || action === 'balances') {
    window.history.replaceState({}, '', window.location.pathname);
    return action;
  }
  return null;
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

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [launchAction, setLaunchAction] = useState<LaunchAction>(readLaunchAction);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (offlineReady) {
      toast('Ready to work offline.', 'info');
      dismissOfflineReady();
    }
  }, [offlineReady, toast, dismissOfflineReady]);

  // Reopen whichever group you were last looking at — one less tap every launch.
  // Gated on `loaded`, not `loading`: see the note in useGroups.
  useEffect(() => {
    if (restored || !groups.loaded || !signedIn) return;
    const remembered = recallGroup();
    if (remembered && groups.groups.some(group => group.id === remembered)) {
      setActiveGroupId(remembered);
    } else if (groups.groups.length === 1) {
      setActiveGroupId(groups.groups[0].id);
    }
    setRestored(true);
  }, [restored, groups.loaded, groups.groups, signedIn]);

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
    rememberGroup(null);
    setActiveGroupId(null);
    setRestored(false);
    signOut();
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
