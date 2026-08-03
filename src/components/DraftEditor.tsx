/**
 * The review table shown before anything is written to the ledger.
 *
 * Two kinds of flag exist, and the difference matters:
 *   - `assumed`  — no owners were named, so everyone was filled in. Visible, editable, saveable.
 *   - `needsOwners` — ownership could not be read. Highlighted and BLOCKS saving.
 * Nothing reaches the database without the user pressing save on this screen.
 */

import { useMemo } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_EMOJI } from '@shared/categories';
import { CATEGORIES, type Category, type DraftItem, type Member } from '@shared/types';
import { parseAmount } from '@shared/money';
import { formatMoney } from '../lib/format';
import { OwnerPicker } from './OwnerPicker';
import { IconButton, Tag } from './ui';

let sequence = 0;
export const newDraftId = () => `draft_${Date.now().toString(36)}_${(sequence += 1).toString(36)}`;

export function emptyDraftItem(owners: string[]): DraftItem {
  return {
    id: newDraftId(),
    name: '',
    amount: '',
    owners,
    category: 'Miscellaneous',
    assumed: false,
    needsOwners: false,
    reason: '',
  };
}

export interface DraftValidity {
  total: number;
  blocking: number;
  emptyRows: number;
  canSave: boolean;
}

export function validateDraft(items: DraftItem[]): DraftValidity {
  let total = 0;
  let blocking = 0;
  let emptyRows = 0;

  for (const item of items) {
    const amount = parseAmount(item.amount);
    const named = item.name.trim().length > 0;
    if (!named || amount === null || amount <= 0) {
      emptyRows += 1;
      continue;
    }
    total += amount;
    if (item.needsOwners || item.owners.length === 0) blocking += 1;
  }

  const usable = items.length - emptyRows;
  return { total, blocking, emptyRows, canSave: usable > 0 && blocking === 0 };
}

interface DraftEditorProps {
  items: DraftItem[];
  members: Member[];
  onChange: (items: DraftItem[]) => void;
}

export function DraftEditor({ items, members, onChange }: DraftEditorProps) {
  const validity = useMemo(() => validateDraft(items), [items]);

  const update = (id: string, patch: Partial<DraftItem>) => {
    onChange(items.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const remove = (id: string) => onChange(items.filter(item => item.id !== id));

  const add = () => onChange([...items, emptyDraftItem(members.map(member => member.userId))]);

  return (
    <div className="space-y-2.5">
      {validity.blocking > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-3 py-2.5">
          <AlertTriangle className="mt-px size-4 shrink-0 text-warn" />
          <p className="text-[12.5px] font-medium leading-snug text-warn">
            {validity.blocking === 1
              ? 'One item needs you to choose who shares it.'
              : `${validity.blocking} items need you to choose who shares them.`}{' '}
            Nothing is saved until you do.
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {items.map(item => {
          const amount = parseAmount(item.amount);
          const blocked = item.needsOwners || item.owners.length === 0;
          const share =
            amount !== null && amount > 0 && item.owners.length > 0
              ? Math.trunc(amount / item.owners.length)
              : 0;

          return (
            <li
              key={item.id}
              className={`rounded-[14px] border bg-surface p-2.5 transition-colors ${
                blocked ? 'border-warn-line bg-warn-soft/40' : 'border-line'
              }`}
            >
              <div className="flex items-start gap-2">
                <select
                  value={item.category}
                  onChange={event => update(item.id, { category: event.target.value as Category })}
                  aria-label="Category"
                  className="h-11 w-[52px] shrink-0 appearance-none rounded-[11px] border border-line bg-surface-2 text-center text-[19px]"
                  style={{ backgroundImage: 'none' }}
                >
                  {CATEGORIES.map(category => (
                    <option key={category} value={category}>
                      {CATEGORY_EMOJI[category]}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={item.name}
                  onChange={event => update(item.id, { name: event.target.value })}
                  placeholder="Item name"
                  className="field h-11 min-w-0 flex-1 px-3 py-0 text-[15px] font-medium"
                  maxLength={120}
                />

                <div className="relative w-[92px] shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-faint">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={event =>
                      update(item.id, { amount: event.target.value.replace(/[^\d.]/g, '').slice(0, 10) })
                    }
                    placeholder="0"
                    aria-label="Amount"
                    className="field h-11 py-0 pl-6 pr-2 text-right text-[15px] font-bold tnum"
                  />
                </div>

                <IconButton
                  label={`Remove ${item.name || 'item'}`}
                  onClick={() => remove(item.id)}
                  className="size-11 shrink-0 hover:text-negative"
                >
                  <Trash2 className="size-[17px]" />
                </IconButton>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <OwnerPicker
                  members={members}
                  layout="wrap"
                  value={item.owners}
                  onChange={owners =>
                    update(item.id, {
                      owners,
                      // Choosing owners resolves both flags — it is now an explicit answer.
                      needsOwners: owners.length === 0,
                      assumed: false,
                      reason: owners.length === 0 ? 'Choose who shares this item.' : '',
                    })
                  }
                />
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-0.5">
                {blocked ? (
                  <Tag tone="warn">
                    <AlertTriangle className="size-3" />
                    {item.reason || 'Who shares this?'}
                  </Tag>
                ) : item.assumed ? (
                  <Tag tone="neutral">Assumed shared by all</Tag>
                ) : null}

                {share > 0 && item.owners.length > 1 && (
                  <span className="text-[11.5px] font-medium text-faint tnum">
                    ≈ {formatMoney(share)} each
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={add}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[13px] border border-dashed border-line-strong text-[13.5px] font-semibold text-muted transition-colors hover:border-brand hover:text-brand"
      >
        <Plus className="size-4" />
        Add another item
      </button>

      <div className="flex items-center justify-between rounded-[13px] bg-surface-2 px-3.5 py-3">
        <span className="text-[13px] font-semibold text-muted">
          {items.length - validity.emptyRows} item{items.length - validity.emptyRows === 1 ? '' : 's'}
          {validity.emptyRows > 0 && <span className="text-faint"> · {validity.emptyRows} incomplete</span>}
        </span>
        <span className="text-[17px] font-extrabold text-ink tnum">{formatMoney(validity.total)}</span>
      </div>
    </div>
  );
}
