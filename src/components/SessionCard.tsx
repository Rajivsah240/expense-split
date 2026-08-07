import { ChevronRight, Lock } from 'lucide-react';
import { CATEGORY_EMOJI } from '@shared/categories';
import type { Session } from '@shared/types';
import { formatMoney } from '../lib/format';
import { Avatar } from './ui';

export function SessionCard({
  session,
  currentUserId,
  onOpen,
}: {
  session: Session;
  currentUserId: string;
  onOpen: (session: Session) => void;
}) {
  const myShare = session.shares[currentUserId] ?? 0;
  const paidByMe = session.paidBy === currentUserId;
  const categories = [...new Set(session.items.map(item => item.category))].slice(0, 3);
  const preview = session.items.map(item => item.name).join(', ');

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-line-strong active:bg-surface-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-[17px]">
        {categories.length === 1 ? CATEGORY_EMOJI[categories[0]] : '🧾'}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="clip text-[14.5px] font-bold leading-tight text-ink">
            {session.shop || `${session.items.length} item${session.items.length === 1 ? '' : 's'}`}
          </span>
          {session.visibility === 'private' && <Lock className="size-3.5 shrink-0 text-brand" aria-label="Private expense" />}
        </span>
        <span className="clip mt-0.5 block truncate text-[12.5px] text-muted">{preview}</span>
        <span className="mt-1.5 flex items-center gap-1.5">
          {session.visibility === 'private' ? (
            <>
              <Lock className="size-[15px] text-brand" />
              <span className="text-[11.5px] font-medium text-brand-dark">Private expense</span>
            </>
          ) : (
            <>
              <Avatar name={session.paidByName || 'Member'} userId={session.paidBy} size={18} />
              <span className="text-[11.5px] font-medium text-faint">
                {paidByMe ? 'You paid' : `${session.paidByName || 'Member'} paid`}
              </span>
            </>
          )}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-extrabold leading-tight text-ink tnum">
          {formatMoney(session.total)}
        </span>
        {myShare > 0 && (
          <span className="mt-0.5 block text-[11.5px] font-medium text-muted tnum">
            your {formatMoney(myShare)}
          </span>
        )}
      </span>

      <ChevronRight className="size-[18px] shrink-0 text-faint" />
    </button>
  );
}

/** Groups sessions under "Today" / "Yesterday" / date headers. */
export function groupSessionsByDay(sessions: Session[]): { day: number; sessions: Session[] }[] {
  const buckets = new Map<number, Session[]>();
  for (const session of sessions) {
    const date = new Date(session.date);
    date.setHours(0, 0, 0, 0);
    const key = date.getTime();
    const bucket = buckets.get(key) ?? [];
    bucket.push(session);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, entries]) => ({ day, sessions: entries }));
}
