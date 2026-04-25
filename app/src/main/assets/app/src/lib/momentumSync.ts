import { get } from 'svelte/store';
import { currentTimestamp, getNow } from './currentDate';
import { workouts } from './stores';
import { saveWorkouts } from './storage';
import { applyDecayOnly } from './momentum';
import type { Workout } from './types';

let isApplying = false;

function applyContinuousDecay(now: number, list: Workout[]): void {
  if (!list.length) {
    return;
  }

  let changed = false;
  const updated = list.map((workout) => {
    const decayed = applyDecayOnly(workout, now);
    if (decayed !== workout) {
      changed = true;
    }
    return decayed;
  });

  if (!changed) {
    return;
  }

  try {
    isApplying = true;
    workouts.set(updated);
    saveWorkouts(updated);
  } finally {
    isApplying = false;
  }
}

currentTimestamp.subscribe(() => {
  if (isApplying) {
    return;
  }
  const now = getNow();
  const list = get(workouts);
  applyContinuousDecay(now, list);
});

workouts.subscribe((list) => {
  if (isApplying) {
    return;
  }
  const now = getNow();
  applyContinuousDecay(now, list);
});
