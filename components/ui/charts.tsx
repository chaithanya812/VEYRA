"use client";

import { useId, useState } from "react";
import { seriesColor } from "@/lib/palette";
import { cn } from "@/lib/utils";

/**
 * Hand-rolled SVG charts.
 *
 * No charting dependency — PLAN-V4 §5.2 says not to add one without asking,
 * and these three shapes cover every analytic in the plan: an area trend, a
 * donut with a legend, and a horizontal bar list. They are deliberately plain:
 * the numbers are the point, and every one of them is also available as text
 * beside the picture (`Chart | Table` in `105716` exists for the same reason).
 *
 * Colours come from the §4.1 categorical palette in fixed order. Red is never
 * a series colour.
 */

/* ── Area trend ───────────────────────────────────────────────────────────── */

export function AreaTrend({
  points,
  height = 160,
  color = seriesColor(1),
  valueLabel = "Leads",
}: {
  points: { date: string; count: number }[];
  height?: number;
  color?: string;
  valueLabel?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const W = 600;
  const H = height;
  const padY = 16;
  const max = Math.max(1, ...points.map((p) => p.count));
  const stepX = points.length > 1 ? W / (points.length - 1) : W;
  const y = (v: number) => H - padY - (v / max) * (H - padY * 2);

  const line = points.map((p, i) => `${i * stepX},${y(p.count)}`).join(" ");
  const area = `0,${H - padY} ${line} ${W},${H - padY}`;
  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${valueLabel} per day, ${points[0].date} to ${points[points.length - 1].date}, peak ${max}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Baseline and the max gridline — two lines is enough scale. */}
        {[0, max].map((v) => (
          <line
            key={v}
            x1="0"
            x2={W}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        ))}

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" />

        {points.map((p, i) => (
          <rect
            key={p.date}
            x={i * stepX - stepX / 2}
            y={0}
            width={stepX}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {active && (
          <circle
            cx={(hover as number) * stepX}
            cy={y(active.count)}
            r="3.5"
            fill={color}
          />
        )}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-ink-secondary)]">
        <span className="tabular">{points[0].date}</span>
        <span className="font-medium text-[var(--color-ink)]">
          {active
            ? `${active.date} · ${valueLabel}: ${active.count}`
            : `Peak ${max}`}
        </span>
        <span className="tabular">{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

/* ── Donut ────────────────────────────────────────────────────────────────── */

export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  pct: number;
  color?: string;
}

export function Donut({
  slices,
  size = 150,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = slices.reduce((n, s) => n + s.count, 0);
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 160 160"
        role="img"
        aria-label={slices.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        <g transform="translate(80,80) rotate(-90)">
          <circle r={R} fill="none" stroke="var(--color-surface-sunken)" strokeWidth="22" />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (s.count / total) * C;
              const el = (
                <circle
                  key={s.key}
                  r={R}
                  fill="none"
                  stroke={s.color ?? seriesColor(i)}
                  strokeWidth="22"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${s.label}: ${s.count} (${s.pct}%)`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </g>
        {(centerValue != null || centerLabel) && (
          <text textAnchor="middle" x="80" y="76">
            <tspan
              x="80"
              className="fill-[var(--color-ink)] text-[20px] font-semibold tabular"
            >
              {centerValue ?? total}
            </tspan>
            {centerLabel && (
              <tspan
                x="80"
                dy="18"
                className="fill-[var(--color-ink-secondary)] text-[10px]"
              >
                {centerLabel}
              </tspan>
            )}
          </text>
        )}
      </svg>

      {/* The legend is not optional. A donut without its numbers is decoration. */}
      <ul className="flex min-w-40 flex-1 flex-col gap-1.5">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: s.color ?? seriesColor(i) }}
            />
            <span className="flex-1 truncate text-[var(--color-ink)]">{s.label}</span>
            <span className="tabular text-[var(--color-ink-secondary)]">
              {s.count} ({s.pct}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Horizontal bar list ──────────────────────────────────────────────────── */

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Rendered at the end of the bar; defaults to the value. */
  display?: string;
  color?: string;
}

export function BarList({
  rows,
  onSelect,
  selectedKey,
  emptyLabel = "Nothing here yet",
}: {
  rows: BarRow[];
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--color-ink-secondary)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="w-40 shrink-0 truncate text-[13px] text-[var(--color-ink)]">
              {r.label}
            </span>
            <span className="flex-1">
              <span
                className="block h-5 rounded-sm"
                style={{
                  width: `${Math.max(2, (r.value / max) * 100)}%`,
                  background: r.color ?? seriesColor(i),
                  opacity: selectedKey && selectedKey !== r.key ? 0.35 : 1,
                }}
              />
            </span>
            <span className="w-24 shrink-0 text-right text-[13px] font-medium tabular text-[var(--color-ink)]">
              {r.display ?? r.value}
            </span>
          </>
        );

        return (
          <li key={r.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(r.key)}
                aria-pressed={selectedKey === r.key}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-surface-sunken)]",
                  selectedKey === r.key && "bg-[var(--color-surface-sunken)]",
                )}
              >
                {inner}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-1.5 py-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
