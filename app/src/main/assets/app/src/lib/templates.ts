import type { WorkoutTemplate } from './template-data/types';
import { airSquatsTemplate } from './template-data/air-squats';
import { barbellRowTemplate } from './template-data/barbell-row';
import { barbellSquatTemplate } from './template-data/barbell-squat';
import { benchPressTemplate } from './template-data/bench-press';
import { cyclingTemplate } from './template-data/cycling';
import { dailyWalkTemplate } from './template-data/daily-walk';
import { deadHangTemplate } from './template-data/dead-hang';
import { dipsTemplate } from './template-data/dips';
import { runningTemplate } from './template-data/running';
import { overheadPressTemplate } from './template-data/overhead-press';
import { openWaterSwimmingTemplate } from './template-data/open-water-swimming';
import { plankTemplate } from './template-data/plank';
import { pullupsTemplate } from './template-data/pullups';
import { pushupsTemplate } from './template-data/pushups';
import { swimmingLapsTemplate } from './template-data/swimming-laps';
import { walkingLungesTemplate } from './template-data/walking-lunges';

export type { WorkoutTemplate };

const withDefaultTags = (template: WorkoutTemplate): WorkoutTemplate => ({
  ...template,
  tags: new Set([...(template.tags ?? []), 'common']),
  variants: template.variants?.map((variant) => ({
    ...variant,
    icon: variant.icon ?? template.icon,
    tags: new Set([...(variant.tags ?? template.tags ?? []), 'common'])
  }))
});

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  airSquatsTemplate,
  barbellRowTemplate,
  barbellSquatTemplate,
  benchPressTemplate,
  cyclingTemplate,
  dailyWalkTemplate,
  deadHangTemplate,
  dipsTemplate,
  overheadPressTemplate,
  openWaterSwimmingTemplate,
  plankTemplate,
  pullupsTemplate,
  pushupsTemplate,
  runningTemplate,
  swimmingLapsTemplate,
  walkingLungesTemplate,
].map(withDefaultTags);

export const ALL_WORKOUT_TEMPLATES: WorkoutTemplate[] = WORKOUT_TEMPLATES.flatMap((template) => [
  template,
  ...(template.variants ?? [])
]);
