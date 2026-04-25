import type { WorkoutType } from './workoutTypes';

export type MomentumHistoryEntry = {
  date: string;
  momentum: number;
};

export type Workout = {
  id: string;
  name: string;
  momentum: number;
  allTimeHighMomentum?: number; // Highest momentum this workout has ever reached.
  lastAllTimeHighCelebratedOn?: string | null; // Local YYYY-MM-DD date when the ATH celebration last fired.
  baseVolume: number;
  decay?: number; // Daily decay rate. Optional, defaults to the fixed global constant.
  targetIncreasePercentage?: number; // Optional percentage to increase target volume (e.g. 0.1 for 10%)
  targetFrequency?: number; // Optional target frequency in days (default 1). Used to calculate catch-up volume.
  weight: number;
  isBodyweight: boolean;
  bodyweightMultiplier?: number; // Fraction of bodyweight that contributes to effective load (0..1).
  workoutType?: WorkoutType; // Optional workout type (defaults to 'weight' for backward compatibility)
  momentumFactor?: number; // Optional momentum conversion factor (defaults to TONNAGE_TO_MOMENTUM)
  distanceInputMode?: 'simple' | 'laps'; // Optional distance input mode (defaults to 'simple' for backward compatibility)
  dailyVolume: number; // Accumulated volume for the date specified in lastLoggedAt
  lastLoggedAt: string | null; // ISO timestamp when volume was last recorded
  previousLoggedAt?: string | null; // ISO timestamp of the log BEFORE the current day (used for catch-up calc)
  lastUpdateUnix: number; // Unix timestamp (ms) used for continuous decay
  repsRequired: number; // Calculated: (baseVolume + momentum * multiplier) / weight
  momentumHistory: MomentumHistoryEntry[]; // Chronological momentum snapshots (most recent last)
};

export type Settings = {
  bodyWeight: number;
  weightUnit: 'kg' | 'lb';
  distanceUnit?: 'km' | 'mi'; // Optional distance unit preference (defaults to 'km')
};
