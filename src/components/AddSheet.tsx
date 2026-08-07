/**
 * The add-expense flow. Three ways in, one review step out:
 *
 *   Paste   — rule parser runs instantly on-device; only messy input costs an AI call
 *   Photo   — receipt goes to the AI extractor, downscaled first
 *   Manual  — a single row, for when you already know exactly what you're adding
 *
 * Every path lands on the same review table, and nothing is written until save.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Keyboard,
  Lock,
  MessageSquareText,
  ScanLine,
  Sparkles,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { parseAmount } from '@shared/money';
import { isConfident, parseExpenseText } from '@shared/parser';
import type { DraftItem, Group, Member, Session } from '@shared/types';
import { api } from '../lib/api';
import { toDateInput } from '../lib/format';
import { prepareReceiptImage } from '../lib/image';
import { DraftEditor, emptyDraftItem, validateDraft } from './DraftEditor';
import { Button, Field, Sheet, Spinner, Tag, useToast } from './ui';

type Mode = 'paste' | 'photo' | 'manual';
type Stage = 'input' | 'review';

const PLACEHOLDER = `Vegetables - 130/3
Milk - 100/3
Chocolate - 20 B
Chicken - 420 AR
Eggs=120 R
Rice 300 all`;

interface AddSheetProps {
  open: boolean;
  onClose: () => void;
  group: Group;
  members: Member[];
  currentUserId: string;
  onSaved: (session: Session) => void;
  onOpenWhatsapp: () => void;
}

export function AddSheet({
  open,
  onClose,
  group,
  members,
  currentUserId,
  onSaved,
  onOpenWhatsapp,
}: AddSheetProps) {
  const toast = useToast();
  const allIds = useMemo(() => members.map(member => member.userId), [members]);
  const myName = members.find(member => member.userId === currentUserId)?.displayName ?? 'You';

  const [mode, setMode] = useState<Mode>('paste');
  const [stage, setStage] = useState<Stage>('input');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');

  const [text, setText] = useState('');
  const [image, setImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [shop, setShop] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toDateInput(Date.now()));
  const [usedAi, setUsedAi] = useState(false);
  const [visibility, setVisibility] = useState<'group' | 'private'>('group');
  const privateMembers = useMemo(
    () => members.filter(member => member.userId === currentUserId),
    [members, currentUserId]
  );

  const reset = () => {
    setMode('paste');
    setStage('input');
    setBusy(false);
    setBusyLabel('');
    setError('');
    setText('');
    setImage(null);
    setItems([]);
    setShop('');
    setNotes('');
    setDate(toDateInput(Date.now()));
    setUsedAi(false);
    setVisibility('group');
  };

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startManual = () => {
    setMode('manual');
    setItems([emptyDraftItem(allIds)]);
    setStage('review');
  };

  const reviewPastedText = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setBusy(true);
    setError('');
    try {
      // On-device first. Most WhatsApp-style lists never need the network.
      const local = parseExpenseText(trimmed, {
        members,
        payerId: currentUserId,
        assumeSharedWhenUnspecified: group.settings.assumeSharedWhenUnspecified,
      });


      if (isConfident(local)) {
        setItems(
          local.rows.map(row => ({
            id: `${row.name}-${row.amount}-${Math.random().toString(36).slice(2, 7)}`,
            name: row.name,
            amount: (row.amount / 100).toString(),
            owners: row.owners,
            category: row.category,
            assumed: row.assumed,
            needsOwners: row.needsOwners,
            reason: row.reason,
          }))
        );
        if (local.shop) setShop(local.shop);
        setUsedAi(false);
        setStage('review');
        return;
      }

      setBusyLabel('Reading it with AI…');
      const result = await api<{ shop: string; items: DraftItem[]; usedAi: boolean; warning?: string }>(
        `groups/${group.id}/ai/text`,
        { method: 'POST', body: { text: trimmed, payerId: currentUserId } }
      );

      if (result.items.length === 0) {
        setError("Couldn't find any items in that. Try one item per line, like \"Milk - 100/3\".");
        return;
      }

      setItems(result.items);
      if (result.shop) setShop(result.shop);
      setUsedAi(result.usedAi);
      if (result.warning) toast(result.warning, 'info');
      setStage('review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that text.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const prepared = await prepareReceiptImage(file);
      setImage({ dataUrl: prepared.dataUrl, mimeType: prepared.mimeType });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that image.');
    }
  };

  const scanReceipt = async () => {
    if (!image) return;
    setBusy(true);
    setBusyLabel('Reading the receipt…');
    setError('');
    try {
      const result = await api<{ shop: string; date: string; items: DraftItem[] }>(
        `groups/${group.id}/ai/receipt`,
        { method: 'POST', body: { imageBase64: image.dataUrl, mimeType: image.mimeType, payerId: currentUserId } }
      );

      if (result.items.length === 0) {
        setError("Couldn't read any items off that photo. Try a straighter, brighter shot.");
        return;
      }

      setItems(result.items);
      if (result.shop) setShop(result.shop);
      if (/^\d{4}-\d{2}-\d{2}$/.test(result.date)) setDate(result.date);
      setUsedAi(true);
      setStage('review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not scan that receipt.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const validity = useMemo(() => validateDraft(items), [items]);

  const changeVisibility = (next: 'group' | 'private') => {
    setVisibility(next);
    if (next === 'private') {
      setItems(current =>
        current.map(item => ({
          ...item,
          owners: [currentUserId],
          assumed: false,
          needsOwners: false,
          reason: '',
        }))
      );
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = items
        .map(item => ({
          name: item.name.trim(),
          amount: parseAmount(item.amount) ?? 0,
          owners: item.owners,
          category: item.category,
        }))
        .filter(item => item.name && item.amount > 0);

      const result = await api<{ session: Session }>(`groups/${group.id}/sessions`, {
        method: 'POST',
        body: {
          date,
          shop: shop.trim(),
          notes: notes.trim(),
          paidBy: currentUserId,
          items: payload,
          source: mode === 'manual' ? 'manual' : mode === 'photo' ? 'receipt' : 'text',
          visibility,
        },
      });

      onSaved(result.session);
      toast(
        visibility === 'private'
          ? 'Saved privately. Only you can see it.'
          : `Saved ${payload.length} item${payload.length === 1 ? '' : 's'}.`,
        'success'
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this.');
    } finally {
      setBusy(false);
    }
  };

  const footer =
    stage === 'review' ? (
      <div className="flex gap-2.5">
        {mode !== 'manual' && (
          <Button variant="secondary" size="lg" onClick={() => setStage('input')} icon={<ArrowLeft className="size-4" />}>
            Back
          </Button>
        )}
        <Button
          size="lg"
          block
          loading={busy}
          disabled={!validity.canSave}
          onClick={() => void save()}
        >
          {validity.blocking > 0 ? 'Assign owners to save' : visibility === 'private' ? 'Save privately' : 'Save to group'}
        </Button>
      </div>
    ) : mode === 'paste' ? (
      <Button
        size="lg"
        block
        loading={busy}
        disabled={!text.trim()}
        onClick={() => void reviewPastedText()}
        icon={<Wand2 className="size-[18px]" />}
      >
        {busyLabel || 'Review items'}
      </Button>
    ) : (
      <Button
        size="lg"
        block
        loading={busy}
        disabled={!image}
        onClick={() => void scanReceipt()}
        icon={<ScanLine className="size-[18px]" />}
      >
        {busyLabel || 'Scan receipt'}
      </Button>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="tall"
      title={stage === 'review' ? 'Check and save' : 'Add expenses'}
      subtitle={
        stage === 'review'
          ? 'Edit anything before it hits the ledger.'
          : group.name
      }
      footer={footer}
    >
      <AnimatePresence mode="wait" initial={false}>
        {stage === 'input' ? (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-2">
              <ModeButton
                active={mode === 'paste'}
                icon={<MessageSquareText className="size-[19px]" />}
                label="Paste"
                onClick={() => setMode('paste')}
              />
              <ModeButton
                active={mode === 'photo'}
                icon={<Camera className="size-[19px]" />}
                label="Receipt"
                onClick={() => setMode('photo')}
              />
              <ModeButton
                active={false}
                icon={<Keyboard className="size-[19px]" />}
                label="Manual"
                onClick={startManual}
              />
            </div>

            {mode === 'paste' ? (
              <>
                <Field
                  label="What did you buy?"
                  hint="Write it exactly the way you'd send it in the group. Initials, brackets, slashes and typos are all fine."
                >
                  <textarea
                    value={text}
                    onChange={event => setText(event.target.value)}
                    placeholder={PLACEHOLDER}
                    rows={8}
                    className="field resize-y font-mono text-[14px] leading-relaxed"
                    autoFocus
                  />
                </Field>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWhatsapp();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[13px] border border-line bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-brand-line"
                >
                  <Sparkles className="size-[18px] shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-ink">Import a whole chat</span>
                    <span className="block text-[12px] text-muted">
                      Paste days of WhatsApp messages and get grouped shopping sessions.
                    </span>
                  </span>
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={event => void pickImage(event.target.files?.[0])}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={event => void pickImage(event.target.files?.[0])}
                />

                {image ? (
                  <div className="relative overflow-hidden rounded-[14px] border border-line">
                    <img src={image.dataUrl} alt="Receipt preview" className="max-h-[46dvh] w-full object-contain bg-surface-2" />
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      aria-label="Remove photo"
                      className="tap absolute right-2 top-2 rounded-full bg-ink/70 text-white backdrop-blur"
                    >
                      <X className="size-[18px]" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className="flex h-[104px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong bg-surface-2 text-muted transition-colors hover:border-brand hover:text-brand"
                    >
                      <Camera className="size-6" />
                      <span className="text-[13px] font-semibold">Take a photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex h-[104px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong bg-surface-2 text-muted transition-colors hover:border-brand hover:text-brand"
                    >
                      <ImageIcon className="size-6" />
                      <span className="text-[13px] font-semibold">Choose a file</span>
                    </button>
                  </div>
                )}

                <p className="px-1 text-[12px] leading-relaxed text-faint">
                  Receipts don't say who owns what, so everything starts as shared by everyone. You'll set
                  owners on the next screen before anything is saved.
                </p>
              </div>
            )}

            <PayerAndDate payerName={myName} date={date} onDate={setDate} />

            {busyLabel && (
              <div className="flex items-center justify-center gap-2 py-1 text-[13px] font-medium text-muted">
                <Spinner className="size-4" />
                {busyLabel}
              </div>
            )}

            {error && <ErrorNote>{error}</ErrorNote>}
          </motion.div>
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {usedAi && (
              <div className="flex items-center gap-2">
                <Tag tone="brand">
                  <Sparkles className="size-3" />
                  Read with AI
                </Tag>
                <span className="text-[12px] text-faint">Amounts are yours to verify.</span>
              </div>
            )}


            <section className="space-y-2">
              <p className="px-0.5 text-[13px] font-semibold text-ink">Who can see this?</p>
              <div className="inset flex gap-1 p-1" role="tablist" aria-label="Expense visibility">
                <button
                  type="button"
                  role="tab"
                  aria-selected={visibility === 'group'}
                  onClick={() => changeVisibility('group')}
                  className={`flex min-h-12 flex-1 items-center justify-center rounded-[10px] px-2 text-[12.5px] font-semibold transition-all ${
                    visibility === 'group' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  Share with group
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={visibility === 'private'}
                  onClick={() => changeVisibility('private')}
                  className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[12.5px] font-semibold transition-all ${
                    visibility === 'private' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Lock className="size-3.5" />
                  Private to me
                </button>
              </div>
              {visibility === 'private' && (
                <p className="rounded-xl border border-brand-line bg-brand-soft px-3 py-2.5 text-[12px] leading-relaxed text-brand-dark">
                  Only you can see this in History and Insights. It will not affect group totals, balances, or anyone else’s history.
                </p>
              )}
            </section>

            <DraftEditor
              items={items}
              members={visibility === 'private' && privateMembers.length ? privateMembers : members}
              onChange={setItems}
            />

            <PayerAndDate payerName={myName} date={date} onDate={setDate} />

            <div className="grid grid-cols-1 gap-3">
              <Field label="Shop (optional)">
                <input
                  type="text"
                  value={shop}
                  onChange={event => setShop(event.target.value)}
                  placeholder="Reliance Fresh"
                  className="field"
                  maxLength={80}
                />
              </Field>
              <Field label="Notes (optional)">
                <input
                  type="text"
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  placeholder="Weekly groceries"
                  className="field"
                  maxLength={500}
                />
              </Field>
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-[14px] border text-[12.5px] font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand-soft text-brand-dark'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * You are always the payer for anything you add — everyone records their own
 * purchases, so there is no picker to get wrong. The payer is shown, not chosen.
 */
export function PayerAndDate({
  payerName,
  date,
  onDate,
}: {
  payerName: string;
  date: string;
  onDate: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Paid by">
        <div className="field flex items-center gap-2 bg-surface-2 text-muted">
          <Wallet className="size-4 shrink-0 text-faint" />
          <span className="truncate font-semibold text-ink">{payerName}</span>
        </div>
      </Field>
      <Field label="Date">
        <input
          type="date"
          value={date}
          onChange={event => onDate(event.target.value)}
          max={toDateInput(Date.now() + 24 * 60 * 60 * 1000)}
          className="field"
        />
      </Field>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-snug text-negative">
      {children}
    </p>
  );
}
