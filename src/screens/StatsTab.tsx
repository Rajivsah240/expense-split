import { useCallback, useEffect, useState } from 'react';
import { BarChart3, CalendarDays, CalendarRange, Trophy } from 'lucide-react';
import { CATEGORY_COLOR, CATEGORY_EMOJI } from '@shared/categories';
import { isCategory } from '@shared/categories';
import type { GroupStats } from '@shared/types';
import { api } from '../lib/api';
import { BarChart, DonutChart, RankedBars, SplitBar } from '../components/Charts';
import { Button, Card, EmptyState, Field, SectionTitle, Segmented } from '../components/ui';
import { avatarColors, formatMoney, formatMoneyShort } from '../lib/format';

type Scope = 'mine' | 'group';
type PresetPeriod = 'today' | 'this-week' | 'this-month' | 'ytd';
type CustomPeriod = 'day' | 'week' | 'month' | 'year';
type Period = PresetPeriod | CustomPeriod;

const PRESETS: { value: PresetPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'ytd', label: 'Year to date' },
];

const CUSTOM_PERIODS: { value: CustomPeriod; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultAnchor(period: CustomPeriod): string {
  const today = localDayKey();
  if (period === 'year') return today.slice(0, 4);
  if (period === 'month') return today.slice(0, 7);
  return today;
}

function isCustomPeriod(period: Period): period is CustomPeriod {
  return period === 'day' || period === 'week' || period === 'month' || period === 'year';
}

interface StatsTabProps {
  groupId: string;
  revision: number;
}

export function StatsTab({ groupId, revision }: StatsTabProps) {
  const [scope, setScope] = useState<Scope>('mine');
  const [period, setPeriod] = useState<Period>('this-month');
  const [customPeriod, setCustomPeriod] = useState<CustomPeriod>('month');
  const [anchor, setAnchor] = useState(() => defaultAnchor('month'));
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setStats(null);
    try {
      setStats(
        await api<GroupStats>(`groups/${groupId}/stats`, {
          query: {
            scope,
            period,
            date: isCustomPeriod(period) ? anchor : '',
          },
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load insights.');
    } finally {
      setLoading(false);
    }
  }, [anchor, groupId, period, scope]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const choosePreset = (next: PresetPeriod) => {
    setPeriod(next);
    setShowCustomPicker(false);
  };

  const chooseCustomPeriod = (next: CustomPeriod) => {
    setCustomPeriod(next);
    setAnchor(defaultAnchor(next));
  };

  const applyCustomPeriod = () => {
    setPeriod(customPeriod);
    setShowCustomPicker(false);
  };

  const memberColor = (userId: string) => avatarColors(userId).fg;
  const categoryColor = (key: string) => (isCategory(key) ? CATEGORY_COLOR[key] : 'var(--color-brand)');
  const mine = scope === 'mine';

  if (loading && !stats) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(index => (
          <div key={index} className="skeleton h-[168px] rounded-[16px]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[13px] font-medium text-negative">
        {error}
      </p>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <p className="px-1 text-[12px] font-bold uppercase tracking-[0.07em] text-faint">Period</p>
        <div role="tablist" aria-label="Insights period" className="inset grid grid-cols-4 gap-1 p-1">
          {PRESETS.map(option => {
            const active = period === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => choosePreset(option.value)}
                className={`min-h-10 rounded-[9px] px-1 text-[10.5px] font-semibold leading-tight transition-all ${
                  active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowCustomPicker(current => !current)}
          className={`flex w-full items-center gap-2.5 rounded-[13px] border px-3.5 py-3 text-left transition-colors ${
            isCustomPeriod(period) || showCustomPicker
              ? 'border-brand-line bg-brand-soft text-brand-dark'
              : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
          }`}
        >
          <CalendarRange className="size-[18px] shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold">Choose another period</span>
            <span className="block truncate text-[11.5px] opacity-75">
              {isCustomPeriod(period) ? stats.range.label : 'View any day, week, month, or year'}
            </span>
          </span>
        </button>

        {showCustomPicker && (
          <Card className="space-y-3 p-3">
            <Segmented value={customPeriod} options={CUSTOM_PERIODS} onChange={chooseCustomPeriod} />
            <Field label={`Choose a ${customPeriod}`}>
              {customPeriod === 'year' ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min="2000"
                  max="2100"
                  value={anchor}
                  onChange={event => setAnchor(event.target.value.slice(0, 4))}
                  className="field"
                />
              ) : (
                <input
                  type={customPeriod === 'month' ? 'month' : 'date'}
                  value={anchor}
                  onChange={event => setAnchor(event.target.value)}
                  className="field"
                />
              )}
            </Field>
            <Button size="sm" block onClick={applyCustomPeriod}>
              View {customPeriod}
            </Button>
          </Card>
        )}
      </section>

      <section className="space-y-2.5">
        <Segmented
          value={scope}
          options={[
            { value: 'mine', label: 'My expenses' },
            { value: 'group', label: 'Group expenses' },
          ]}
          onChange={setScope}
        />
        <Card className="p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-faint">
                {mine ? 'Your expenses' : 'Group expenses'}
              </p>
              <p className="mt-1 text-[25px] font-extrabold text-ink tnum">{formatMoney(stats.total)}</p>
            </div>
            <p className="max-w-[15ch] text-right text-[11.5px] leading-relaxed text-faint">{stats.range.label}</p>
          </div>
          <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] leading-relaxed text-faint">
            {mine
              ? 'Your assigned share of group purchases, plus your private expenses. This is not the cash you paid.'
              : 'Shared group expenses only. Private expenses are never included.'}
          </p>
        </Card>
      </section>

      {stats.total === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-6" />}
          title="No expenses in this period"
          body="Choose another date range, or add an expense to start seeing your spending here."
        />
      ) : (
        <>
          <section>
            <SectionTitle>Spending over time</SectionTitle>
            <Card>
              <BarChart data={stats.timeline} />
            </Card>
          </section>

          <section>
            <SectionTitle>By category</SectionTitle>
            <Card>
              <DonutChart
                data={stats.byCategory.map(entry => ({
                  ...entry,
                  label: `${isCategory(entry.key) ? CATEGORY_EMOJI[entry.key] : ''} ${entry.label}`.trim(),
                }))}
                colorFor={categoryColor}
              />
            </Card>
          </section>

          {!mine && (
            <section>
              <SectionTitle>Group spending by person</SectionTitle>
              <Card>
                <RankedBars data={stats.byMember} colorFor={memberColor} emptyLabel="No assigned shares in this period" />
                <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-faint">
                  Each amount is that person’s assigned share of group purchases, not what they paid out.
                </p>
              </Card>
            </section>
          )}

          <section>
            <SectionTitle>Shared vs single-person items</SectionTitle>
            <Card>
              <SplitBar
                shared={stats.sharedVsSinglePerson.shared}
                singlePerson={stats.sharedVsSinglePerson.singlePerson}
              />
              <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-faint">
                {mine
                  ? 'Single-person items include purchases assigned only to you, including private expenses.'
                  : 'Single-person means an item was assigned to one group member.'}
              </p>
            </Card>
          </section>

          <section>
            <SectionTitle>Most bought</SectionTitle>
            <Card>
              {stats.topItems.length === 0 ? (
                <p className="py-3 text-center text-[13px] text-faint">Nothing yet</p>
              ) : (
                <ol className="divide-y divide-line">
                  {stats.topItems.map((item, index) => (
                    <li key={item.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          index === 0 ? 'bg-brand-soft text-brand-dark' : 'bg-surface-2 text-muted'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="clip flex-1 truncate text-[13.5px] font-semibold text-ink">{item.name}</span>
                      <span className="shrink-0 text-[12px] font-medium text-faint tnum">×{item.count}</span>
                      <span className="w-[68px] shrink-0 text-right text-[13px] font-bold text-muted tnum">
                        {formatMoneyShort(item.total)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle>Habits</SectionTitle>
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile icon={<BarChart3 className="size-3.5" />} label="Entries" value={String(stats.frequency.entryCount)} />
              <StatTile
                icon={<CalendarDays className="size-3.5" />}
                label="Days with expense"
                value={String(stats.frequency.activeDays)}
              />
              <StatTile icon={<Trophy className="size-3.5" />} label="Most active" value={stats.frequency.busiestWeekday.slice(0, 3)} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-flat p-3">
      <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-[18px] font-extrabold text-ink tnum">{value}</p>
    </div>
  );
}
