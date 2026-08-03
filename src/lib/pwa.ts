/**
 * Progressive Web App wiring: service worker registration with periodic update
 * checks, plus the install prompt (including the iOS path, where Safari offers no
 * programmatic prompt and the user must use Share → Add to Home Screen).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // iOS Safari's non-standard flag for home-screen apps.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac, distinguished by touch support.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useServiceWorker() {
  const [offlineReady, setOfflineReady] = useState(false);

  useRegisterSW({
    immediate: true,
    onOfflineReady() {
      setOfflineReady(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Long-lived installed apps rarely reload, so poll for a new build.
      window.setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
      window.addEventListener('focus', () => {
        if (navigator.onLine) void registration.update();
      });
    },
  });

  return { offlineReady, dismissOfflineReady: () => setOfflineReady(false) };
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setEvent(null);
    return choice.outcome === 'accepted';
  }, [event]);

  return {
    installed,
    /** True when the browser gave us a real prompt to fire. */
    canPrompt: Boolean(event),
    /** iOS can install, but only through the Share menu. */
    needsIosInstructions: !installed && isIos() && !event,
    install,
  };
}
