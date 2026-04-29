import { writable } from 'svelte/store';
import type { Workout, Settings } from './types';
import { DEFAULT_REMINDER_SETTINGS } from './reminderSettings';

export const workouts = writable<Workout[]>([]);

export const settings = writable<Settings>({
  bodyWeight: 70,
  weightUnit: 'kg',
  distanceUnit: 'km',
  reminders: DEFAULT_REMINDER_SETTINGS
});

export const toastMessage = writable<string | null>(null);

export function showToast(message: string, duration: number = 3000) {
  toastMessage.set(message);
  setTimeout(() => {
    toastMessage.set(null);
  }, duration);
}
