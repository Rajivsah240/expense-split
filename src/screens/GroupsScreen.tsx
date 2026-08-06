import { motion } from 'motion/react';
import { useState } from 'react';
import { ChevronRight, LogOut, Plus, Ticket, Users } from 'lucide-react';
import { AppMark } from '../components/AppMark';
import { ProfileSheet } from '../components/ProfileSheet';
import { Avatar, Button, EmptyState, Field, IconButton, Sheet, useToast } from '../components/ui';
import { formatMoneyShort } from '../lib/format';
import type { GroupListEntry } from '../hooks/useGroups';
import type { Me, NotificationPrefs } from '@shared/types';

const EMOJI_CHOICES = ['🏠', '🧾', '🍜', '✈️', '🎒', '🏖️', '🏢', '🎉', '🚗', '🛒'];

interface GroupsScreenProps {
  me: Me;
  groups: GroupListEntry[];
  loading: boolean;
  error: string;
  onOpen: (groupId: string) => void;
  onCreate: (name: string, emoji: string) => Promise<unknown>;
  onJoin: (code: string) => Promise<{ alreadyMember?: boolean }>;
  onSignOut: () => void;
  onSaveProfile: (patch: {
    displayName?: string;
    username?: string;
    notificationPrefs?: Partial<NotificationPrefs>;
  }) => Promise<unknown>;
  onCheckUsername: (username: string) => Promise<{ available: boolean; reason: string }>;
}

export function GroupsScreen({
  me,
  groups,
  loading,
  error,
  onOpen,
  onCreate,
  onJoin,
  onSignOut,
  onSaveProfile,
  onCheckUsername,
}: GroupsScreenProps) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  return (
    <div className="min-h-dvh pt-safe">
      <header className="shell flex items-center gap-3 py-4">
        <AppMark size={38} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-extrabold tracking-[-0.01em] text-ink">Your groups</h1>
          <p className="truncate text-[13px] text-muted">
            {me.displayName} · <span className="font-medium">@{me.username}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditingProfile(true)}
          className="tap rounded-full"
          aria-label="Edit your profile"
        >
          <Avatar name={me.displayName} userId={me.userId} size={38} />
        </button>
        <IconButton label="Sign out" onClick={onSignOut}>
          <LogOut className="size-[19px]" />
        </IconButton>
      </header>

      <main className="shell page-pad space-y-4">
        {error && (
          <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[13px] font-medium text-negative">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map(index => (
              <div key={index} className="skeleton h-[76px] rounded-[16px]" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="No groups yet"
            body="Create one for your flat, or join your flatmate's group with their invite code."
          />
        ) : (
          <ul className="space-y-2.5">
            {groups.map((group, index) => (
              <motion.li
                key={group.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.2) }}
              >
                <button
                  type="button"
                  onClick={() => onOpen(group.id)}
                  className="card flex w-full items-center gap-3.5 p-3.5 text-left transition-colors hover:border-line-strong active:bg-surface-2"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-[21px]">
                    {group.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink">{group.name}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                      {group.members.length} member{group.members.length === 1 ? '' : 's'}
                      {group.summary.sessionCount > 0 && (
                        <>
                          {' · '}
                          <span className="tnum">{formatMoneyShort(group.summary.groupTotal)}</span> across{' '}
                          {group.summary.sessionCount} session{group.summary.sessionCount === 1 ? '' : 's'}
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-faint" />
                </button>
              </motion.li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button variant="primary" size="lg" onClick={() => setCreating(true)} icon={<Plus className="size-[18px]" />}>
            New group
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setJoining(true)} icon={<Ticket className="size-[18px]" />}>
            Join
          </Button>
        </div>
      </main>

      <CreateGroupSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (name, emoji) => {
          await onCreate(name, emoji);
          setCreating(false);
          toast(`"${name}" created. Share the invite code from Settings.`, 'success');
        }}
      />

      <ProfileSheet
        open={editingProfile}
        onClose={() => setEditingProfile(false)}
        me={me}
        onSave={onSaveProfile}
        onCheckUsername={onCheckUsername}
      />

      <JoinGroupSheet
        open={joining}
        onClose={() => setJoining(false)}
        onJoin={async code => {
          const result = await onJoin(code);
          setJoining(false);
          toast(result.alreadyMember ? "You're already in that group." : "You've joined the group.", 'success');
        }}
      />
    </div>
  );
}

function CreateGroupSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, emoji: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onCreate(name.trim(), emoji);
      setName('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      subtitle="A flat, a holiday, an office lunch — anything you split."
      footer={
        <Button size="lg" block loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
          Create group
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Group name">
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Flat 302"
            className="field"
            maxLength={60}
            autoFocus
          />
        </Field>

        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {EMOJI_CHOICES.map(choice => (
              <button
                key={choice}
                type="button"
                onClick={() => setEmoji(choice)}
                aria-pressed={emoji === choice}
                className={`flex size-11 items-center justify-center rounded-[13px] border text-[21px] transition-colors ${
                  emoji === choice ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[12.5px] font-medium text-negative">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function JoinGroupSheet({
  open,
  onClose,
  onJoin,
}: {
  open: boolean;
  onClose: () => void;
  onJoin: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onJoin(code.trim());
      setCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join that group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Join a group"
      subtitle="Ask a member for the group's invite code."
      footer={
        <Button size="lg" block loading={busy} disabled={code.trim().length < 4} onClick={() => void submit()}>
          Join group
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Invite code" hint="Seven characters, letters and numbers.">
          <input
            type="text"
            value={code}
            onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))}
            placeholder="K7M2QPX"
            className="field text-center text-[20px] font-bold tracking-[0.24em] tnum"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[12.5px] font-medium text-negative">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
