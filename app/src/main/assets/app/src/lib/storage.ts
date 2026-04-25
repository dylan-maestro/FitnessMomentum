import { workouts, settings } from './stores';
import type { Workout, Settings, MomentumHistoryEntry } from './types';
import { sanitizeMomentumHistory, appendDecayHistory, ensureHistoryEntry } from './momentumHistory';
import { calculateReps } from './reps';
import { getNow } from './currentDate';
import { ensureMomentumState, addVolumeAndUpdate, DECAY_RATE_PER_DAY } from './momentum';
import { get } from 'svelte/store';
import { normalizeDate, daysBetween } from './date';
import { isWorkoutType, type WorkoutType } from './workoutTypes';

const WORKOUTS_STORAGE_KEY = 'fitness-momentum-workouts';
const SETTINGS_STORAGE_KEY = 'fitness-momentum-settings';

export function loadSettings(): void {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Settings;
      // Ensure defaults if new fields are added
      const normalized: Settings = {
        bodyWeight: typeof parsed.bodyWeight === 'number' ? parsed.bodyWeight : 70,
        weightUnit: parsed.weightUnit === 'lb' ? 'lb' : 'kg',
        distanceUnit: parsed.distanceUnit === 'mi' ? 'mi' : 'km'
      };
      settings.set(normalized);
    } else {
      settings.set({
        bodyWeight: 70,
        weightUnit: 'kg',
        distanceUnit: 'km'
      });
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

export function saveSettings(newSettings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    settings.set(newSettings);
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function updateSettings(updates: Partial<Settings>): void {
  settings.update((current) => {
    const updatedSettings = { ...current, ...updates };
    saveSettings(updatedSettings);

    // Cascade body weight changes to workouts marked as bodyweight
    if (updates.bodyWeight !== undefined) {
        const newBodyWeight = updates.bodyWeight;
        const now = getNow();
        const nowIso = new Date(now).toISOString();
        const today = normalizeDate(nowIso);

        workouts.update((currentWorkouts) => {
            const updatedWorkouts = currentWorkouts.map((w) => {
                const bodyweightMultiplier = resolveBodyweightMultiplier(
                  !!w.isBodyweight,
                  w.bodyweightMultiplier
                );
                if (bodyweightMultiplier > 0) {
                    const effectiveWeight = Math.max(1, newBodyWeight * bodyweightMultiplier + w.weight);
                    const updatedWorkout = { ...w };
                    const decay = w.decay ?? DECAY_RATE_PER_DAY;
                    
                    // Simple logic for daysSinceLastLog in background update
                    // We don't have perfect context here but it's just for the default value
                    let daysSinceLastLog = 1;
                    if (w.lastLoggedAt) {
                        const last = normalizeDate(w.lastLoggedAt);
                        daysSinceLastLog = Math.max(1, daysBetween(last, today));
                    }
                    
                    updatedWorkout.repsRequired = calculateReps(
                        updatedWorkout.momentum,
                        updatedWorkout.baseVolume,
                        effectiveWeight,
                        decay,
                        updatedWorkout.targetIncreasePercentage,
                        daysSinceLastLog,
                        updatedWorkout.targetFrequency,
                        updatedWorkout.momentumFactor
                    );
                    return updatedWorkout;
                }
                return w;
            });
            saveWorkouts(updatedWorkouts);
            return updatedWorkouts;
        });
    }

    return updatedSettings;
  });
}

function clampBodyweightMultiplier(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(1, Math.max(0, numeric));
}

function resolveBodyweightMultiplier(isBodyweight: boolean, multiplier?: number): number {
  if (typeof multiplier === 'number' && Number.isFinite(multiplier)) {
    return clampBodyweightMultiplier(multiplier);
  }
  return isBodyweight ? 1 : 0;
}

function getEffectiveWeight(isBodyweight: boolean, weight: number, bodyweightMultiplier?: number): number {
    const resolvedMultiplier = resolveBodyweightMultiplier(isBodyweight, bodyweightMultiplier);
    if (resolvedMultiplier > 0) {
        const bodyWeight = get(settings).bodyWeight;
        return Math.max(1, bodyWeight * resolvedMultiplier + weight);
    }
    return weight;
}

function getTargetRoundingMode(workoutType?: WorkoutType): 'ceil' | 'none' {
  return workoutType === 'distance' ? 'none' : 'ceil';
}

function sanitizeMomentumValue(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
}

function parseNormalizedDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const normalized = normalizeDate(trimmed);
  return normalized || null;
}

function getStoredAllTimeHighMomentum(input: {
  momentum: number;
  momentumHistory?: MomentumHistoryEntry[];
  allTimeHighMomentum?: number;
}): number {
  const historyPeak = Array.isArray(input.momentumHistory)
    ? input.momentumHistory.reduce((peak, entry) => {
        const value = Number(entry?.momentum);
        return Number.isFinite(value) && value > peak ? value : peak;
      }, 0)
    : 0;

  const storedPeak =
    typeof input.allTimeHighMomentum === 'number' &&
    Number.isFinite(input.allTimeHighMomentum) &&
    input.allTimeHighMomentum >= 0
      ? input.allTimeHighMomentum
      : 0;

  return Math.max(storedPeak, sanitizeMomentumValue(input.momentum), historyPeak);
}

function parseUnixTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const direct = Date.parse(trimmed);
    if (!Number.isNaN(direct)) {
      return direct;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const fallback = Date.parse(`${trimmed}T00:00`);
      if (!Number.isNaN(fallback)) {
        return fallback;
      }
    }
  }
  return null;
}

function parseIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const fallback = new Date(`${trimmed}T00:00`);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toISOString();
    }
  }
  return null;
}


export function loadWorkouts(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const stored = localStorage.getItem(WORKOUTS_STORAGE_KEY);
      loadSettings();

      if (stored) {
        type StoredWorkout = Record<string, unknown>;
        const parsed = JSON.parse(stored) as StoredWorkout[];
        const now = getNow();
        const nowIso = new Date(now).toISOString();
        const today = normalizeDate(nowIso);

        const normalized: Workout[] = parsed.map((raw, index) => {
          // ... (keep existing ID/name/baseVolume/weight/isBodyweight logic same) ...
          const id =
            typeof raw.id === 'string'
              ? raw.id
              : typeof raw.id === 'number'
                ? String(raw.id)
                : `workout-${Date.now()}-${index}`;

          const name = typeof raw.name === 'string' ? raw.name : `Workout ${index + 1}`;

          const baseVolumeRaw =
            typeof raw.baseVolume === 'number'
              ? raw.baseVolume
              : typeof raw.baseReps === 'number'
                ? raw.baseReps
                : 0;
          const baseVolume = Math.max(0, Math.round(baseVolumeRaw * 100) / 100);

          const weight = typeof raw.weight === 'number' ? raw.weight : 1;
          const isBodyweight =
            typeof raw.isBodyweight === 'boolean' ? raw.isBodyweight : false;
          const bodyweightMultiplier = resolveBodyweightMultiplier(
            isBodyweight,
            typeof raw.bodyweightMultiplier === 'number' ? raw.bodyweightMultiplier : undefined
          );
          const normalizedIsBodyweight = bodyweightMultiplier > 0;

          const decay = typeof raw.decay === 'number' && Number.isFinite(raw.decay) && raw.decay > 0
            ? raw.decay
            : DECAY_RATE_PER_DAY;
            
          const targetIncreasePercentage =
            typeof raw.targetIncreasePercentage === 'number' && Number.isFinite(raw.targetIncreasePercentage) && raw.targetIncreasePercentage >= 0
              ? raw.targetIncreasePercentage
              : 0;

          const targetFrequency = 
            typeof raw.targetFrequency === 'number' && Number.isFinite(raw.targetFrequency) && raw.targetFrequency >= 1
              ? Math.round(raw.targetFrequency)
              : 1;

          const rawMomentum =
            typeof raw.momentum === 'number'
              ? raw.momentum
              : typeof raw.streak === 'number'
                ? raw.streak
                : 0;

          let lastUpdateUnix =
            typeof raw.lastUpdateUnix === 'number' && raw.lastUpdateUnix > 0
              ? raw.lastUpdateUnix
              : null;

          if (!lastUpdateUnix) {
            const fromMomentumAdjusted = parseUnixTimestamp(raw.momentumAdjustedAt);
            if (fromMomentumAdjusted) {
              lastUpdateUnix = fromMomentumAdjusted;
            }
          }

          if (!lastUpdateUnix) {
            const fromLastCompleted = parseUnixTimestamp(raw.lastCompletedAt);
            if (fromLastCompleted) {
              lastUpdateUnix = fromLastCompleted;
            }
          }

          if (!lastUpdateUnix) {
            lastUpdateUnix = now;
          }

          const momentumState = ensureMomentumState(
            {
              momentum: sanitizeMomentumValue(rawMomentum),
              lastUpdateUnix
            },
            now
          );

          const workoutType = isWorkoutType(raw.workoutType)
            ? raw.workoutType
            : undefined; // Defaults to 'weight' behavior if not set
              
          const momentumFactor = 
            typeof raw.momentumFactor === 'number' && Number.isFinite(raw.momentumFactor) && raw.momentumFactor > 0
              ? raw.momentumFactor
              : undefined; // Defaults by workout type if not set
              
          const distanceInputMode = 
            typeof raw.distanceInputMode === 'string' && (raw.distanceInputMode === 'simple' || raw.distanceInputMode === 'laps')
              ? raw.distanceInputMode
              : undefined; // Defaults to 'simple' if not set
          const decayResult = addVolumeAndUpdate(momentumState, 0, now, decay, momentumFactor);
          const effectiveWeight = getEffectiveWeight(normalizedIsBodyweight, weight, bodyweightMultiplier);
          const momentumHistory = sanitizeMomentumHistory(
            (raw as { momentumHistory?: unknown }).momentumHistory,
            today,
            decayResult.momentum
          );
          const allTimeHighMomentum = getStoredAllTimeHighMomentum({
            momentum: decayResult.momentum,
            momentumHistory,
            allTimeHighMomentum:
              typeof raw.allTimeHighMomentum === 'number' ? raw.allTimeHighMomentum : undefined
          });
          const lastAllTimeHighCelebratedOn = parseNormalizedDate(raw.lastAllTimeHighCelebratedOn);

          const lastLoggedAt =
            parseIsoTimestamp(raw.lastLoggedAt) ??
            parseIsoTimestamp(raw.lastCompletedAt) ??
            null;
            
          const previousLoggedAt = parseIsoTimestamp(raw.previousLoggedAt) ?? null;
            
          const dailyVolume = typeof raw.dailyVolume === 'number' ? raw.dailyVolume : 0;
          
          let daysSinceLastLog = 1;
          if (lastLoggedAt) {
              const last = normalizeDate(lastLoggedAt);
              daysSinceLastLog = Math.max(1, daysBetween(last, today));
          }

          return {
            id,
            name,
            baseVolume,
            weight,
            isBodyweight: normalizedIsBodyweight,
            bodyweightMultiplier,
            decay,
            targetIncreasePercentage,
            targetFrequency,
            workoutType,
            momentumFactor,
            distanceInputMode,
            momentum: decayResult.momentum,
            allTimeHighMomentum,
            lastAllTimeHighCelebratedOn,
            lastUpdateUnix: decayResult.lastUpdateUnix,
            lastLoggedAt,
            previousLoggedAt,
            dailyVolume,
            repsRequired: calculateReps(
              decayResult.momentum,
              baseVolume,
              effectiveWeight,
              decay,
              targetIncreasePercentage,
              daysSinceLastLog,
              targetFrequency,
              momentumFactor,
              getTargetRoundingMode(workoutType)
            ),
            momentumHistory
          };
        });

        workouts.set(normalized);
        saveWorkouts(normalized);
      } else {
        workouts.set([]);
      }
    } catch (error) {
      console.error('Failed to load workouts:', error);
      workouts.set([]);
    }
    resolve();
  });
}

export function saveWorkouts(workoutsToSave: Workout[]): void {
  try {
    localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(workoutsToSave));
  } catch (error) {
    console.error('Failed to save workouts:', error);
  }
}

type NewWorkoutInput = {
  name: string;
  // multiplier: number; // Removed
  baseVolume: number;
  weight: number;
  isBodyweight: boolean;
  bodyweightMultiplier?: number;
  momentum: number;
  decay?: number;
  targetIncreasePercentage?: number;
  targetFrequency?: number;
  workoutType?: WorkoutType;
  momentumFactor?: number;
  distanceInputMode?: 'simple' | 'laps';
  lastLoggedAt?: string | null;
  previousLoggedAt?: string | null;
  lastUpdateUnix?: number | string | null;
  dailyVolume?: number;
   momentumHistory?: MomentumHistoryEntry[];
};

export function addWorkout(workout: NewWorkoutInput): void {
  workouts.update((current) => {
    const now = getNow();
    const nowIso = new Date(now).toISOString();
    const today = normalizeDate(nowIso);
    const sanitizedBaseVolume = Math.max(0, Math.round(workout.baseVolume * 100) / 100);
    const sanitizedMomentum = sanitizeMomentumValue(workout.momentum);
    const bodyweightMultiplier = resolveBodyweightMultiplier(
      !!workout.isBodyweight,
      workout.bodyweightMultiplier
    );
    const normalizedIsBodyweight = bodyweightMultiplier > 0;
    const effectiveWeight = getEffectiveWeight(normalizedIsBodyweight, workout.weight, bodyweightMultiplier);
    const decay = typeof workout.decay === 'number' && Number.isFinite(workout.decay) && workout.decay > 0
        ? workout.decay
        : DECAY_RATE_PER_DAY;
    
    const targetIncreasePercentage = typeof workout.targetIncreasePercentage === 'number' && Number.isFinite(workout.targetIncreasePercentage) && workout.targetIncreasePercentage >= 0
        ? workout.targetIncreasePercentage
        : 0;

    const targetFrequency = typeof workout.targetFrequency === 'number' && Number.isFinite(workout.targetFrequency) && workout.targetFrequency >= 1
        ? Math.round(workout.targetFrequency)
        : 1;

    const requestedLastUpdateUnix =
      workout.lastUpdateUnix !== undefined && workout.lastUpdateUnix !== null
        ? parseUnixTimestamp(workout.lastUpdateUnix) ?? now
        : now;

    const momentumState = ensureMomentumState(
      {
        momentum: sanitizedMomentum,
        lastUpdateUnix: requestedLastUpdateUnix
      },
      now
    );

    const sanitizedLastLoggedAt = workout.lastLoggedAt
      ? parseIsoTimestamp(workout.lastLoggedAt) ?? null
      : null;
    const sanitizedPreviousLoggedAt = workout.previousLoggedAt
      ? parseIsoTimestamp(workout.previousLoggedAt) ?? null
      : null;
    const sanitizedDailyVolume =
      typeof workout.dailyVolume === 'number' && Number.isFinite(workout.dailyVolume) && workout.dailyVolume >= 0
        ? workout.dailyVolume
        : 0;

    const momentumHistory = sanitizeMomentumHistory(
      workout.momentumHistory,
      today,
      momentumState.momentum
    );

    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString();

    const calculatedReps = calculateReps(
      momentumState.momentum,
      sanitizedBaseVolume,
      effectiveWeight,
      decay,
      targetIncreasePercentage,
      1, // Default days since last log for new workout
      targetFrequency,
      workout.momentumFactor,
      getTargetRoundingMode(workout.workoutType)
    );

    const newWorkout: Workout = {
      id,
      name: workout.name,
      baseVolume: sanitizedBaseVolume,
      weight: workout.weight,
      isBodyweight: normalizedIsBodyweight,
      bodyweightMultiplier,
      decay,
      targetIncreasePercentage,
      targetFrequency,
      workoutType: workout.workoutType,
      momentumFactor: workout.momentumFactor,
      distanceInputMode: workout.distanceInputMode,
      momentum: momentumState.momentum,
      allTimeHighMomentum: momentumState.momentum,
      lastAllTimeHighCelebratedOn: null,
      lastUpdateUnix: momentumState.lastUpdateUnix,
      lastLoggedAt: sanitizedLastLoggedAt,
      previousLoggedAt: sanitizedPreviousLoggedAt,
      dailyVolume: sanitizedDailyVolume,
      repsRequired: calculatedReps,
      momentumHistory
    };
    const updated = [...current, newWorkout];
    saveWorkouts(updated);
    return updated;
  });
}

export function updateWorkout(id: string, updates: Partial<Workout>): void {
  workouts.update((current) => {
    const now = getNow();
    const nowIso = new Date(now).toISOString();
    const today = normalizeDate(nowIso);

    const updated = current.map((w) => {
      if (w.id === id) {
        const updatedWorkout = { ...w, ...updates };
        let momentumWasUpdated = false;

        if (updates.momentum !== undefined) {
          updatedWorkout.momentum = sanitizeMomentumValue(updates.momentum);
          momentumWasUpdated = true;
        }

        if (updates.allTimeHighMomentum !== undefined) {
          updatedWorkout.allTimeHighMomentum = getStoredAllTimeHighMomentum({
            momentum: updatedWorkout.momentum,
            momentumHistory: updatedWorkout.momentumHistory,
            allTimeHighMomentum: updates.allTimeHighMomentum
          });
        }

        if (updates.lastAllTimeHighCelebratedOn !== undefined) {
          updatedWorkout.lastAllTimeHighCelebratedOn = parseNormalizedDate(
            updates.lastAllTimeHighCelebratedOn
          );
        }

        if (updates.baseVolume !== undefined) {
          updatedWorkout.baseVolume = Math.max(0, Math.round(updatedWorkout.baseVolume * 100) / 100);
        }

        if (updates.weight !== undefined) {
          const numericWeight = Number(updates.weight);
          if (Number.isFinite(numericWeight)) {
            updatedWorkout.weight = numericWeight;
          }
        }

        if (updates.bodyweightMultiplier !== undefined) {
          updatedWorkout.bodyweightMultiplier = clampBodyweightMultiplier(updates.bodyweightMultiplier);
          updatedWorkout.isBodyweight = updatedWorkout.bodyweightMultiplier > 0;
        } else if (updates.isBodyweight !== undefined) {
          updatedWorkout.isBodyweight = !!updates.isBodyweight;
          updatedWorkout.bodyweightMultiplier = updatedWorkout.isBodyweight ? 1 : 0;
        }
        
        if (updates.decay !== undefined) {
            const numericDecay = Number(updates.decay);
            if (Number.isFinite(numericDecay) && numericDecay > 0) {
                updatedWorkout.decay = numericDecay;
            }
        }
        
        if (updates.targetIncreasePercentage !== undefined) {
            const numericIncrease = Number(updates.targetIncreasePercentage);
            if (Number.isFinite(numericIncrease) && numericIncrease >= 0) {
                updatedWorkout.targetIncreasePercentage = numericIncrease;
            }
        }
        
        if (updates.targetFrequency !== undefined) {
            const numericFreq = Number(updates.targetFrequency);
            if (Number.isFinite(numericFreq) && numericFreq >= 1) {
                updatedWorkout.targetFrequency = Math.round(numericFreq);
            }
        }

        if (updates.workoutType !== undefined) {
            updatedWorkout.workoutType = isWorkoutType(updates.workoutType)
                ? updates.workoutType
                : undefined;
        }

        if (updates.momentumFactor !== undefined) {
            const numericFactor = Number(updates.momentumFactor);
            if (Number.isFinite(numericFactor) && numericFactor > 0) {
                updatedWorkout.momentumFactor = numericFactor;
            } else if (updates.momentumFactor === null || updates.momentumFactor === undefined) {
                updatedWorkout.momentumFactor = undefined;
            }
        }

        if (updates.lastLoggedAt !== undefined) {
          updatedWorkout.lastLoggedAt = updates.lastLoggedAt
            ? parseIsoTimestamp(updates.lastLoggedAt) ?? null
            : null;
        }

        if (updates.previousLoggedAt !== undefined) {
            updatedWorkout.previousLoggedAt = updates.previousLoggedAt
                ? parseIsoTimestamp(updates.previousLoggedAt) ?? null
                : null;
        }
        
        if (updates.dailyVolume !== undefined) {
            const dv = Number(updates.dailyVolume);
            if (Number.isFinite(dv) && dv >= 0) {
                updatedWorkout.dailyVolume = dv;
            }
        }

        if (updates.lastUpdateUnix !== undefined) {
          const parsedTimestamp = parseUnixTimestamp(updates.lastUpdateUnix);
          if (parsedTimestamp) {
            updatedWorkout.lastUpdateUnix = parsedTimestamp;
          }
        }

        if (updates.momentumHistory !== undefined) {
          updatedWorkout.momentumHistory = sanitizeMomentumHistory(
            updates.momentumHistory,
            today,
            updatedWorkout.momentum
          );
        } else if (momentumWasUpdated) {
          const history = Array.isArray(updatedWorkout.momentumHistory)
            ? updatedWorkout.momentumHistory
            : [];
          updatedWorkout.momentumHistory = ensureHistoryEntry(
            history,
            today,
            updatedWorkout.momentum
          );
        }

        // Recalculate reps if momentum, baseVolume, weight, or decay changed
        if (
          updates.momentum !== undefined ||
          updates.baseVolume !== undefined ||
          updates.weight !== undefined ||
          updates.isBodyweight !== undefined ||
          updates.bodyweightMultiplier !== undefined ||
          updates.decay !== undefined ||
          updates.targetIncreasePercentage !== undefined ||
          updates.targetFrequency !== undefined
        ) {
          const effectiveWeight = getEffectiveWeight(
            updatedWorkout.isBodyweight,
            updatedWorkout.weight,
            updatedWorkout.bodyweightMultiplier
          );
          const decay = updatedWorkout.decay ?? DECAY_RATE_PER_DAY;
          
          let daysSinceLastLog = 1;
          if (updatedWorkout.lastLoggedAt) {
              const last = normalizeDate(updatedWorkout.lastLoggedAt);
              daysSinceLastLog = Math.max(1, daysBetween(last, today));
          }

          updatedWorkout.repsRequired = calculateReps(
            updatedWorkout.momentum,
            updatedWorkout.baseVolume,
            effectiveWeight,
            decay,
            updatedWorkout.targetIncreasePercentage,
            daysSinceLastLog,
            updatedWorkout.targetFrequency,
            updatedWorkout.momentumFactor,
            getTargetRoundingMode(updatedWorkout.workoutType)
          );
        }
        return updatedWorkout;
      }
      return w;
    });
    saveWorkouts(updated);
    return updated;
  });
}

export function processDailyDecay(): void {
  const now = getNow();
  const nowIso = new Date(now).toISOString();
  const today = normalizeDate(nowIso);
  console.log(`[Debug] Processing daily decay at ${nowIso}`);
  workouts.update((current) => {
    let hasChanges = false;
    const updated = current.map((w) => {
      const decayRate = w.decay ?? DECAY_RATE_PER_DAY;
      const momentumFactor = w.momentumFactor;
      const decayResult = addVolumeAndUpdate(
        { momentum: w.momentum, lastUpdateUnix: w.lastUpdateUnix },
        0,
        now,
        decayRate,
        momentumFactor
      );

      const lastUpdateDate = normalizeDate(new Date(w.lastUpdateUnix));
      let momentumHistory = appendDecayHistory(w.momentumHistory, {
        startDate: lastUpdateDate || today,
        startMomentum: w.momentum,
        daysElapsed: decayResult.decayDaysElapsed ?? 0,
        decayRate
      });
      momentumHistory = ensureHistoryEntry(momentumHistory, today, decayResult.momentum);

      const momentumChanged =
        decayResult.momentum !== w.momentum || decayResult.lastUpdateUnix !== w.lastUpdateUnix;
      const historyChanged = momentumHistory !== w.momentumHistory;

      if (!momentumChanged && !historyChanged) {
        return w;
      }

      if (momentumChanged) {
        console.log(
          `[Debug] Decay applied to ${w.name}: ${w.momentum.toFixed(4)} -> ${decayResult.momentum.toFixed(4)}`
        );
      }

      hasChanges = true;
      const effectiveWeight = getEffectiveWeight(w.isBodyweight, w.weight, w.bodyweightMultiplier);

      let daysSinceLastLog = 1;
      if (w.lastLoggedAt) {
        const last = normalizeDate(w.lastLoggedAt);
        daysSinceLastLog = Math.max(1, daysBetween(last, today));
      }

      const updatedWorkout: Workout = {
        ...w,
        momentum: decayResult.momentum,
        lastUpdateUnix: decayResult.lastUpdateUnix,
        momentumHistory
      };

      const recalculatedDecayRate = updatedWorkout.decay ?? DECAY_RATE_PER_DAY;
      updatedWorkout.repsRequired = calculateReps(
        updatedWorkout.momentum,
        updatedWorkout.baseVolume,
        effectiveWeight,
        recalculatedDecayRate,
        updatedWorkout.targetIncreasePercentage,
        daysSinceLastLog,
        updatedWorkout.targetFrequency,
        updatedWorkout.momentumFactor,
        getTargetRoundingMode(updatedWorkout.workoutType)
      );
      return updatedWorkout;
    });
    
    if (hasChanges) {
        saveWorkouts(updated);
        return updated;
    }
    return current;
  });
}

export function deleteWorkout(id: string): void {
  workouts.update((current) => {
    const updated = current.filter((w) => w.id !== id);
    saveWorkouts(updated);
    return updated;
  });
}

export function getBackupData(): string {
  const settings = localStorage.getItem(SETTINGS_STORAGE_KEY);
  const workouts = localStorage.getItem(WORKOUTS_STORAGE_KEY);
  
  return JSON.stringify({
    version: 1,
    timestamp: new Date().toISOString(),
    settings: settings ? JSON.parse(settings) : null,
    workouts: workouts ? JSON.parse(workouts) : []
  }, null, 2);
}

export async function restoreBackupData(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup format');
    }

    // Basic validation
    if (data.settings) {
       localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data.settings));
    }
    
    if (data.workouts && Array.isArray(data.workouts)) {
       localStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(data.workouts));
    }

    // Reload stores
    loadSettings();
    await loadWorkouts();
    return true;
  } catch (e) {
    console.error("Import failed:", e);
    return false;
  }
}
