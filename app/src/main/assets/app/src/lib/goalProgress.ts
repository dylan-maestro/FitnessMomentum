import { DECAY_RATE_PER_DAY } from './momentum';
import { calculateReps } from './reps';
import type { Settings, Workout } from './types';
import { daysBetween, normalizeDate } from './date';
import { getDefaultMomentumFactor } from './workoutTypes';

export type GoalProgress = {
  today: string;
  workoutType: Workout['workoutType'];
  distanceInputMode: Workout['distanceInputMode'];
  todayVolume: number;
  startOfDayMomentum: number;
  effectiveWeight: number;
  distancePerLap: number;
  decayRate: number;
  targetFrequency: number;
  daysSinceLastLog: number;
  daysSinceMostRecentLog: number | null;
  dailyTargetReps: number;
  dailyTargetVolume: number;
  remainingVolume: number;
  progressPercent: number;
  goalMet: boolean;
  suppressedByFrequency: boolean;
};

function getBodyweightContributionMultiplier(workout: Workout): number {
  if (typeof workout.bodyweightMultiplier === 'number' && Number.isFinite(workout.bodyweightMultiplier)) {
    return Math.min(1, Math.max(0, workout.bodyweightMultiplier));
  }

  return workout.isBodyweight ? 1 : 0;
}

export function getEffectiveWorkoutWeight(workout: Workout, settings: Settings): number {
  const bodyweightContributionMultiplier = getBodyweightContributionMultiplier(workout);
  if (bodyweightContributionMultiplier > 0) {
    return Math.max(1, settings.bodyWeight * bodyweightContributionMultiplier + workout.weight);
  }

  return Math.max(1, workout.weight);
}

export function getGoalProgress(
  workout: Workout,
  settings: Settings,
  today: string
): GoalProgress {
  const workoutType = workout.workoutType ?? 'weight';
  const distanceInputMode = workout.distanceInputMode ?? 'simple';
  const momentumFactor = workout.momentumFactor ?? getDefaultMomentumFactor(workoutType);
  const isSameDay = Boolean(workout.lastLoggedAt && normalizeDate(workout.lastLoggedAt) === today);
  const todayVolume = isSameDay ? workout.dailyVolume || 0 : 0;
  const momentumFromLogs = todayVolume * momentumFactor;
  const startOfDayMomentum = Math.max(0, workout.momentum - momentumFromLogs);
  const effectiveWeight = getEffectiveWorkoutWeight(workout, settings);
  const distancePerLap =
    workoutType === 'distance' && distanceInputMode === 'laps'
      ? workout.weight
      : 0;
  const decayRate = workout.decay ?? DECAY_RATE_PER_DAY;
  const targetFrequency = Math.max(1, workout.targetFrequency ?? 1);
  const daysSinceLastLog = (() => {
    if (isSameDay) {
      if (workout.previousLoggedAt) {
        const previousDate = normalizeDate(workout.previousLoggedAt);
        return Math.max(1, daysBetween(previousDate, today));
      }

      return 1;
    }

    if (workout.lastLoggedAt) {
      const lastDate = normalizeDate(workout.lastLoggedAt);
      return Math.max(1, daysBetween(lastDate, today));
    }

    return 1;
  })();
  const daysSinceMostRecentLog = workout.lastLoggedAt
    ? daysBetween(normalizeDate(workout.lastLoggedAt), today)
    : null;
  const dailyTargetReps = calculateReps(
    startOfDayMomentum,
    workout.baseVolume ?? 0,
    effectiveWeight,
    decayRate,
    workout.targetIncreasePercentage ?? 0,
    daysSinceLastLog,
    targetFrequency,
    momentumFactor,
    workoutType === 'distance' ? 'none' : 'ceil'
  );
  const dailyTargetVolume =
    workoutType === 'distance'
      ? dailyTargetReps
      : dailyTargetReps * effectiveWeight;
  const remainingVolume = Math.max(0, dailyTargetVolume - todayVolume);
  const progressPercent =
    dailyTargetVolume > 0
      ? Math.min(100, (todayVolume / dailyTargetVolume) * 100)
      : todayVolume > 0
        ? 100
        : 0;
  const goalMet = dailyTargetVolume <= 0 || remainingVolume <= 0;
  const suppressedByFrequency =
    daysSinceMostRecentLog !== null &&
    daysSinceMostRecentLog > 0 &&
    daysSinceMostRecentLog < targetFrequency;

  return {
    today,
    workoutType,
    distanceInputMode,
    todayVolume,
    startOfDayMomentum,
    effectiveWeight,
    distancePerLap,
    decayRate,
    targetFrequency,
    daysSinceLastLog,
    daysSinceMostRecentLog,
    dailyTargetReps,
    dailyTargetVolume,
    remainingVolume,
    progressPercent,
    goalMet,
    suppressedByFrequency
  };
}
