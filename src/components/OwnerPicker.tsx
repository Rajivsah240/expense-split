/**
 * Owner assignment, tuned for one-thumb speed: every member is a toggle chip
 * right there in the row, plus an "All" chip. No sheet, no dropdown, no
 * confirmation step — the fastest possible way to say who shares an item.
 */

import { Users } from 'lucide-react';
import type { Member } from '@shared/types';
import { initialsOf } from '../lib/format';

interface OwnerPickerProps {
  members: Member[];
  value: string[];
  onChange: (owners: string[]) => void;
  /** Compact mode drops the labels and shows initials only. */
  compact?: boolean;
  disabled?: boolean;
  /**
   * "wrap" keeps every member visible on a second line — the right choice inside
   * the review table, where a chip scrolled out of sight reads as a clipped bug.
   */
  layout?: 'wrap' | 'scroll';
}

export function OwnerPicker({
  members,
  value,
  onChange,
  compact = false,
  disabled = false,
  layout = 'scroll',
}: OwnerPickerProps) {
  const allSelected = members.length > 0 && members.every(member => value.includes(member.userId));

  const toggle = (userId: string) => {
    if (disabled) return;
    onChange(value.includes(userId) ? value.filter(id => id !== userId) : [...value, userId]);
  };

  return (
    <div
      className={`-mx-0.5 flex items-center gap-1.5 px-0.5 py-0.5 ${
        layout === 'wrap' ? 'flex-wrap' : 'scroll-x'
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(allSelected ? [] : members.map(member => member.userId))}
        aria-pressed={allSelected}
        className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] font-bold transition-colors disabled:opacity-50 ${
          allSelected
            ? 'border-brand bg-brand text-white'
            : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
        }`}
      >
        <Users className="size-3.5" />
        All
      </button>

      <span className="h-5 w-px shrink-0 bg-line" aria-hidden />

      {members.map(member => {
        const selected = value.includes(member.userId);
        return (
          <button
            key={member.userId}
            type="button"
            disabled={disabled}
            onClick={() => toggle(member.userId)}
            aria-pressed={selected}
            aria-label={member.displayName}
            title={member.displayName}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
              selected
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${
                selected ? 'bg-white/20 text-white' : 'bg-surface-2 text-muted'
              }`}
            >
              {initialsOf(member.displayName)}
            </span>
            {!compact && <span className="max-w-[9ch] truncate">{member.displayName}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Read-only summary of who shares an item, used in lists and detail views. */
export function OwnerSummary({
  members,
  owners,
  className = '',
}: {
  members: Member[];
  owners: string[];
  className?: string;
}) {
  if (members.length > 0 && owners.length === members.length) {
    return <span className={`text-[12px] font-semibold text-muted ${className}`}>Everyone</span>;
  }
  const names = owners
    .map(userId => members.find(member => member.userId === userId)?.displayName)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) {
    return <span className={`text-[12px] font-semibold text-warn ${className}`}>No one assigned</span>;
  }
  return <span className={`clip text-[12px] font-semibold text-muted ${className}`}>{names.join(', ')}</span>;
}
