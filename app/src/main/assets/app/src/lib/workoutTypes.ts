import { TONNAGE_TO_MOMENTUM } from './momentum';

export type WorkoutType = 'weight' | 'distance' | 'time';

export const DISTANCE_TO_MOMENTUM = 10;
// 60 sec at bodyweight should land near a moderate 10 rep pulling session.
export const TIME_TO_MOMENTUM = 0.00167;

export function getDefaultMomentumFactor(workoutType: WorkoutType = 'weight'): number {
  switch (workoutType) {
    case 'distance':
      return DISTANCE_TO_MOMENTUM;
    case 'time':
      return TIME_TO_MOMENTUM;
    default:
      return TONNAGE_TO_MOMENTUM;
  }
}

export function isWorkoutType(value: unknown): value is WorkoutType {
  return value === 'weight' || value === 'distance' || value === 'time';
}
