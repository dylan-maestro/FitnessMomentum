import { normalizeDate } from './date';
import type { Workout } from './types';
import { appendDecayHistory, ensureHistoryEntry } from './momentumHistory';

// Fixed global default aligned with the previous "Weekly" simple-mode preset.
export const DECAY_RATE_PER_DAY = 0.01;
export const TONNAGE_TO_MOMENTUM = 0.01000;

export type MomentumState = {
  momentum: number;
  lastUpdateUnix: number;
};

function sanitizeTimestamp(timestamp: number | undefined, fallback: number): number {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return fallback;
  }
  return timestamp;
}

function roundMomentum(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  // Carry 6 decimal places to keep decay smooth but storage compact
  return Number(value.toFixed(6));
}

function sanitizeMomentum(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

export function ensureMomentumState(
  state: Partial<MomentumState> | undefined,
  now: number
): MomentumState {
  return {
    momentum: sanitizeMomentum(state?.momentum),
    lastUpdateUnix: sanitizeTimestamp(state?.lastUpdateUnix, now)
  };
}

export function decayMomentum(
  state: MomentumState, 
  now: number, 
  decayRate: number = DECAY_RATE_PER_DAY
) {
  const lastUpdate = sanitizeTimestamp(state.lastUpdateUnix, now);
  
  // Calculate days elapsed using local time midnight boundaries
  const lastDateStr = normalizeDate(new Date(lastUpdate));
  const nowDateStr = normalizeDate(new Date(now));
  
  // Use UTC dates derived from the normalized strings to calculate exact day difference
  const d1 = new Date(lastDateStr);
  const d2 = new Date(nowDateStr);
  const diffTime = d2.getTime() - d1.getTime();
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (daysElapsed <= 0) {
    return {
      momentum: roundMomentum(state.momentum),
      lastUpdateUnix: lastUpdate,
      daysElapsed: 0,
      decayApplied: false
    };
  }

  const decayFactor = Math.exp(-decayRate * daysElapsed);
  const decayedMomentum = roundMomentum(sanitizeMomentum(state.momentum) * decayFactor);

  return {
    momentum: decayedMomentum,
    lastUpdateUnix: now,
    daysElapsed,
    decayApplied: true
  };
}

export function addVolumeAndUpdate(
  state: MomentumState,
  tonnage: number,
  now: number,
  decayRate: number = DECAY_RATE_PER_DAY,
  momentumFactor?: number
) {
  const sanitizedTonnage = Math.max(0, Number.isFinite(tonnage) ? tonnage : 0);
  const decayed = decayMomentum(state, now, decayRate);
  const factor = momentumFactor ?? TONNAGE_TO_MOMENTUM;
  const addedMomentum = sanitizedTonnage * factor;
  const momentumAfterVolume = roundMomentum(decayed.momentum + addedMomentum);

  return {
    momentum: momentumAfterVolume,
    lastUpdateUnix: decayed.lastUpdateUnix,
    decayDaysElapsed: decayed.daysElapsed,
    decayApplied: decayed.decayApplied,
    addedMomentum
  };
}

export function applyMomentumUpdate(
  workout: Workout,
  tonnage: number,
  now: number
): Workout {
  const state: MomentumState = {
    momentum: workout.momentum,
    lastUpdateUnix: workout.lastUpdateUnix
  };

  const decayRate = workout.decay ?? DECAY_RATE_PER_DAY;
  const momentumFactor = workout.momentumFactor;
  const result = addVolumeAndUpdate(state, tonnage, now, decayRate, momentumFactor);
  
  const nowIso = new Date(now).toISOString();
  const today = normalizeDate(nowIso);
  const lastLogDate = workout.lastLoggedAt ? normalizeDate(workout.lastLoggedAt) : null;
  const lastUpdateDate = normalizeDate(new Date(workout.lastUpdateUnix));
  
  const lastLoggedAt = tonnage > 0 ? nowIso : workout.lastLoggedAt ?? null;
  
  let dailyVolume = workout.dailyVolume ?? 0;
  let previousLoggedAt = workout.previousLoggedAt ?? null;
  
  if (tonnage > 0) {
      if (lastLogDate === today) {
          // Same day, accumulate volume
          dailyVolume += tonnage;
          // previousLoggedAt remains unchanged
      } else {
          // New day, reset volume
          dailyVolume = tonnage;
          // Capture the previous log time before we overwrite it
          if (workout.lastLoggedAt) {
              previousLoggedAt = workout.lastLoggedAt;
          }
      }
  }

  let momentumHistory = Array.isArray(workout.momentumHistory)
    ? workout.momentumHistory
    : [];

  if (result.decayDaysElapsed && result.decayDaysElapsed > 0) {
    momentumHistory = appendDecayHistory(momentumHistory, {
      startDate: lastUpdateDate || today,
      startMomentum: workout.momentum,
      daysElapsed: result.decayDaysElapsed,
      decayRate
    });
  }

  momentumHistory = ensureHistoryEntry(momentumHistory, today, result.momentum);

  return {
    ...workout,
    momentum: result.momentum,
    lastUpdateUnix: result.lastUpdateUnix,
    lastLoggedAt,
    previousLoggedAt,
    dailyVolume,
    momentumHistory
  };
}

export function applyDecayOnly(workout: Workout, now: number): Workout {
  const decayRate = workout.decay ?? DECAY_RATE_PER_DAY;
  const momentumFactor = workout.momentumFactor;
  const result = addVolumeAndUpdate(
    { momentum: workout.momentum, lastUpdateUnix: workout.lastUpdateUnix },
    0,
    now,
    decayRate,
    momentumFactor
  );

  const momentumChange = Math.abs(result.momentum - workout.momentum);
  // We check if the update timestamp changed, which it will if decay was applied or if it's just a time update
  const timestampChanged = result.lastUpdateUnix !== workout.lastUpdateUnix;

  if (momentumChange <= 1e-6 && !timestampChanged) {
    return workout;
  }

  return {
    ...workout,
    momentum: result.momentum,
    lastUpdateUnix: result.lastUpdateUnix
  };
}
