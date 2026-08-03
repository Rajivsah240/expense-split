/**
 * History and search. Filtering runs on the server so it stays fast whether the
 * group has twenty sessions or twenty thousand, and results page in on demand.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { CATEGORY_EMOJI } from '@shared/categories';
import { CATEGORIES, type Category, type Member, type Session } from '@shared/types';
import { api } from '../lib/api';
import { formatDayLabel, formatMoney } from '../lib/format';
import { SessionCard, groupSessionsByDay } from '../components/SessionCard';
import { Button, Chip, EmptyState, Field, IconButton, Sheet, Spinner, Tag } from '../components/ui';

interface Filters {
  q: string;
  payer: string;
  member: string;
  category: Category | '';
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: '', payer: '', member: '', category: '', from: '', to: '' };

function activeFilterCount(filters: Filters): number {
  return (
    (filters.payer ? 1 : 0) +
    (filters.member ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)
  );
}

interface HistoryTabProps {
  groupId: string;
  members: Member[];
  currentUserId: string;
  revision: number;
  onOpenSession: (session: Session) => void;
}

export function HistoryTab({ groupId, members, currentUserId, revision, onOpenSession }: HistoryTabProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(filters.q.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const queryFor = useCallback(
    (nextCursor: string) => ({
      q: debouncedQuery,
      payer: filters.payer,
      member: filters.member,
      category: filters.category,
      from: filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : '',
      to: filters.to ? new Date(`${filters.to}T00:00:00`).getTime() : '',
      cursor: nextCursor,
      limit: 25,
    }),
    [debouncedQuery, filters.payer, filters.member, filters.category, filters.from, filters.to]
  );

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await api<{ sessions: Session[]; nextCursor: string }>(`groups/${groupId}/sessions`, {
        query: queryFor(''),
      });
      if (id !== requestId.current) return;
      setSessions(result.sessions);
      setCursor(result.nextCursor);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : 'Could not load history.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [groupId, queryFor]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api<{ sessions: Session[]; nextCursor: string }>(`groups/${groupId}/sessions`, {
        query: queryFor(cursor),
      });
      setSessions(current => [...current, ...result.sessions]);
      setCursor(result.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  };

  const days = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const filterCount = activeFilterCount(filters);
  const shownTotal = sessions.reduce((sum, session) => sum + session.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={filters.q}
            onChange={event => setFilters({ ...filters, q: event.target.value })}
            placeholder="Search items, shops, notes, people"
            className="field h-11 py-0 pl-11 pr-10 text-[14px]"
            enterKeyHint="search"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, q: '' })}
              aria-label="Clear search"
              className="tap absolute right-0 top-0 size-11 text-faint"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <IconButton
          label="Filters"
          onClick={() => setShowFilters(true)}
          className={`relative size-11 border ${
            filterCount > 0 ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-surface'
          }`}
        >
          <SlidersHorizontal className="size-[18px]" />
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {filterCount}
            </span>
          )}
        </IconButton>
      </div>

      {filterCount > 0 && (
        <div className="scroll-x flex items-center gap-1.5">
          {filters.payer && (
            <Chip active onClick={() => setFilters({ ...filters, payer: '' })}>
              Paid by {members.find(m => m.userId === filters.payer)?.displayName ?? '—'}
              <X className="size-3" />
            </Chip>
          )}
          {filters.member && (
            <Chip active onClick={() => setFilters({ ...filters, member: '' })}>
              Shared by {members.find(m => m.userId === filters.member)?.displayName ?? '—'}
              <X className="size-3" />
            </Chip>
          )}
          {filters.category && (
            <Chip active onClick={() => setFilters({ ...filters, category: '' })}>
              {CATEGORY_EMOJI[filters.category]} {filters.category}
              <X className="size-3" />
            </Chip>
          )}
          {(filters.from || filters.to) && (
            <Chip active onClick={() => setFilters({ ...filters, from: '', to: '' })}>
              {filters.from || 'any'} → {filters.to || 'now'}
              <X className="size-3" />
            </Chip>
          )}
          <button
            type="button"
            onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}
            className="shrink-0 whitespace-nowrap px-2 text-[12.5px] font-bold text-muted"
          >
            Clear all
          </button>
        </div>
      )}

      {(debouncedQuery || filterCount > 0) && !loading && (
        <p className="px-1 text-[12.5px] text-muted">
          {sessions.length === 0
            ? 'No matches'
            : `${sessions.length}${cursor ? '+' : ''} trip${sessions.length === 1 ? '' : 's'} · `}
          {sessions.length > 0 && <span className="font-bold text-ink tnum">{formatMoney(shownTotal)}</span>}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[13px] font-medium text-negative">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map(index => (
            <div key={index} className="skeleton h-[74px] rounded-[16px]" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Filter className="size-6" />}
          title={debouncedQuery || filterCount > 0 ? 'Nothing matches' : 'No history yet'}
          body={
            debouncedQuery || filterCount > 0
              ? 'Try a different search, or clear the filters.'
              : 'Expenses you add will show up here, newest first.'
          }
        />
      ) : (
        <div className="space-y-4">
          {days.map(({ day, sessions: daySessions }) => (
            <section key={day}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-faint">
                  {formatDayLabel(day)}
                </h3>
                <Tag tone="neutral">
                  <span className="tnum">
                    {formatMoney(daySessions.reduce((sum, session) => sum + session.total, 0))}
                  </span>
                </Tag>
              </div>
              <ul className="space-y-2.5">
                {daySessions.map(session => (
                  <li key={session.id}>
                    <SessionCard
                      session={session}
                      currentUserId={currentUserId}
                      onOpen={onOpenSession}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {cursor && (
            <Button variant="secondary" block loading={loadingMore} onClick={() => void loadMore()}>
              Load older trips
            </Button>
          )}
        </div>
      )}

      <Sheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
        subtitle="Narrow the history down."
        footer={
          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
              Reset
            </Button>
            <Button size="lg" block onClick={() => setShowFilters(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Paid by">
            <select
              value={filters.payer}
              onChange={event => setFilters({ ...filters, payer: event.target.value })}
              className="field"
            >
              <option value="">Anyone</option>
              {members.map(member => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Shared by" hint="Trips containing at least one item this person shares.">
            <select
              value={filters.member}
              onChange={event => setFilters({ ...filters, member: event.target.value })}
              className="field"
            >
              <option value="">Anyone</option>
              {members.map(member => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={filters.category === ''} onClick={() => setFilters({ ...filters, category: '' })}>
                All
              </Chip>
              {CATEGORIES.map(category => (
                <Chip
                  key={category}
                  active={filters.category === category}
                  onClick={() =>
                    setFilters({ ...filters, category: filters.category === category ? '' : category })
                  }
                >
                  {CATEGORY_EMOJI[category]} {category}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input
                type="date"
                value={filters.from}
                onChange={event => setFilters({ ...filters, from: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={filters.to}
                onChange={event => setFilters({ ...filters, to: event.target.value })}
                className="field"
              />
            </Field>
          </div>
        </div>
      </Sheet>

      {loadingMore && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}
    </div>
  );
}
