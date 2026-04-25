import { writable } from 'svelte/store';
import type { Workout, Settings } from './types';

export const workouts = writable<Workout[]>([]);

export const settings = writable<Settings>({
  bodyWeight: 70,
  weightUnit: 'kg',
  distanceUnit: 'km'
});

export const toastMessage = writable<string | null>(null);

export function showToast(message: string, duration: number = 3000) {
  toastMessage.set(message);
  setTimeout(() => {
    toastMessage.set(null);
  }, duration);
}
