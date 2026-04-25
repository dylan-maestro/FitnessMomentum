<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { normalizeDate } from '$lib/date';
  import type { Workout, MomentumHistoryEntry } from '$lib/types';

  const dispatch = createEventDispatcher<{ close: void }>();

  export let workout: Workout;

  let overlayEl: HTMLDivElement | null = null;

  const MAX_POINTS = 365;
  const LOOKBACK_DAYS = 7;
  const PROJECTION_DAYS = 30;
  const SVG_WIDTH = 640;
  const SVG_HEIGHT = 260;
  const MARGIN = 20;
  const CHART_WIDTH = SVG_WIDTH - MARGIN * 2;
  const CHART_HEIGHT = SVG_HEIGHT - MARGIN * 2;

  const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const percentFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    signDisplay: 'always'
  });

  function addDays(dateStr: string, days: number): string {
    if (!dateStr) return '';
    const base = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      return '';
    }
    base.setDate(base.getDate() + days);
    return normalizeDate(base);
  }

  function diffInDays(start: string, end: string): number {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return 0;
    }
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }

  $: history = (workout?.momentumHistory ?? []).slice(-MAX_POINTS);
  $: sortedHistory = history.slice().sort((a, b) => a.date.localeCompare(b.date));
  $: latestEntry = sortedHistory[sortedHistory.length - 1];
  $: projectionEntries = (() => {
    if (!latestEntry) {
      return [];
    }

    const subset = sortedHistory.slice().reverse();
    let windowEntries: MomentumHistoryEntry[] = [];

    for (const entry of subset) {
      if (windowEntries.length === 0) {
        windowEntries.push(entry);
        continue;
      }

      const first = windowEntries[windowEntries.length - 1];
      const elapsed = diffInDays(entry.date, first.date);
      if (elapsed >= PROJECTION_DAYS) {
        windowEntries.push(entry);
        break;
      }
      windowEntries.push(entry);
    }

    windowEntries = windowEntries.reverse();

    if (windowEntries.length < 2) {
      return [];
    }
    const firstWindowEntry = windowEntries[0];
    const lastWindowEntry = windowEntries[windowEntries.length - 1];
    const elapsedDays = diffInDays(firstWindowEntry.date, lastWindowEntry.date);
    if (elapsedDays <= 0) {
      return [];
    }

    const slopePerDay = (lastWindowEntry.momentum - firstWindowEntry.momentum) / elapsedDays;
    const projected: MomentumHistoryEntry[] = [];
    for (let day = 1; day <= PROJECTION_DAYS; day += 1) {
      const date = addDays(latestEntry.date, day);
      if (!date) continue;
      const momentum = latestEntry.momentum + slopePerDay * day;
      projected.push({
        date,
        momentum: Number(Math.max(0, momentum).toFixed(6))
      });
    }
    return projected;
  })();

  $: extendedHistory = [...sortedHistory, ...projectionEntries];
  $: values = extendedHistory.map((entry) => entry.momentum);
  $: minValue = values.length ? Math.min(...values) : 0;
  $: maxValue = values.length ? Math.max(...values) : 0;
  $: range = maxValue - minValue;
  $: padding = range > 0 ? range * 0.12 : Math.max(1, maxValue * 0.12);
  $: domainMin = Math.max(0, minValue - padding);
  $: domainMax = maxValue + padding;
  $: domainRange = Math.max(domainMax - domainMin, 1);

  $: totalCount = extendedHistory.length;
  $: timelineStart = sortedHistory[0]?.date ?? latestEntry?.date ?? null;
  $: timelineEnd =
    extendedHistory[extendedHistory.length - 1]?.date ?? latestEntry?.date ?? timelineStart;
  $: timelineTotalDays =
    timelineStart && timelineEnd ? diffInDays(timelineStart, timelineEnd) : 0;

  function getDayOffset(dateStr: string | undefined): number {
    if (!timelineStart || !dateStr) return 0;
    return diffInDays(timelineStart, dateStr);
  }

  function toPoint(
    dayOffset: number,
    totalDays: number,
    fallbackIndex: number,
    fallbackCount: number,
    momentum: number
  ) {
    let ratio = 0.5;
    if (totalDays > 0) {
      ratio = Math.min(1, Math.max(0, dayOffset / totalDays));
    } else if (fallbackCount > 1) {
      ratio = fallbackIndex / (fallbackCount - 1);
    }
    const x = MARGIN + ratio * CHART_WIDTH;
    const normalized = (momentum - domainMin) / domainRange;
    const y = MARGIN + CHART_HEIGHT - normalized * CHART_HEIGHT;
    return { x, y };
  }

  $: actualPoints = sortedHistory.map((entry, index) =>
    toPoint(
      getDayOffset(entry.date),
      timelineTotalDays,
      index,
      totalCount,
      entry.momentum
    )
  );
  $: projectionPoints = projectionEntries.map((entry, index) =>
    toPoint(
      getDayOffset(entry.date),
      timelineTotalDays,
      sortedHistory.length + index,
      totalCount,
      entry.momentum
    )
  );

  function buildSmoothPath(points: { x: number; y: number }[]): string {
    if (!points.length) return '';
    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x} ${p.y}`;
    }

    const result: string[] = [];
    if (!points.length) return '';
    result.push(`L ${points[0].x} ${points[0].y}`);

    for (let i = 0; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const midPointX = (current.x + next.x) / 2;
      const midPointY = (current.y + next.y) / 2;

      if (i === 0) {
        result.push(`Q ${current.x} ${current.y} ${midPointX} ${midPointY}`);
      } else {
        result.push(`T ${midPointX} ${midPointY}`);
      }

      if (i === points.length - 2) {
        result.push(`T ${next.x} ${next.y}`);
      }
    }

    return result.join(' ');
  }

  $: linePath = actualPoints.length
    ? `M ${actualPoints[0].x} ${actualPoints[0].y} ` + buildSmoothPath(actualPoints)
    : '';

  $: areaPath = actualPoints.length
    ? [
        `M ${actualPoints[0].x} ${MARGIN + CHART_HEIGHT}`,
        buildSmoothPath(actualPoints),
        `L ${actualPoints[actualPoints.length - 1].x} ${MARGIN + CHART_HEIGHT}`,
        'Z'
      ].join(' ')
    : '';

  $: projectionPath = projectionPoints.length
    ? [
        `M ${actualPoints.length ? actualPoints[actualPoints.length - 1].x : projectionPoints[0].x} ${
          actualPoints.length ? actualPoints[actualPoints.length - 1].y : projectionPoints[0].y
        }`,
        buildSmoothPath([actualPoints[actualPoints.length - 1], ...projectionPoints])
      ].join(' ')
    : '';
  $: peakEntry = sortedHistory.reduce(
    (acc, entry) => (acc && acc.momentum > entry.momentum ? acc : entry),
    sortedHistory[0] ?? null
  );
  $: peakPoint = (() => {
    if (!peakEntry) return null;
    const index = sortedHistory.findIndex((entry) => entry === peakEntry);
    if (index === -1) return null;
    return actualPoints[index];
  })();

  $: lookbackSpan =
    sortedHistory.length > 1 ? Math.min(LOOKBACK_DAYS, sortedHistory.length - 1) : 0;
  $: lookbackEntry =
    lookbackSpan > 0 ? sortedHistory[sortedHistory.length - 1 - lookbackSpan] : null;
  $: deltaValue =
    latestEntry && lookbackEntry ? latestEntry.momentum - lookbackEntry.momentum : null;
  $: deltaPercent =
    deltaValue !== null && lookbackEntry && lookbackEntry.momentum > 0
      ? (deltaValue / lookbackEntry.momentum) * 100
      : null;
  $: deltaClass =
    deltaValue === null
      ? 'neutral'
      : deltaValue > 0
        ? 'positive'
        : deltaValue < 0
          ? 'negative'
          : 'neutral';

  function close() {
    dispatch('close');
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === overlayEl) {
      close();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  function formatMomentum(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return numberFormatter.format(value);
  }

  function formatPercent(value: number | null): string {
    if (value === null) {
      return '—';
    }
    return percentFormatter.format(value);
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return dateStr;
    }
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const gradientId = `momentum-gradient-${Math.random().toString(36).slice(2)}`;
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="history-overlay"
  bind:this={overlayEl}
  role="presentation"
  on:click={handleOverlayClick}
>
  <div
    class="history-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="history-title"
  >
    <header class="modal-header">
      <div>
        <h2 id="history-title">{workout.name} momentum</h2>
        <p class="modal-subtitle">
          {sortedHistory.length
            ? `${formatDate(sortedHistory[0]?.date)} → ${formatDate(latestEntry?.date)}`
            : 'No logged history yet'}
        </p>
      </div>
      <button class="close-icon" type="button" on:click={close} aria-label="Close history modal">
        ×
      </button>
    </header>

    {#if sortedHistory.length === 0}
      <div class="empty-state">
        <p>Log a session to start building your momentum history.</p>
      </div>
    {:else}
  <div class="chart-wrapper">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img" aria-label="Momentum history chart">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(67, 160, 71, 0.35)" />
              <stop offset="100%" stop-color="rgba(67, 160, 71, 0)" />
            </linearGradient>
          </defs>
          <rect
            x={MARGIN}
            y={MARGIN}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            class="chart-frame"
          />
          {#if areaPath}
            <path d={areaPath} fill={`url(#${gradientId})`} />
          {/if}
          {#if linePath}
            <path d={linePath} class="chart-line" fill="none" />
          {/if}
          {#if projectionPath}
            <path d={projectionPath} class="chart-line projection" fill="none" />
          {/if}
          {#if peakPoint}
            <circle class="chart-dot peak" cx={peakPoint.x} cy={peakPoint.y} r="4.5" />
          {/if}
          {#if actualPoints.length}
            <circle
              class="chart-dot current"
              cx={actualPoints[actualPoints.length - 1].x}
              cy={actualPoints[actualPoints.length - 1].y}
              r="4.5"
            />
          {/if}
        </svg>
        <div class="chart-axis">
          <span>{formatDate(timelineStart ?? sortedHistory[0]?.date)}</span>
          <span>{formatDate(timelineEnd ?? latestEntry?.date)}</span>
        </div>
        {#if projectionEntries.length}
          <div class="chart-legend">
            <span class="legend-item">
              <span class="legend-line actual"></span> Actual
            </span>
            <span class="legend-item">
              <span class="legend-line projection"></span> 30d projection
            </span>
          </div>
        {/if}
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <span class="metric-label">Today</span>
          <span class="metric-value">{formatMomentum(latestEntry?.momentum)}</span>
          <span class="metric-sub">{formatDate(latestEntry?.date)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">
            {lookbackSpan > 0 ? `${lookbackSpan}d change` : 'Trend'}
          </span>
          <span class={`metric-value ${deltaClass}`}>
            {deltaValue === null
              ? '—'
              : `${deltaValue > 0 ? '+' : ''}${formatMomentum(deltaValue)}`}
          </span>
          <span class="metric-sub">{formatPercent(deltaPercent)}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">All-time high</span>
          <span class="metric-value">
            {formatMomentum(peakEntry?.momentum)}
          </span>
          <span class="metric-sub">{formatDate(peakEntry?.date)}</span>
        </div>
      </div>
    {/if}

    <div class="modal-footer">
      <button class="close-btn" type="button" on:click={close}>
        Close
      </button>
    </div>
  </div>
</div>

<style>
  .history-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding:
      calc(1.5rem + var(--android-safe-area-top, env(safe-area-inset-top, 0px)))
      calc(1.5rem + var(--android-safe-area-right, env(safe-area-inset-right, 0px)))
      calc(1.5rem + var(--android-safe-area-bottom, env(safe-area-inset-bottom, 0px)))
      calc(1.5rem + var(--android-safe-area-left, env(safe-area-inset-left, 0px)));
    z-index: 1000;
  }

  .history-modal {
    background: white;
    border-radius: 16px;
    width: min(720px, 100%);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    gap: 1.25rem;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.4rem;
    color: #1f2937;
  }

  .modal-subtitle {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    color: #6b7280;
  }

  .close-icon {
    border: none;
    background: transparent;
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
    color: #94a3b8;
    transition: color 0.2s ease;
  }

  .close-icon:hover {
    color: #1f2937;
  }

  .empty-state {
    background: #f3f4f6;
    border-radius: 12px;
    padding: 2.5rem 1.5rem;
    text-align: center;
    color: #6b7280;
    font-size: 0.95rem;
  }

  .chart-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  svg {
    width: 100%;
    height: auto;
  }

  .chart-frame {
    fill: #f9fafb;
    stroke: #e5e7eb;
    stroke-width: 1;
  }

  .chart-line {
    stroke: #43a047;
    stroke-width: 2.5;
  }

  .chart-line.projection {
    stroke: #256029;
    stroke-width: 2;
    stroke-dasharray: 8 6;
    opacity: 0.8;
  }

  .chart-dot {
    stroke: white;
    stroke-width: 1.5;
  }

  .chart-dot.current {
    fill: #1b5e20;
  }

  .chart-dot.peak {
    fill: #f59e0b;
  }

  .chart-axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
    padding: 0 4px;
  }

  .chart-legend {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: #475569;
    margin-top: 0.35rem;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .legend-line {
    width: 24px;
    height: 0;
    border-bottom: 2px solid currentColor;
  }

  .legend-line.actual {
    border-color: #43a047;
  }

  .legend-line.projection {
    border-color: #256029;
    border-bottom-style: dashed;
  }

  .metric-grid {
    display: grid;
    gap: 0.9rem;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .metric-card {
    background: #f8fafc;
    border-radius: 12px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
  }

  .metric-value {
    font-size: 1.4rem;
    font-weight: 600;
    color: #1f2937;
  }

  .metric-value.positive {
    color: #1b5e20;
  }

  .metric-value.negative {
    color: #b91c1c;
  }

  .metric-sub {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
  }

  .close-btn {
    border: none;
    border-radius: 999px;
    padding: 0.6rem 1.5rem;
    font-size: 0.95rem;
    font-weight: 600;
    background: #1f2937;
    color: white;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.2s ease;
  }

  .close-btn:hover {
    transform: translateY(-1px);
    background: #0f172a;
  }

  @media (max-width: 640px) {
    .history-modal {
      padding: 1.25rem;
      gap: 1rem;
    }

    .metric-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

