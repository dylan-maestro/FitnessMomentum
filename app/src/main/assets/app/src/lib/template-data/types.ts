import type { Workout } from '../types';

export type WorkoutTemplate = Pick<
  Workout,
  | 'name'
  | 'baseVolume'
  | 'weight'
  | 'isBodyweight'
  | 'bodyweightMultiplier'
  | 'targetIncreasePercentage'
  | 'targetFrequency'
  | 'workoutType'
  | 'distanceInputMode'
> & {
  icon?: string;
};

