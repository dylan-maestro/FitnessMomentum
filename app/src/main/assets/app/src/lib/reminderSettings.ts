import type { ReminderSettings, ReminderTime, WorkoutReminderSettings } from './types';

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  idealTime: '07:30',
  lastChanceTime: '20:30'
};

export const DEFAULT_WORKOUT_REMINDERS: WorkoutReminderSettings = {
  mode: 'global',
  idealTime: null,
  lastChanceTime: null
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeReminderTime(value: unknown, fallback: ReminderTime = null): ReminderTime {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return TIME_PATTERN.test(trimmed) ? trimmed : fallback;
}

export function normalizeReminderSettings(value: unknown): ReminderSettings {
  const raw = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const hasIdealTime = Object.prototype.hasOwnProperty.call(raw, 'idealTime');
  const hasLastChanceTime = Object.prototype.hasOwnProperty.call(raw, 'lastChanceTime');

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_REMINDER_SETTINGS.enabled,
    idealTime: hasIdealTime
      ? normalizeReminderTime(raw.idealTime, null)
      : DEFAULT_REMINDER_SETTINGS.idealTime,
    lastChanceTime: hasLastChanceTime
      ? normalizeReminderTime(raw.lastChanceTime, null)
      : DEFAULT_REMINDER_SETTINGS.lastChanceTime
  };
}

export function normalizeWorkoutReminders(value: unknown): WorkoutReminderSettings {
  const raw = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const mode = raw.mode === 'override' ? 'override' : 'global';

  return {
    mode,
    idealTime: normalizeReminderTime(raw.idealTime),
    lastChanceTime: normalizeReminderTime(raw.lastChanceTime)
  };
}

export function mergeReminderSettings(
  current: ReminderSettings | undefined,
  updates: Partial<ReminderSettings>
): ReminderSettings {
  return normalizeReminderSettings({
    ...(current ?? DEFAULT_REMINDER_SETTINGS),
    ...updates
  });
}
