import { useEffect, useState } from 'react';
import { AtSign, ShieldCheck } from 'lucide-react';
import type { Me } from '@shared/types';
import { ErrorNote } from './AddSheet';
import { Button, Field, Sheet, useToast } from './ui';

export function ProfileSheet({
  open,
  onClose,
  me,
  onSave,
  onCheckUsername,
}: {
  open: boolean;
  onClose: () => void;
  me: Me;
  onSave: (patch: { displayName?: string; username?: string }) => Promise<unknown>;
  onCheckUsername: (username: string) => Promise<{ available: boolean; reason: string }>;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [username, setUsername] = useState(me.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDisplayName(me.displayName);
    setUsername(me.username);
    setError('');
  }, [open, me.displayName, me.username]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (username !== me.username) {
        const check = await onCheckUsername(username);
        if (!check.available) {
          setError(check.reason || 'That username is already taken.');
          return;
        }
      }
      await onSave({ displayName: displayName.trim(), username: username.trim() });
      toast('Profile updated.', 'success');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const changed = displayName.trim() !== me.displayName || username.trim() !== me.username;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your profile"
      footer={
        <Button
          size="lg"
          block
          loading={busy}
          disabled={!changed || !displayName.trim() || username.trim().length < 3}
          onClick={() => void save()}
        >
          Save changes
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Display name" hint="Existing history keeps the name it was recorded with.">
          <input
            type="text"
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className="field"
            maxLength={50}
          />
        </Field>

        <Field label="Username" hint="3–20 letters, numbers or underscores. Flatmates use it to add you.">
          <div className="relative">
            <AtSign className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={username}
              onChange={event =>
                setUsername(event.target.value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))
              }
              className="field pl-10"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
        </Field>

        <div className="inset flex items-center gap-2.5 px-3.5 py-3">
          <ShieldCheck className="size-4 shrink-0 text-muted" />
          <p className="clip text-[12.5px] text-muted">
            Signed in as <span className="font-semibold text-ink">{me.email}</span>
          </p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
