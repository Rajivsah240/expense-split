/**
 * Small, dependency-free SVG charts.
 *
 * They share one visual language: the same brand fill, the same rounded ends,
 * value labels rather than gridlines, and enough contrast to read on a phone in
 * daylight. Every chart degrades to a readable empty state.
 */

import type { StatsBucket } from '@shared/types';
import { formatMoneyShort } from '../lib/format';

export function BarChart({ data, height = 132 }: { data: StatsBucket[]; height?: number }) {
  const max = Math.max(1, ...data.map(entry => entry.value));
  const hasValues = data.some(entry => entry.value > 0);
  const labelEvery = data.length > 12 ? Math.ceil(data.length / 6) : 1;

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map(entry => {
          const ratio = entry.value / max;
          const barHeight = hasValues ? Math.max(entry.value > 0 ? 6 : 3, ratio * (height - 26)) : 3;
          return (
            <div key={entry.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              {entry.value > 0 && (
                <span className="whitespace-nowrap text-[9.5px] font-bold text-muted tnum">
                  {formatMoneyShort(entry.value)}
                </span>
              )}
              <div
                className={`w-full rounded-t-[5px] transition-all ${
                  entry.value > 0 ? 'bg-brand' : 'bg-surface-3'
                }`}
                style={{ height: barHeight }}
                role="img"
                aria-label={`${entry.label}: ${formatMoneyShort(entry.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((entry, index) => (
          <span
            key={entry.key}
            className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-faint"
          >
            {index % labelEvery === 0 || index === data.length - 1 ? entry.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RankedBars({
  data,
  colorFor,
  emptyLabel = 'Nothing yet',
}: {
  data: StatsBucket[];
  colorFor?: (key: string) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...data.map(entry => entry.value));
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (data.length === 0 || total === 0) {
    return <p className="py-3 text-center text-[13px] text-faint">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {data.map(entry => (
        <li key={entry.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="clip text-[13px] font-semibold text-ink">{entry.label}</span>
            <span className="shrink-0 text-[12.5px] font-bold text-muted tnum">
              {formatMoneyShort(entry.value)}
              <span className="ml-1 font-medium text-faint">
                {Math.round((entry.value / total) * 100)}%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (entry.value / max) * 100)}%`,
                background: colorFor?.(entry.key) ?? 'var(--color-brand)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DonutChart({
  data,
  colorFor,
  size = 148,
}: {
  data: StatsBucket[];
  colorFor: (key: string) => string;
  size?: number;
}) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return <p className="py-6 text-center text-[13px] text-faint">Nothing to chart yet</p>;
  }

  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth="18"
        />
        {data.map(entry => {
          const fraction = entry.value / total;
          const dash = fraction * circumference;
          const segment = (
            <circle
              key={entry.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colorFor(entry.key)}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0, dash - 2)} ${circumference - Math.max(0, dash - 2)}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return segment;
        })}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.slice(0, 6).map(entry => (
          <li key={entry.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: colorFor(entry.key) }}
              aria-hidden
            />
            <span className="clip flex-1 truncate text-[12.5px] font-medium text-ink">{entry.label}</span>
            <span className="shrink-0 text-[12px] font-bold text-muted tnum">
              {Math.round((entry.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SplitBar({ shared, singlePerson }: { shared: number; singlePerson: number }) {
  const total = shared + singlePerson;
  if (total === 0) return <p className="py-3 text-center text-[13px] text-faint">Nothing yet</p>;
  const sharedPercent = Math.round((shared / total) * 100);

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-brand" style={{ width: `${sharedPercent}%` }} />
        <div className="h-full bg-warn/70" style={{ width: `${100 - sharedPercent}%` }} />
      </div>
      <div className="mt-2.5 flex justify-between text-[12.5px]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-brand" aria-hidden />
          <span className="font-semibold text-ink">Shared</span>
          <span className="font-bold text-muted tnum">{formatMoneyShort(shared)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-warn/70" aria-hidden />
          <span className="font-semibold text-ink">Single-person</span>
          <span className="font-bold text-muted tnum">{formatMoneyShort(singlePerson)}</span>
        </span>
      </div>
    </div>
  );
}

/** Overlaid monthly lines, one per member, for contribution over time. */
export function ContributionLines({
  series,
  colorFor,
  labels,
}: {
  series: { userId: string; label: string; values: number[] }[];
  colorFor: (userId: string) => string;
  labels: string[];
}) {
  const max = Math.max(1, ...series.flatMap(entry => entry.values));
  const width = 280;
  const height = 96;
  const stepX = series[0]?.values.length > 1 ? width / (series[0].values.length - 1) : width;

  const hasData = series.some(entry => entry.values.some(value => value > 0));
  if (!hasData) return <p className="py-4 text-center text-[13px] text-faint">Nothing yet</p>;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none">
        {series.map(entry => {
          const points = entry.values
            .map((value, index) => `${index * stepX},${height - (value / max) * (height - 8) - 4}`)
            .join(' ');
          return (
            <polyline
              key={entry.userId}
              points={points}
              fill="none"
              stroke={colorFor(entry.userId)}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] font-semibold text-faint">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {series.map(entry => (
          <li key={entry.userId} className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: colorFor(entry.userId) }} aria-hidden />
            <span className="text-[11.5px] font-medium text-muted">{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
