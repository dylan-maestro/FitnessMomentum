import type { Workout } from '../types';

type WorkoutTemplateFields = Pick<
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
>;

export interface WorkoutTemplate extends WorkoutTemplateFields {
  icon?: string;
  variants?: WorkoutTemplate[];
  tags?: ReadonlySet<string>;
}

