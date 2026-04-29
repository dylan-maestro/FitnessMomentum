import type { GoalProgress } from './goalProgress';
import { getGoalProgress } from './goalProgress';
import type { ReminderSettings, Settings, Workout, WorkoutReminderSettings } from './types';
import {
  fromMetricDistance,
  fromMetricLapDistance,
  fromMetricWeight
} from './units';

export type ReminderItem = {
  id: string;
  name: string;
  line: string;
  remainingVolume: number;
  lastLoggedAt: string | null;
  targetFrequency: number;
  goalMet: boolean;
};

export type ReminderGroup = {
  time: string;
  items: ReminderItem[];
};

export type ReminderSnapshot = {
  version: 1;
  generatedAt: string;
  timezoneOffsetMinutes: number;
  enabled: boolean;
  groups: ReminderGroup[];
};

type ReminderUnits = Pick<Settings, 'weightUnit' | 'distanceUnit'>;

function getEffectiveReminderTimes(
  global: ReminderSettings,
  workoutReminders: WorkoutReminderSettings
): string[] {
  if (workoutReminders.mode === 'override') {
    return [workoutReminders.idealTime, workoutReminders.lastChanceTime]
      .filter((time): time is string => Boolean(time));
  }

  return [global.idealTime, global.lastChanceTime]
    .filter((time): time is string => Boolean(time));
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits
  }).format(value);
}

function formatRemainingLine(workout: Workout, progress: GoalProgress, units: ReminderUnits): string {
  if (progress.workoutType === 'distance') {
    if (progress.distanceInputMode === 'laps' && progress.distancePerLap > 0) {
      const lapDistance = Math.round(fromMetricLapDistance(progress.distancePerLap, units.distanceUnit ?? 'km'));
      const lapUnit = units.distanceUnit === 'mi' ? 'yd' : 'm';
      const laps = Math.max(0, Math.ceil(progress.remainingVolume / progress.distancePerLap));
      return `${workout.name} - ${formatNumber(laps, 0)} x ${formatNumber(lapDistance, 0)}${lapUnit} laps to go`;
    }

    const distance = Math.max(0, fromMetricDistance(progress.remainingVolume, units.distanceUnit ?? 'km'));
    return `${workout.name} - ${formatNumber(distance)} ${units.distanceUnit ?? 'km'} to go`;
  }

  if (progress.workoutType === 'time') {
    const seconds = Math.max(0, Math.ceil(progress.remainingVolume / progress.effectiveWeight));
    return `${workout.name} - ${formatNumber(seconds, 0)} sec to go`;
  }

  const reps = Math.max(0, Math.ceil(progress.remainingVolume / progress.effectiveWeight));
  const volume = Math.max(0, fromMetricWeight(progress.remainingVolume, units.weightUnit));
  return `${workout.name} - ${formatNumber(reps, 0)} reps (${formatNumber(volume)} ${units.weightUnit}) to go`;
}

export function buildReminderGroups(
  workouts: Workout[],
  settings: Settings,
  today: string
): ReminderGroup[] {
  if (!settings.reminders.enabled) {
    return [];
  }

  const groups = new Map<string, ReminderItem[]>();

  for (const workout of workouts) {
    const times = getEffectiveReminderTimes(settings.reminders, workout.reminders);
    if (times.length === 0) {
      continue;
    }

    const progress = getGoalProgress(workout, settings, today);
    if (progress.goalMet || progress.suppressedByFrequency) {
      continue;
    }

    const item: ReminderItem = {
      id: workout.id,
      name: workout.name,
      line: formatRemainingLine(workout, progress, settings),
      remainingVolume: progress.remainingVolume,
      lastLoggedAt: workout.lastLoggedAt,
      targetFrequency: progress.targetFrequency,
      goalMet: progress.goalMet
    };

    for (const time of new Set(times)) {
      groups.set(time, [...(groups.get(time) ?? []), item]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, items]) => ({ time, items }));
}

export function buildReminderSnapshot(
  workouts: Workout[],
  settings: Settings,
  today: string,
  now: Date = new Date()
): ReminderSnapshot {
  return {
    version: 1,
    generatedAt: now.toISOString(),
    timezoneOffsetMinutes: now.getTimezoneOffset(),
    enabled: settings.reminders.enabled,
    groups: buildReminderGroups(workouts, settings, today)
  };
}

export function getNotificationTitle(group: ReminderGroup): string {
  if (group.items.length === 1) {
    return 'Exercise reminder';
  }

  return `${group.items.length} exercises to go`;
}

export function getNotificationBody(group: ReminderGroup): string {
  return group.items.map((item) => item.line).join('\n');
}
