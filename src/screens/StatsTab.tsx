import { useCallback, useEffect, useState } from 'react';
import { BarChart3, CalendarDays, Repeat, Trophy } from 'lucide-react';
import { CATEGORY_COLOR, CATEGORY_EMOJI } from '@shared/categories';
import { isCategory } from '@shared/categories';
import type { GroupStats, Member } from '@shared/types';
import { api } from '../lib/api';
import { BarChart, ContributionLines, DonutChart, RankedBars, SplitBar } from '../components/Charts';
import { Card, EmptyState, SectionTitle, Segmented } from '../components/ui';
import { avatarColors, formatMoney, formatMoneyShort } from '../lib/format';

const RANGES = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
] as const;

interface StatsTabProps {
  groupId: string;
  members: Member[];
  revision: number;
}

export function StatsTab({ groupId, members, revision }: StatsTabProps) {
  const [months, setMonths] = useState<'3' | '6' | '12'>('6');
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await api<GroupStats>(`groups/${groupId}/stats`, { query: { months } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load insights.');
    } finally {
      setLoading(false);
    }
  }, [groupId, months]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const memberColor = (userId: string) => avatarColors(userId).fg;
  const categoryColor = (key: string) => (isCategory(key) ? CATEGORY_COLOR[key] : 'var(--color-brand)');

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

  const spendTotal = stats.byMember.reduce((sum, entry) => sum + entry.value, 0);
  if (spendTotal === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-6" />}
        title="No insights yet"
        body="Once you've recorded a few shopping trips, monthly trends, category splits and per-person figures show up here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Segmented
        value={months}
        options={RANGES.map(range => ({ value: range.value, label: range.label }))}
        onChange={setMonths}
      />

      <section>
        <SectionTitle>Monthly spending</SectionTitle>
        <Card>
          <BarChart data={stats.monthly} />
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

      <section>
        <SectionTitle>Consumed per person</SectionTitle>
        <Card>
          <RankedBars data={stats.byMember} colorFor={memberColor} />
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-faint">
            This is each person's share of everything bought — not what they paid out.
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Shared vs personal</SectionTitle>
        <Card>
          <SplitBar shared={stats.sharedVsPersonal.shared} personal={stats.sharedVsPersonal.personal} />
          {stats.personalByMember.length > 0 && (
            <div className="mt-4 border-t border-line pt-3.5">
              <p className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-faint">
                Personal buys
              </p>
              <RankedBars data={stats.personalByMember} colorFor={memberColor} />
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Who paid, over time</SectionTitle>
        <Card>
          <ContributionLines
            series={stats.contributionByMember.map(entry => ({
              userId: entry.userId,
              label: members.find(member => member.userId === entry.userId)?.displayName ?? 'Member',
              values: entry.monthly.map(bucket => bucket.value),
            }))}
            labels={stats.monthly.map(bucket => bucket.label)}
            colorFor={memberColor}
          />
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
          <StatTile
            icon={<Repeat className="size-3.5" />}
            label="Per week"
            value={stats.frequency.sessionsPerWeek.toFixed(1)}
          />
          <StatTile
            icon={<CalendarDays className="size-3.5" />}
            label="Shop days"
            value={String(stats.frequency.activeDays)}
          />
          <StatTile
            icon={<Trophy className="size-3.5" />}
            label="Busiest"
            value={stats.frequency.busiestWeekday.slice(0, 3)}
          />
        </div>
      </section>

      <section className="card-flat p-3.5">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-faint">Group total</p>
        <p className="mt-1 text-[24px] font-extrabold text-ink tnum">{formatMoney(spendTotal)}</p>
      </section>
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
