import { useCallback, useEffect, useState } from 'react';
import {
  AtSign,
  Bell,
  BellRing,
  ChevronRight,
  Copy,
  Download,
  History,
  LogOut,
  RefreshCw,
  Share2,
  Trash2,
  UserPlus,
  Users,
  Wand2,
} from 'lucide-react';
import type { Activity, Group, Me, Member, NotificationPrefs } from '@shared/types';
import { api } from '../lib/api';
import { formatMoney, formatRelative } from '../lib/format';
import { isIos, useInstallPrompt } from '../lib/pwa';
import {
  disableMobilePush,
  enableMobilePush,
  loadMobilePushState,
  type MobilePushState,
} from '../lib/push';
import { ErrorNote } from '../components/AddSheet';
import { ProfileSheet } from '../components/ProfileSheet';
import {
  Avatar,
  Button,
  Field,
  IconButton,
  SectionTitle,
  Sheet,
  Spinner,
  Tag,
  useConfirm,
  useToast,
} from '../components/ui';
import type { GroupStateApi } from '../hooks/useGroupState';

const PREF_LABELS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'sessionCreated', label: 'New expenses', hint: 'When someone records a shopping session' },
  { key: 'sessionEdited', label: 'Edits', hint: 'When an item, price or owner changes' },
  { key: 'sessionDeleted', label: 'Deletions', hint: 'When a session is removed and balances shift' },
  { key: 'settlementRecorded', label: 'Settlements', hint: 'When a payment is marked as done' },
  { key: 'memberChanged', label: 'Members', hint: 'When people join, leave or the group is renamed' },
];

interface MoreTabProps {
  me: Me;
  state: GroupStateApi;
  group: Group;
  onSaveProfile: (patch: { displayName?: string; username?: string; notificationPrefs?: Partial<NotificationPrefs> }) => Promise<unknown>;
  onCheckUsername: (username: string) => Promise<{ available: boolean; reason: string }>;
  onSignOut: () => void;
  onLeftGroup: () => void;
}

export function MoreTab({
  me,
  state,
  group,
  onSaveProfile,
  onCheckUsername,
  onSignOut,
  onLeftGroup,
}: MoreTabProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const install = useInstallPrompt();

  const [sheet, setSheet] = useState<'' | 'members' | 'profile' | 'prefs' | 'activity' | 'settings'>('');
  const isOwner = group.ownerId === me.userId;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyInvite = async () => {
    const message = `Join our "${group.name}" expenses on Expense Split.\n\nInvite code: ${group.inviteCode}\n${window.location.origin}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Expense Split invite', text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      toast('Invite copied to your clipboard.', 'success');
    } catch {
      // A cancelled share sheet is not an error worth reporting.
    }
  };

  const leaveGroup = async () => {
    const confirmed = await confirm({
      title: `Leave "${group.name}"?`,
      body: 'Your past expenses stay in the group history. You can rejoin with the invite code.',
      confirmLabel: 'Leave group',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api(`groups/${group.id}/members/${me.userId}`, { method: 'DELETE' });
      toast('You left the group.', 'success');
      onLeftGroup();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Could not leave the group.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>You</SectionTitle>
        <div className="card divide-y divide-line p-0">
          <button
            type="button"
            onClick={() => setSheet('profile')}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2"
          >
            <Avatar name={me.displayName} userId={me.userId} size={42} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-ink">{me.displayName}</span>
              <span className="block truncate text-[12.5px] text-muted">@{me.username}</span>
            </span>
            <ChevronRight className="size-[18px] shrink-0 text-faint" />
          </button>
          <Row icon={<Bell className="size-[18px]" />} label="Notification preferences" onClick={() => setSheet('prefs')} />
        </div>
      </section>

      <section>
        <SectionTitle>{group.name}</SectionTitle>
        <div className="card divide-y divide-line p-0">
          <Row
            icon={<Users className="size-[18px]" />}
            label="Members"
            value={String(group.members.length)}
            onClick={() => setSheet('members')}
          />
          <Row
            icon={<History className="size-[18px]" />}
            label="Activity log"
            onClick={() => setSheet('activity')}
          />
          {isOwner && (
            <Row
              icon={<Wand2 className="size-[18px]" />}
              label="Group settings"
              onClick={() => setSheet('settings')}
            />
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Invite</SectionTitle>
        <div className="card p-3.5">
          <p className="text-[12.5px] text-muted">Share this code so a flatmate can join.</p>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inset flex-1 px-3.5 py-3 text-center text-[19px] font-extrabold tracking-[0.22em] text-ink tnum">
              {group.inviteCode}
            </span>
            <IconButton
              label="Share invite"
              onClick={() => void copyInvite()}
              className="size-[46px] border border-line bg-surface"
            >
              {canShare ? <Share2 className="size-[18px]" /> : <Copy className="size-[18px]" />}
            </IconButton>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={async () => {
                const confirmed = await confirm({
                  title: 'Generate a new code?',
                  body: 'The current code stops working immediately.',
                  confirmLabel: 'Generate',
                });
                if (!confirmed) return;
                try {
                  await api(`groups/${group.id}/invite/rotate`, { method: 'POST' });
                  await state.sync();
                  toast('New invite code generated.', 'success');
                } catch (caught) {
                  toast(caught instanceof Error ? caught.message : 'Could not rotate the code.', 'error');
                }
              }}
              className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
            >
              <RefreshCw className="size-3.5" />
              Generate a new code
            </button>
          )}
        </div>
      </section>

      {!install.installed && (
        <section>
          <SectionTitle>Install</SectionTitle>
          <div className="card p-3.5">
            <p className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <Download className="size-4 text-brand" />
              Add to your home screen
            </p>
            {install.canPrompt ? (
              <>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  Launches full screen, works offline, and updates itself.
                </p>
                <Button size="sm" className="mt-2.5" onClick={() => void install.install()}>
                  Install app
                </Button>
              </>
            ) : isIos() ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                In Safari, tap <b>Share</b> → <b>Add to Home Screen</b>. It then opens full screen like a
                native app.
              </p>
            ) : (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <Button variant="secondary" block size="lg" onClick={onSignOut} icon={<LogOut className="size-[17px]" />}>
          Sign out
        </Button>
        {!isOwner && (
          <button
            type="button"
            onClick={() => void leaveGroup()}
            className="w-full py-2 text-[13px] font-semibold text-negative"
          >
            Leave this group
          </button>
        )}
      </section>

      <p className="pb-2 text-center text-[11px] text-faint">
        Expense Split · balances are computed on the server, never by AI
      </p>

      <MembersSheet
        open={sheet === 'members'}
        onClose={() => setSheet('')}
        group={group}
        me={me}
        state={state}
      />
      <ProfileSheet
        open={sheet === 'profile'}
        onClose={() => setSheet('')}
        me={me}
        onSave={onSaveProfile}
        onCheckUsername={onCheckUsername}
      />
      <PrefsSheet open={sheet === 'prefs'} onClose={() => setSheet('')} me={me} onSave={onSaveProfile} />
      <ActivitySheet open={sheet === 'activity'} onClose={() => setSheet('')} groupId={group.id} />
      <GroupSettingsSheet
        open={sheet === 'settings'}
        onClose={() => setSheet('')}
        group={group}
        state={state}
      />
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left active:bg-surface-2"
    >
      <span className="text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{label}</span>
      {value && <span className="shrink-0 text-[13px] font-medium text-faint tnum">{value}</span>}
      <ChevronRight className="size-[18px] shrink-0 text-faint" />
    </button>
  );
}

/* ── Members ──────────────────────────────────────────────────────────────── */

function MembersSheet({
  open,
  onClose,
  group,
  me,
  state,
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
  me: Me;
  state: GroupStateApi;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isOwner = group.ownerId === me.userId;

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`groups/${group.id}/members`, { method: 'POST', body: { username: username.trim() } });
      await state.sync();
      setUsername('');
      toast('Member added.', 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that person.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: Member) => {
    const confirmed = await confirm({
      title: `Remove ${member.displayName}?`,
      body: 'Their past expenses stay in the history. Balances must be settled first.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api(`groups/${group.id}/members/${member.userId}`, { method: 'DELETE' });
      await state.sync();
      toast(`${member.displayName} removed.`, 'success');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Could not remove them.', 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Members" subtitle={group.name}>
      <div className="space-y-4">
        <ul className="card divide-y divide-line p-0">
          {group.members.map(member => {
            const directTransfer = state.transfers.find(
              transfer =>
                (transfer.from === me.userId && transfer.to === member.userId) ||
                (transfer.to === me.userId && transfer.from === member.userId)
            );
            const iPay = directTransfer?.from === me.userId;
            return (
              <li key={member.userId} className="flex items-center gap-3 px-3.5 py-3">
                <Avatar name={member.displayName} userId={member.userId} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="clip truncate text-[14px] font-bold text-ink">{member.displayName}</span>
                    {member.role === 'owner' && <Tag tone="brand">Owner</Tag>}
                    {member.userId === me.userId && <Tag tone="neutral">You</Tag>}
                  </p>
                  <p className="truncate text-[12px] text-muted">@{member.username}</p>
                </div>
                {member.userId !== me.userId && directTransfer && (
                  <div className="shrink-0 text-right">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">
                      {iPay ? 'You pay' : 'They pay you'}
                    </p>
                    <p className={`text-[12.5px] font-bold tnum ${iPay ? 'text-negative' : 'text-positive'}`}>
                      {formatMoney(directTransfer.amount)}
                    </p>
                  </div>
                )}
                {isOwner && member.userId !== me.userId && (
                  <IconButton
                    label={`Remove ${member.displayName}`}
                    onClick={() => void remove(member)}
                    className="size-9 shrink-0 hover:text-negative"
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-[12px] leading-relaxed text-faint">
          Only direct payments between you and each member are shown. They are never combined through someone else.
        </p>

        {isOwner ? (
          <div className="card-flat space-y-3 p-3.5">
            <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <UserPlus className="size-4 text-muted" />
              Add by username
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <input
                  type="text"
                  value={username}
                  onChange={event => setUsername(event.target.value.replace(/^@/, ''))}
                  placeholder="flatmate_username"
                  className="field pl-9"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              <Button loading={busy} disabled={username.trim().length < 3} onClick={() => void add()}>
                Add
              </Button>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <p className="text-[12px] leading-relaxed text-faint">
              They can also join themselves with the invite code.
            </p>
          </div>
        ) : (
          <p className="px-1 text-[12.5px] text-faint">Only the group owner can add or remove members.</p>
        )}
      </div>
    </Sheet>
  );
}

/* ── Notification preferences ─────────────────────────────────────────────── */

function PrefsSheet({
  open,
  onClose,
  me,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  me: Me;
  onSave: (patch: { notificationPrefs: Partial<NotificationPrefs> }) => Promise<unknown>;
}) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(me.notificationPrefs);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState<MobilePushState | null>(null);
  const [mobileBusy, setMobileBusy] = useState(false);
  const [mobileError, setMobileError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPrefs(me.notificationPrefs);
    setMobileBusy(true);
    setMobileError('');
    let cancelled = false;
    void loadMobilePushState()
      .then(state => {
        if (!cancelled) setMobile(state);
      })
      .catch(error => {
        if (!cancelled) {
          setMobile(null);
          setMobileError(error instanceof Error ? error.message : 'Could not check this device.');
        }
      })
      .finally(() => {
        if (!cancelled) setMobileBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, me.notificationPrefs]);

  const toggle = async (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setBusy(true);
    try {
      await onSave({ notificationPrefs: next });
    } catch {
      setPrefs(prefs);
      toast('Could not save that preference.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleMobile = async () => {
    setMobileBusy(true);
    setMobileError('');
    try {
      if (mobile?.subscribed) {
        await disableMobilePush();
        toast('Mobile notifications turned off on this device.', 'success');
      } else {
        await enableMobilePush();
        toast('Mobile notifications enabled on this device.', 'success');
      }
      setMobile(await loadMobilePushState());
    } catch (error) {
      setMobileError(error instanceof Error ? error.message : 'Could not update mobile notifications.');
      try {
        setMobile(await loadMobilePushState());
      } catch {
        /* Keep the actionable error from the original attempt. */
      }
    } finally {
      setMobileBusy(false);
    }
  };

  const mobileHint = (() => {
    if (mobileError) return mobileError;
    if (mobileBusy && !mobile) return 'Checking this device...';
    if (mobile?.issue === 'ios-install-required') {
      return 'On iPhone or iPad, add the app to your Home Screen first, then open it from the icon.';
    }
    if (mobile?.issue === 'insecure') return 'Open the deployed HTTPS app to enable phone notifications.';
    if (mobile?.issue === 'unsupported') return 'This browser does not support mobile notifications.';
    if (mobile?.issue === 'server-unconfigured') return 'Mobile delivery has not been configured on the server yet.';
    if (mobile?.permission === 'denied') return 'Blocked in your browser or phone notification settings.';
    if (mobile?.subscribed) return "Alerts appear in this device's notification tray, even when the app is closed.";
    return "Show selected alerts in this device's notification tray.";
  })();

  const mobileDisabled =
    mobileBusy ||
    !mobile ||
    Boolean(mobile.issue) ||
    mobile.permission === 'denied';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Notifications"
      subtitle="Choose what you want to hear about."
    >
      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">On this device</p>
      <div className="card mb-4 flex items-center gap-3 p-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <BellRing className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">Mobile notification bar</p>
          <p className={`text-[12px] leading-snug ${mobileError ? 'text-negative' : 'text-muted'}`}>
            {mobileHint}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(mobile?.subscribed)}
          aria-label="Mobile notification bar"
          disabled={mobileDisabled}
          onClick={() => void toggleMobile()}
          className={`relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            mobile?.subscribed ? 'bg-brand' : 'bg-surface-3'
          }`}
        >
          <span
            className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
              mobile?.subscribed ? 'left-[23px]' : 'left-[3px]'
            }`}
          />
        </button>
      </div>

      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Alert types</p>
      <ul className="card divide-y divide-line p-0">
        {PREF_LABELS.map(pref => (
          <li key={pref.key} className="flex items-center gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">{pref.label}</p>
              <p className="text-[12px] leading-snug text-muted">{pref.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[pref.key]}
              aria-label={pref.label}
              disabled={busy}
              onClick={() => void toggle(pref.key)}
              className={`relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors ${
                prefs[pref.key] ? 'bg-brand' : 'bg-surface-3'
              }`}
            >
              <span
                className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
                  prefs[pref.key] ? 'left-[23px]' : 'left-[3px]'
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-faint">
        These choices control both the in-app bell and mobile alerts. Mobile alerts must be enabled on each
        device separately.
      </p>
    </Sheet>
  );
}

/* ── Activity log ─────────────────────────────────────────────────────────── */

function ActivitySheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [before, setBefore] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (cursor: number) => {
      setLoading(true);
      try {
        const result = await api<{ activities: Activity[]; nextBefore: number }>(
          `groups/${groupId}/activity`,
          { query: { before: cursor || undefined, limit: 40 } }
        );
        setActivities(current => (cursor ? [...current, ...result.activities] : result.activities));
        setBefore(result.nextBefore);
      } finally {
        setLoading(false);
      }
    },
    [groupId]
  );

  useEffect(() => {
    if (open) void load(0);
  }, [open, load]);

  return (
    <Sheet open={open} onClose={onClose} size="tall" title="Activity log" subtitle="Every change, in order.">
      {loading && activities.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : activities.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-faint">Nothing has happened yet.</p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-0">
            {activities.map((activity, index) => (
              <li key={activity.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-line" aria-hidden />
                  {index < activities.length - 1 && <span className="w-px flex-1 bg-line" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <p className="clip text-[13.5px] font-semibold leading-snug text-ink">{activity.summary}</p>
                  {activity.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {activity.changes.slice(0, 6).map((change, changeIndex) => (
                        <li key={changeIndex} className="clip text-[12px] leading-snug text-muted">
                          · {change}
                        </li>
                      ))}
                      {activity.changes.length > 6 && (
                        <li className="text-[12px] text-faint">
                          · and {activity.changes.length - 6} more
                        </li>
                      )}
                    </ul>
                  )}
                  <p className="mt-1 text-[11px] font-medium text-faint">{formatRelative(activity.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>

          {before > 0 && (
            <Button variant="secondary" block loading={loading} onClick={() => void load(before)}>
              Load older
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ── Group settings ───────────────────────────────────────────────────────── */

function GroupSettingsSheet({
  open,
  onClose,
  group,
  state,
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
  state: GroupStateApi;
}) {
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [assumeShared, setAssumeShared] = useState(group.settings.assumeSharedWhenUnspecified);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setAssumeShared(group.settings.assumeSharedWhenUnspecified);
    setError('');
  }, [open, group.name, group.settings.assumeSharedWhenUnspecified]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`groups/${group.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), assumeSharedWhenUnspecified: assumeShared },
      });
      await state.sync();
      toast('Group settings saved.', 'success');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the settings.');
    } finally {
      setBusy(false);
    }
  };

  const changed = name.trim() !== group.name || assumeShared !== group.settings.assumeSharedWhenUnspecified;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Group settings"
      footer={
        <Button size="lg" block loading={busy} disabled={!changed || !name.trim()} onClick={() => void save()}>
          Save settings
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Group name">
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            className="field"
            maxLength={60}
          />
        </Field>

        <div className="card-flat flex items-start gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Assume shared when unstated</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
              A line like "Milk - 60" with no owner is filled in as shared by everyone, clearly marked so you
              can change it. Turn this off to be asked every time.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={assumeShared}
            aria-label="Assume shared when unstated"
            onClick={() => setAssumeShared(!assumeShared)}
            className={`relative mt-0.5 h-[28px] w-[48px] shrink-0 rounded-full transition-colors ${
              assumeShared ? 'bg-brand' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${
                assumeShared ? 'left-[23px]' : 'left-[3px]'
              }`}
            />
          </button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
