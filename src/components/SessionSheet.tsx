import { useEffect, useMemo, useState } from 'react';
import { Pencil, Receipt, Sparkles, Trash2 } from 'lucide-react';
import { CATEGORY_EMOJI } from '@shared/categories';
import { parseAmount } from '@shared/money';
import type { DraftItem, Group, Member, Session } from '@shared/types';
import { api } from '../lib/api';
import { formatDayLabel, formatMoney, formatRelative, toDateInput } from '../lib/format';
import { ErrorNote, PayerAndDate } from './AddSheet';
import { DraftEditor, validateDraft } from './DraftEditor';
import { OwnerSummary } from './OwnerPicker';
import { Avatar, Button, Field, Sheet, Tag, useConfirm, useToast } from './ui';

const SOURCE_LABEL: Record<Session['source'], string> = {
  manual: 'Added by hand',
  text: 'From pasted text',
  receipt: 'From a receipt photo',
  whatsapp: 'Imported from WhatsApp',
};

interface SessionSheetProps {
  session: Session | null;
  group: Group;
  members: Member[];
  currentUserId: string;
  onClose: () => void;
  onUpdated: (session: Session) => void;
  onDeleted: (sessionId: string) => void;
}

export function SessionSheet({
  session,
  group,
  members,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
}: SessionSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [shop, setShop] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    setEditing(false);
    setError('');
    setShop(session.shop);
    setNotes(session.notes);
    setDate(toDateInput(session.date));
    setPaidBy(session.paidBy);
    setItems(
      session.items.map(item => ({
        id: item.id,
        name: item.name,
        amount: (item.amount / 100).toString(),
        owners: item.owners,
        category: item.category,
        assumed: false,
        needsOwners: item.owners.length === 0,
        reason: item.owners.length === 0 ? 'Choose who shares this item.' : '',
      }))
    );
  }, [session]);

  const validity = useMemo(() => validateDraft(items), [items]);
  const myShare = session ? session.shares[currentUserId] ?? 0 : 0;

  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const payload = items
        .map(item => ({
          id: item.id,
          name: item.name.trim(),
          amount: parseAmount(item.amount) ?? 0,
          owners: item.owners,
          category: item.category,
        }))
        .filter(item => item.name && item.amount > 0);

      const result = await api<{ session: Session; unchanged?: boolean }>(
        `groups/${group.id}/sessions/${session.id}`,
        { method: 'PATCH', body: { date, shop: shop.trim(), notes: notes.trim(), paidBy, items: payload } }
      );

      onUpdated(result.session);
      toast(result.unchanged ? 'Nothing changed.' : 'Session updated.', 'success');
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save those changes.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!session) return;
    const confirmed = await confirm({
      title: 'Delete this session?',
      body: `${formatMoney(session.total)} across ${session.items.length} item${
        session.items.length === 1 ? '' : 's'
      } will be removed and everyone's balance will change. This is recorded in the activity log.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await api(`groups/${group.id}/sessions/${session.id}`, { method: 'DELETE' });
      onDeleted(session.id);
      toast('Session deleted.', 'success');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={Boolean(session)}
      onClose={onClose}
      size={editing ? 'tall' : 'auto'}
      title={session?.shop || 'Shopping session'}
      subtitle={session ? `${formatDayLabel(session.date)} · ${formatMoney(session.total)}` : undefined}
      footer={
        session ? (
          editing ? (
            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="lg" block loading={busy} disabled={!validity.canSave} onClick={() => void save()}>
                {validity.blocking > 0 ? 'Assign owners to save' : 'Save changes'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                size="lg"
                block
                onClick={() => setEditing(true)}
                icon={<Pencil className="size-[17px]" />}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                size="lg"
                loading={busy}
                onClick={() => void remove()}
                className="!text-negative"
                icon={<Trash2 className="size-[17px]" />}
              >
                Delete
              </Button>
            </div>
          )
        ) : undefined
      }
    >
      {!session ? null : editing ? (
        <div className="space-y-4">
          <DraftEditor items={items} members={members} onChange={setItems} />
          <PayerAndDate members={members} paidBy={paidBy} onPaidBy={setPaidBy} date={date} onDate={setDate} />
          <Field label="Shop">
            <input
              type="text"
              value={shop}
              onChange={event => setShop(event.target.value)}
              placeholder="Optional"
              className="field"
              maxLength={80}
            />
          </Field>
          <Field label="Notes">
            <input
              type="text"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Optional"
              className="field"
              maxLength={500}
            />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="inset flex items-center gap-3 p-3">
            <Avatar name={session.paidByName || 'Member'} userId={session.paidBy} size={38} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-ink">
                {session.paidByName || 'Member'} paid {formatMoney(session.total)}
              </p>
              <p className="text-[12px] text-muted">
                {SOURCE_LABEL[session.source]} · added {formatRelative(session.createdAt)}
                {session.createdBy !== session.paidBy && session.createdByName
                  ? ` by ${session.createdByName}`
                  : ''}
              </p>
            </div>
            {session.source !== 'manual' && (
              <Tag tone="brand">
                <Sparkles className="size-3" />
                AI
              </Tag>
            )}
          </div>

          {myShare > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-brand-line bg-brand-soft px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-brand-dark">Your share of this trip</span>
              <span className="text-[15px] font-extrabold text-brand-dark tnum">{formatMoney(myShare)}</span>
            </div>
          )}

          <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line">
            {session.items.map(item => (
              <li key={item.id} className="flex items-start gap-3 bg-surface px-3 py-2.5">
                <span className="mt-0.5 text-[17px]" aria-hidden>
                  {CATEGORY_EMOJI[item.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="clip text-[14px] font-semibold text-ink">{item.name}</p>
                  <OwnerSummary members={members} owners={item.owners} className="mt-0.5 block" />
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-bold text-ink tnum">{formatMoney(item.amount)}</p>
                  {item.shares[currentUserId] !== undefined && (
                    <p className="text-[11.5px] text-muted tnum">you {formatMoney(item.shares[currentUserId])}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {session.notes && (
            <div className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
              <Receipt className="mt-px size-4 shrink-0 text-faint" />
              <p className="clip text-[13px] leading-relaxed text-muted">{session.notes}</p>
            </div>
          )}

          <div>
            <p className="mb-2 px-1 text-[11.5px] font-bold uppercase tracking-[0.07em] text-faint">
              Split across members
            </p>
            <ul className="space-y-1.5">
              {members
                .filter(member => (session.shares[member.userId] ?? 0) > 0)
                .map(member => (
                  <li key={member.userId} className="flex items-center gap-2.5 px-1">
                    <Avatar name={member.displayName} userId={member.userId} size={26} />
                    <span className="clip flex-1 text-[13px] font-medium text-ink">{member.displayName}</span>
                    <span className="text-[13px] font-bold text-muted tnum">
                      {formatMoney(session.shares[member.userId] ?? 0)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}
    </Sheet>
  );
}
