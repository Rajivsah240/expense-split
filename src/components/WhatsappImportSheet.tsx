/**
 * WhatsApp chat import: paste a whole conversation, get back proposed shopping
 * sessions with the chatter stripped out. Each proposal is reviewed and can be
 * edited or excluded, and only the ones you tick are written.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { parseAmount } from '@shared/money';
import type { DraftItem, Group, Member, Session } from '@shared/types';
import { api } from '../lib/api';
import { formatMoney, toDateInput } from '../lib/format';
import { DraftEditor, validateDraft } from './DraftEditor';
import { ErrorNote } from './AddSheet';
import { Button, Field, Sheet, Tag, useToast } from './ui';

interface Proposal {
  key: string;
  include: boolean;
  expanded: boolean;
  date: string;
  shop: string;
  paidBy: string;
  payerName: string;
  items: DraftItem[];
}

interface WhatsappImportSheetProps {
  open: boolean;
  onClose: () => void;
  group: Group;
  members: Member[];
  currentUserId: string;
  onImported: (sessions: Session[]) => void;
}

export function WhatsappImportSheet({
  open,
  onClose,
  group,
  members,
  currentUserId,
  onImported,
}: WhatsappImportSheetProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setText('');
    setProposals(null);
    setBusy(false);
    setProgress('');
    setError('');
  };

  const analyse = async () => {
    setBusy(true);
    setError('');
    setProgress('Reading the conversation…');
    try {
      const result = await api<{
        sessions: { date: string; shop: string; payerId: string; payerName: string; items: DraftItem[] }[];
      }>(`groups/${group.id}/ai/whatsapp`, { method: 'POST', body: { text: text.trim() } });

      if (result.sessions.length === 0) {
        setError('No expense messages were found in that conversation.');
        return;
      }

      setProposals(
        result.sessions.map((session, index) => ({
          key: `proposal_${index}`,
          include: true,
          expanded: false,
          date: /^\d{4}-\d{2}-\d{2}$/.test(session.date) ? session.date : toDateInput(Date.now()),
          shop: session.shop,
          paidBy: session.payerId || currentUserId,
          payerName: session.payerName,
          items: session.items,
        }))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that conversation.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const update = (key: string, patch: Partial<Proposal>) => {
    setProposals(current => current?.map(entry => (entry.key === key ? { ...entry, ...patch } : entry)) ?? null);
  };

  const summary = useMemo(() => {
    const selected = (proposals ?? []).filter(entry => entry.include);
    let total = 0;
    let blocking = 0;
    for (const entry of selected) {
      const validity = validateDraft(entry.items);
      total += validity.total;
      blocking += validity.blocking;
    }
    return { count: selected.length, total, blocking };
  }, [proposals]);

  const importSelected = async () => {
    if (!proposals) return;
    const selected = proposals.filter(entry => entry.include);
    setBusy(true);
    setError('');

    const saved: Session[] = [];
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index];
        setProgress(`Saving trip ${index + 1} of ${selected.length}…`);
        const payload = entry.items
          .map(item => ({
            name: item.name.trim(),
            amount: parseAmount(item.amount) ?? 0,
            owners: item.owners,
            category: item.category,
          }))
          .filter(item => item.name && item.amount > 0);
        if (payload.length === 0) continue;

        const result = await api<{ session: Session }>(`groups/${group.id}/sessions`, {
          method: 'POST',
          body: {
            date: entry.date,
            shop: entry.shop,
            notes: 'Imported from WhatsApp',
            paidBy: entry.paidBy,
            items: payload,
            source: 'whatsapp',
          },
        });
        saved.push(result.session);
      }

      onImported(saved);
      toast(`Imported ${saved.length} shopping trip${saved.length === 1 ? '' : 's'}.`, 'success');
      onClose();
      reset();
    } catch (caught) {
      setError(
        `${caught instanceof Error ? caught.message : 'Import failed.'}${
          saved.length ? ` ${saved.length} trip(s) were already saved.` : ''
        }`
      );
      if (saved.length) onImported(saved);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      size="tall"
      title="Import from WhatsApp"
      subtitle={proposals ? `${proposals.length} shopping trip${proposals.length === 1 ? '' : 's'} found` : group.name}
      footer={
        proposals ? (
          <Button
            size="lg"
            block
            loading={busy}
            disabled={summary.count === 0 || summary.blocking > 0}
            onClick={() => void importSelected()}
          >
            {progress ||
              (summary.blocking > 0
                ? `Fix ${summary.blocking} item${summary.blocking === 1 ? '' : 's'} to import`
                : `Import ${summary.count} trip${summary.count === 1 ? '' : 's'} · ${formatMoney(summary.total)}`)}
          </Button>
        ) : (
          <Button
            size="lg"
            block
            loading={busy}
            disabled={text.trim().length < 20}
            onClick={() => void analyse()}
            icon={<Sparkles className="size-[18px]" />}
          >
            {progress || 'Find the expenses'}
          </Button>
        )
      }
    >
      {!proposals ? (
        <div className="space-y-4">
          <Field
            label="Paste the conversation"
            hint="Open the chat, tap ⋮ → More → Export chat → Without media, then paste it here. Ordinary chat is ignored."
          >
            <textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={`[02/08/26, 9:12 pm] Ashutosh: Vegetables - 130/3\n[02/08/26, 9:12 pm] Ashutosh: Chocolate - 20 B\n[02/08/26, 9:15 pm] Rajiv: ok`}
              rows={12}
              className="field resize-y font-mono text-[13px] leading-relaxed"
              autoFocus
            />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map(entry => {
            const validity = validateDraft(entry.items);
            return (
              <div
                key={entry.key}
                className={`rounded-[15px] border transition-colors ${
                  entry.include ? 'border-line bg-surface' : 'border-line bg-surface-2 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => update(entry.key, { include: !entry.include })}
                    aria-pressed={entry.include}
                    aria-label={entry.include ? 'Exclude this trip' : 'Include this trip'}
                    className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors ${
                      entry.include ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface'
                    }`}
                  >
                    {entry.include && <Check className="size-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="clip text-[14px] font-bold text-ink">
                        {entry.shop || 'Shopping trip'}
                      </span>
                      {validity.blocking > 0 && (
                        <Tag tone="warn">
                          <AlertTriangle className="size-3" />
                          {validity.blocking}
                        </Tag>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {entry.items.length} item{entry.items.length === 1 ? '' : 's'} ·{' '}
                      <span className="tnum font-semibold">{formatMoney(validity.total)}</span>
                      {entry.payerName && ` · ${entry.payerName}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => update(entry.key, { expanded: !entry.expanded })}
                    className="tap -mr-1 -mt-1 shrink-0 rounded-xl text-muted hover:bg-surface-2"
                    aria-label={entry.expanded ? 'Hide items' : 'Show items'}
                  >
                    {entry.expanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                  </button>
                </div>

                {entry.expanded && (
                  <div className="space-y-3 border-t border-line p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Paid by">
                        <select
                          value={entry.paidBy}
                          onChange={event => update(entry.key, { paidBy: event.target.value })}
                          className="field"
                        >
                          {members.map(member => (
                            <option key={member.userId} value={member.userId}>
                              {member.displayName}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Date">
                        <input
                          type="date"
                          value={entry.date}
                          onChange={event => update(entry.key, { date: event.target.value })}
                          className="field"
                        />
                      </Field>
                    </div>
                    <Field label="Shop">
                      <input
                        type="text"
                        value={entry.shop}
                        onChange={event => update(entry.key, { shop: event.target.value })}
                        placeholder="Optional"
                        className="field"
                      />
                    </Field>
                    <DraftEditor
                      items={entry.items}
                      members={members}
                      onChange={items => update(entry.key, { items })}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {error && <ErrorNote>{error}</ErrorNote>}

          <button
            type="button"
            onClick={() => setProposals(null)}
            className="w-full py-2 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Start over with different text
          </button>
        </div>
      )}
    </Sheet>
  );
}
