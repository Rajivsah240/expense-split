/**
 * Settlement. The suggested transfers come from the server's minimum-cash-flow
 * calculation; you can only mark one that involves you, which is the rule the
 * product spec asks for.
 */

import { useMemo, useState } from 'react';
import { ArrowRight, Check, History, Undo2 } from 'lucide-react';
import { parseAmount } from '@shared/money';
import type { Group, Member, Settlement, Transfer } from '@shared/types';
import { api } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { ErrorNote } from './AddSheet';
import { Avatar, Button, EmptyState, Field, Sheet, Tag, useConfirm, useToast } from './ui';

interface SettleSheetProps {
  open: boolean;
  onClose: () => void;
  group: Group;
  members: Member[];
  transfers: Transfer[];
  settlements: Settlement[];
  currentUserId: string;
  onChanged: () => void;
}

export function SettleSheet({
  open,
  onClose,
  group,
  members,
  transfers,
  settlements,
  currentUserId,
  onChanged,
}: SettleSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const others = useMemo(() => members.filter(member => member.userId !== currentUserId), [members, currentUserId]);
  const [customTo, setCustomTo] = useState(others[0]?.userId ?? '');
  const [customAmount, setCustomAmount] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [customDirection, setCustomDirection] = useState<'iPaid' | 'iReceived'>('iPaid');

  const nameOf = (userId: string) => members.find(member => member.userId === userId)?.displayName ?? 'Member';

  const record = async (fromUser: string, toUser: string, amount: number, note: string, key: string) => {
    setBusyKey(key);
    setError('');
    try {
      await api(`groups/${group.id}/settlements`, {
        method: 'POST',
        body: { fromUser, toUser, amount, note },
      });
      onChanged();
      toast(`Recorded ${nameOf(fromUser)} → ${nameOf(toUser)} ${formatMoney(amount)}.`, 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record that.');
    } finally {
      setBusyKey('');
    }
  };

  const undo = async (settlement: Settlement) => {
    const confirmed = await confirm({
      title: 'Undo this settlement?',
      body: `${settlement.fromName} → ${settlement.toName} ${formatMoney(settlement.amount)} will be reversed and balances will change back.`,
      confirmLabel: 'Undo it',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusyKey(settlement.id);
    setError('');
    try {
      await api(`groups/${group.id}/settlements/${settlement.id}`, { method: 'DELETE' });
      onChanged();
      toast('Settlement undone.', 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not undo that.');
    } finally {
      setBusyKey('');
    }
  };

  const submitCustom = async () => {
    const amount = parseAmount(customAmount);
    if (!amount || amount <= 0 || !customTo) return;
    const fromUser = customDirection === 'iPaid' ? currentUserId : customTo;
    const toUser = customDirection === 'iPaid' ? customTo : currentUserId;
    await record(fromUser, toUser, amount, customNote.trim(), 'custom');
    setCustomAmount('');
    setCustomNote('');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="tall"
      title="Settle up"
      subtitle="The fewest payments that clear all balances. Direct payer balances stay visible on Home."
    >
      <div className="space-y-5">
        <section>
          {transfers.length === 0 ? (
            <EmptyState
              icon={<Check className="size-6 text-positive" />}
              title="Everyone is square"
              body="No payments are needed right now."
            />
          ) : (
            <ul className="space-y-2.5">
              {transfers.map((transfer, index) => {
                const key = `${transfer.from}-${transfer.to}-${index}`;
                const involvesMe = transfer.from === currentUserId || transfer.to === currentUserId;
                const iPay = transfer.from === currentUserId;

                return (
                  <li
                    key={key}
                    className={`rounded-[15px] border p-3 ${
                      involvesMe ? 'border-brand-line bg-brand-soft/40' : 'border-line bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={nameOf(transfer.from)} userId={transfer.from} size={30} />
                      <ArrowRight className="size-4 shrink-0 text-faint" />
                      <Avatar name={nameOf(transfer.to)} userId={transfer.to} size={30} />
                      <div className="clip flex-1 pl-0.5">
                        <p className="clip text-[13.5px] font-bold text-ink">
                          {iPay ? 'You' : nameOf(transfer.from)} pay{iPay ? '' : 's'}{' '}
                          {transfer.to === currentUserId ? 'you' : nameOf(transfer.to)}
                        </p>
                        <p className="text-[15px] font-extrabold text-ink tnum">{formatMoney(transfer.amount)}</p>
                      </div>
                    </div>

                    {involvesMe ? (
                      <Button
                        size="sm"
                        block
                        className="mt-2.5"
                        loading={busyKey === key}
                        onClick={() =>
                          void record(
                            transfer.from,
                            transfer.to,
                            transfer.amount,
                            iPay ? 'Marked paid' : 'Marked received',
                            key
                          )
                        }
                        icon={<Check className="size-4" />}
                      >
                        {iPay ? 'I paid this' : 'I received this'}
                      </Button>
                    ) : (
                      <p className="mt-2 text-[12px] text-faint">
                        Only {nameOf(transfer.from)} or {nameOf(transfer.to)} can mark this as done.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {others.length > 0 && (
          <section className="card-flat space-y-3 p-3.5">
            <h3 className="text-[13px] font-bold text-ink">Record a different payment</h3>

            <div className="inset flex gap-1 p-1">
              {(
                [
                  ['iPaid', 'I paid'],
                  ['iReceived', 'I received'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCustomDirection(value)}
                  aria-pressed={customDirection === value}
                  className={`h-9 flex-1 rounded-[9px] text-[13px] font-semibold transition-colors ${
                    customDirection === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={customDirection === 'iPaid' ? 'Paid to' : 'Received from'}>
                <select value={customTo} onChange={event => setCustomTo(event.target.value)} className="field">
                  {others.map(member => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-faint">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customAmount}
                    onChange={event => setCustomAmount(event.target.value.replace(/[^\d.]/g, '').slice(0, 10))}
                    placeholder="0"
                    className="field pl-7 text-right font-bold tnum"
                  />
                </div>
              </Field>
            </div>

            <Field label="Note (optional)">
              <input
                type="text"
                value={customNote}
                onChange={event => setCustomNote(event.target.value)}
                placeholder="UPI, cash, part payment…"
                className="field"
                maxLength={300}
              />
            </Field>

            <Button
              block
              loading={busyKey === 'custom'}
              disabled={!parseAmount(customAmount)}
              onClick={() => void submitCustom()}
            >
              Record payment
            </Button>
          </section>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <section>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex w-full items-center justify-between rounded-xl bg-surface-2 px-3.5 py-3"
          >
            <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <History className="size-4 text-muted" />
              Settlement history
            </span>
            <Tag tone="neutral">{settlements.length}</Tag>
          </button>

          {showHistory && (
            <ul className="mt-2 space-y-1.5">
              {settlements.length === 0 ? (
                <li className="px-1 py-3 text-center text-[13px] text-faint">Nothing settled yet.</li>
              ) : (
                settlements.map(settlement => (
                  <li
                    key={settlement.id}
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="clip text-[13px] font-semibold text-ink">
                        {settlement.fromName} → {settlement.toName}
                      </p>
                      <p className="text-[11.5px] text-faint">
                        {formatDateTime(settlement.createdAt)}
                        {settlement.recordedByName && ` · by ${settlement.recordedByName}`}
                        {settlement.note && ` · ${settlement.note}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13.5px] font-bold text-positive tnum">
                      {formatMoney(settlement.amount)}
                    </span>
                    {(settlement.recordedBy === currentUserId || group.ownerId === currentUserId) && (
                      <button
                        type="button"
                        onClick={() => void undo(settlement)}
                        disabled={busyKey === settlement.id}
                        aria-label="Undo this settlement"
                        className="tap size-9 shrink-0 rounded-lg text-faint hover:bg-surface-2 hover:text-negative"
                      >
                        <Undo2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  );
}
