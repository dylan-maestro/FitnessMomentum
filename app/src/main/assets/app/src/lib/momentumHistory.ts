import { normalizeDate } from './date';
import type { MomentumHistoryEntry } from './types';

export const MAX_HISTORY_DAYS = 365;

const MOMENTUM_EPSILON = 1e-6;

function sanitizeMomentum(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function roundMomentum(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Number(value.toFixed(6));
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const base = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return '';
  }
  base.setDate(base.getDate() + days);
  return normalizeDate(base);
}

function pruneHistory(history: MomentumHistoryEntry[]): MomentumHistoryEntry[] {
  if (history.length <= MAX_HISTORY_DAYS) {
    return history;
  }
  return history.slice(-MAX_HISTORY_DAYS);
}

export function ensureHistoryEntry(
  history: MomentumHistoryEntry[],
  date: string,
  momentum: number
): MomentumHistoryEntry[] {
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) {
    return history;
  }

  const sanitizedMomentum = roundMomentum(sanitizeMomentum(momentum));
  const existingIndex = history.findIndex((entry) => entry.date === normalizedDate);

  if (existingIndex >= 0) {
    const existing = history[existingIndex];
    if (Math.abs(existing.momentum - sanitizedMomentum) < MOMENTUM_EPSILON) {
      return history;
    }
    const updated = history.slice();
    updated[existingIndex] = { date: normalizedDate, momentum: sanitizedMomentum };
    return pruneHistory(updated);
  }

  const updated = [...history, { date: normalizedDate, momentum: sanitizedMomentum }];
  updated.sort((a, b) => a.date.localeCompare(b.date));
  return pruneHistory(updated);
}

export function sanitizeMomentumHistory(
  rawHistory: unknown,
  today: string,
  todayMomentum: number
): MomentumHistoryEntry[] {
  let history: MomentumHistoryEntry[] = [];

  if (Array.isArray(rawHistory)) {
    for (const entry of rawHistory as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== 'object') continue;
      const dateValue = typeof entry.date === 'string' ? entry.date : '';
      const momentumValue = entry.momentum;
      history = ensureHistoryEntry(history, dateValue, sanitizeMomentum(momentumValue));
    }
  }

  if (today) {
    history = ensureHistoryEntry(history, today, todayMomentum);
  }

  return history;
}

type AppendDecayOptions = {
  startDate: string;
  startMomentum: number;
  daysElapsed: number;
  decayRate: number;
};

export function appendDecayHistory(
  history: MomentumHistoryEntry[],
  options: AppendDecayOptions
): MomentumHistoryEntry[] {
  const { startDate, startMomentum, daysElapsed, decayRate } = options;
  if (!Number.isFinite(daysElapsed) || daysElapsed <= 0) {
    return history;
  }

  const sanitizedStartMomentum = sanitizeMomentum(startMomentum);
  let baselineDate = normalizeDate(startDate);
  let updatedHistory = history;

  if (baselineDate) {
    updatedHistory = ensureHistoryEntry(updatedHistory, baselineDate, sanitizedStartMomentum);
  } else if (updatedHistory.length > 0) {
    baselineDate = updatedHistory[updatedHistory.length - 1].date;
  }

  if (!baselineDate) {
    return updatedHistory;
  }

  for (let day = 1; day <= daysElapsed; day += 1) {
    const targetDate = addDays(baselineDate, day);
    if (!targetDate) {
      continue;
    }
    const decayedMomentum = roundMomentum(
      sanitizedStartMomentum * Math.exp(-decayRate * day)
    );
    updatedHistory = ensureHistoryEntry(updatedHistory, targetDate, decayedMomentum);
  }

  return updatedHistory;
}

