import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { AtSign, Check, Loader2, Sparkles, X } from 'lucide-react';
import type { Me } from '@shared/types';
import { AppMark } from '../components/AppMark';
import { Button, Field } from '../components/ui';

interface OnboardingScreenProps {
  me: Me;
  onSave: (patch: { displayName: string; username: string }) => Promise<unknown>;
  onCheckUsername: (username: string) => Promise<{ available: boolean; reason: string }>;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function suggestUsername(email: string, displayName: string): string {
  const base = (displayName || email.split('@')[0] || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return base.length >= 3 ? base : '';
}

export function OnboardingScreen({ me, onSave, onCheckUsername }: OnboardingScreenProps) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [username, setUsername] = useState(me.username);
  const [touchedUsername, setTouchedUsername] = useState(Boolean(me.username));
  const [availability, setAvailability] = useState<{ state: 'idle' | 'checking' | 'ok' | 'taken'; reason: string }>({
    state: 'idle',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Offer a username derived from the name they type, until they edit it themselves.
  useEffect(() => {
    if (touchedUsername) return;
    setUsername(suggestUsername(me.email, displayName));
  }, [displayName, me.email, touchedUsername]);

  const usernameValid = useMemo(() => USERNAME_PATTERN.test(username), [username]);

  useEffect(() => {
    if (!usernameValid) {
      setAvailability({ state: 'idle', reason: '' });
      return;
    }
    setAvailability({ state: 'checking', reason: '' });
    const timer = window.setTimeout(async () => {
      try {
        const result = await onCheckUsername(username);
        setAvailability({ state: result.available ? 'ok' : 'taken', reason: result.reason });
      } catch {
        setAvailability({ state: 'idle', reason: '' });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [username, usernameValid, onCheckUsername]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ displayName: displayName.trim(), username: username.trim() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const ready = displayName.trim().length >= 1 && usernameValid && availability.state !== 'taken';

  return (
    <div className="flex min-h-dvh flex-col justify-center pb-safe pt-safe">
      <div className="shell py-10">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="mb-7 flex flex-col items-center text-center">
            <AppMark size={54} className="mb-4" />
            <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-ink">Set up your profile</h1>
            <p className="mt-1.5 max-w-[32ch] text-[14px] leading-relaxed text-muted">
              Two things and you're in. Both can be changed later.
            </p>
          </div>

          <form onSubmit={submit} className="card space-y-4 p-5">
            <Field
              label="Display name"
              hint="How you appear everywhere in the app — on expenses, balances and history."
            >
              <input
                type="text"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                placeholder="Rajiv"
                className="field"
                maxLength={50}
                autoComplete="name"
                autoFocus
                required
              />
            </Field>

            <Field
              label="Username"
              hint="Unique. Flatmates use it to add you to a group."
              error={availability.state === 'taken' ? availability.reason : undefined}
            >
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-faint" />
                <input
                  type="text"
                  value={username}
                  onChange={event => {
                    setTouchedUsername(true);
                    setUsername(event.target.value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20));
                  }}
                  placeholder="rajiv_sah"
                  className={`field pl-10 pr-11 ${availability.state === 'taken' ? 'field-invalid' : ''}`}
                  maxLength={20}
                  autoCapitalize="off"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {availability.state === 'checking' && <Loader2 className="size-4 animate-spin text-faint" />}
                  {availability.state === 'ok' && <Check className="size-[18px] text-positive" />}
                  {availability.state === 'taken' && <X className="size-[18px] text-negative" />}
                </span>
              </div>
            </Field>

            {error && (
              <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[12.5px] font-medium text-negative">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              block
              loading={busy}
              disabled={!ready}
              icon={<Sparkles className="size-[18px]" />}
            >
              Get started
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
