<script lang="ts">
  import { updateWorkout } from '$lib/storage';
  import { showToast, settings } from '$lib/stores';
  import type { Workout } from '$lib/types';
  import { createEventDispatcher } from 'svelte';
  import { getNow } from '$lib/currentDate';
  import { DECAY_RATE_PER_DAY } from '$lib/momentum';
  import { fromMetricDistance, fromMetricWeight, toMetricDistance, toMetricWeight } from '$lib/units';
  import { getDefaultMomentumFactor, type WorkoutType } from '$lib/workoutTypes';

  type WorkoutWithBase = Workout & { baseVolume: number };

  export let workout: Partial<WorkoutWithBase> | null = null;

  const dispatch = createEventDispatcher();

  let name = workout?.name || '';
  let baseVolume = workout?.baseVolume ?? 0;
  let weight = workout?.weight ?? 10;
  let initialMomentum = workout?.momentum || 0;
  let decay = workout?.decay ?? DECAY_RATE_PER_DAY;
  let targetIncreasePercentageInput = (workout?.targetIncreasePercentage ?? 0) * 100;
  let targetFrequency = workout?.targetFrequency ?? 1;
  let previousWorkout: Partial<WorkoutWithBase> | null = null;
  let isBodyweight = workout?.isBodyweight ?? false;
  let bodyweightMultiplier = workout?.bodyweightMultiplier ?? (isBodyweight ? 1 : 0);
  let baseRepsInput: number | null = null;
  let simpleTimeDisplay = '';
  let baseTimeInputDisplay = '';
  let momentumTouched = false;
  let activeTab: 'simple' | 'advanced' = 'simple';
  let simpleReps: number | null = null;
  let unitLabel: 'kg' | 'lb' = 'kg';
  let workoutType: WorkoutType = workout?.workoutType ?? 'weight';
  let momentumFactor = workout?.momentumFactor ?? getDefaultMomentumFactor(workout?.workoutType ?? 'weight');
  let distanceInputMode: 'simple' | 'laps' = workout?.distanceInputMode ?? 'simple';
  let distanceInput = workout?.workoutType === 'distance' ? (workout?.baseVolume ?? 0) : 0;
  let timeInput = workout?.workoutType === 'time' ? (workout?.baseVolume ?? 0) : 0;
  let timeVolumeInputDisplay: number | null = null;
  let lapDistanceInput = 0; // Input in mtrs/yrds for laps-based mode
  let lapsInput: number | null = null;
  let dailyVolumeInput = workout?.dailyVolume ?? 0;
  let lastLoggedAtInput = workout?.lastLoggedAt ?? '';
  let previousLoggedAtInput = workout?.previousLoggedAt ?? '';
  let lastUpdateUnixInput = workout?.lastUpdateUnix ? String(workout.lastUpdateUnix) : String(getNow());
  let lastUpdateIsoInput = workout?.lastUpdateUnix ? new Date(workout.lastUpdateUnix).toISOString() : '';
  let showSuperAdvanced = false;
  let hasPersistedWorkout = false;

  $: hasPersistedWorkout = Boolean(workout?.id);

  const multipleFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  const volumeFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  const timeVolumeFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  const percentFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  type IsoValidationResult = { valid: true; value: string | null } | { valid: false };

  function validateIsoField(value: string, label: string): IsoValidationResult {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return { valid: true, value: null };
    }

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric > 0) {
        return { valid: true, value: new Date(numeric).toISOString() };
      }
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      showToast(`Please enter a valid date/time for ${label}`);
      return { valid: false };
    }

    return { valid: true, value: parsed.toISOString() };
  }

  function syncLastUpdateIso(value: string) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      lastUpdateIsoInput = new Date(numeric).toISOString();
      return;
    }
    lastUpdateIsoInput = '';
  }

  function parseMicrowaveTimeInput(value: string): number {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      return 0;
    }

    const secondsPart = digits.slice(-2);
    const minutesPart = digits.slice(0, -2);
    const seconds = Number(secondsPart || '0');
    const minutes = Number(minutesPart || '0');
    return minutes * 60 + seconds;
  }

  function formatMicrowaveTimeInput(seconds: number | null | undefined): string {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
      return '';
    }

    const safeSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainderSeconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainderSeconds).padStart(2, '0')}`;
  }

  function formatTimeVolume(value: number): string {
    const converted = fromMetricWeight(value, unitLabel) / 60;
    return timeVolumeFormatter.format(converted);
  }

  function toDisplayTimeVolumeValue(value: number): number {
    const converted = fromMetricWeight(value, unitLabel) / 60;
    return Math.round(converted * 100) / 100;
  }

  function fromDisplayTimeVolumeValue(value: number): number {
    return toMetricWeight(value * 60, unitLabel);
  }

  function syncLastUpdateMillisFromIso(value: string): boolean {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      lastUpdateIsoInput = '';
      lastUpdateUnixInput = '';
      return true;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      showToast('Please enter a valid ISO date/time for Last Update');
      syncLastUpdateIso(lastUpdateUnixInput);
      return false;
    }

    lastUpdateIsoInput = parsed.toISOString();
    lastUpdateUnixInput = String(parsed.getTime());
    return true;
  }

  function handleLastUpdateMillisInput(event: Event) {
    lastUpdateUnixInput = (event.target as HTMLInputElement).value;
    syncLastUpdateIso(lastUpdateUnixInput);
  }

  function handleLastUpdateIsoInput(event: Event) {
    lastUpdateIsoInput = (event.target as HTMLInputElement).value;
  }

  function handleLastUpdateIsoBlur(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    syncLastUpdateMillisFromIso(value);
  }

  function getSimpleEffectiveWeight(currentWeight: number = Number(weight)): number {
    if (isBodyweight) {
      return Math.max(1, bodyWeightDisplay * bodyweightMultiplier + currentWeight);
    }
    return Math.max(1, currentWeight);
  }

  // Sync simpleReps when opening modal or switching tabs
  function updateSimpleReps() {
    if (workoutType === 'distance') {
      return;
    }

    const effectiveWeight = getSimpleEffectiveWeight();
    if (effectiveWeight > 0) {
        simpleReps = Math.round(baseVolume / effectiveWeight);
        if (workoutType === 'time') {
          timeInput = simpleReps;
        }
    }
  }
  
  // Update volume when simple reps change
  function handleSimpleRepsChange() {
    if (simpleReps === null) return;

    const effectiveWeight = getSimpleEffectiveWeight();
    baseVolume = Math.round((simpleReps * effectiveWeight) * 100) / 100;
    if (workoutType === 'time') {
      timeInput = simpleReps;
    }
  }

  // Update volume when weight changes in simple mode
  function handleSimpleWeightChange() {
      if (simpleReps !== null) {
          handleSimpleRepsChange();
      }
  }

  function handleSimpleTimeInput(event: Event) {
    const rawValue = (event.target as HTMLInputElement).value;
    const seconds = parseMicrowaveTimeInput(rawValue);
    simpleTimeDisplay = formatMicrowaveTimeInput(seconds);
    simpleReps = seconds > 0 ? seconds : null;
    timeInput = seconds;
    baseVolume = seconds > 0 ? Math.round(seconds * getSimpleEffectiveWeight()) : 0;
  }

  function handleBaseTimeInput(event: Event) {
    const rawValue = (event.target as HTMLInputElement).value;
    const seconds = parseMicrowaveTimeInput(rawValue);
    baseTimeInputDisplay = formatMicrowaveTimeInput(seconds);
    baseRepsInput = seconds > 0 ? seconds : null;
  }

  function handleTimeVolumeInput(event: Event) {
    const rawValue = (event.target as HTMLInputElement).value;
    if (!rawValue) {
      timeVolumeInputDisplay = null;
      baseVolume = 0;
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    timeVolumeInputDisplay = parsed;
    baseVolume = fromDisplayTimeVolumeValue(parsed);
  }

  function getMaxIncreasePercent(freq: number): number {
    const normalized = Math.max(1, Math.round(Number(freq) || 1));
    if (normalized >= 7) {
      return 7;
    }
    return Math.min(7, normalized);
  }

  function clampIncreaseToCurrentMax() {
    const maxAllowed = getMaxIncreasePercent(targetFrequency);
    if (!Number.isFinite(maxAllowed)) {
      return;
    }
    const clamped = Math.min(Math.max(0, Number(targetIncreasePercentageInput) || 0), maxAllowed);
    if (clamped !== targetIncreasePercentageInput) {
      targetIncreasePercentageInput = clamped;
    }
  }

  function roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  function clampBodyweightMultiplier(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(1, Math.max(0, roundToTwoDecimals(value)));
  }

  function handleAdvancedIncreaseInput(event: Event) {
    const rawValue = (event.target as HTMLInputElement).value;
    if (!rawValue) {
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    targetIncreasePercentageInput = roundToTwoDecimals(parsed);
  }

  $: if (!workout && baseVolume === 0 && simpleReps !== null && simpleReps > 0) {
      handleSimpleRepsChange();
  }

  function setSimpleFrequency(freq: number) {
    targetFrequency = freq;
    clampIncreaseToCurrentMax();
  }

  $: unitLabel = $settings.weightUnit ?? 'kg';
  $: bodyWeightDisplay = fromMetricWeight($settings.bodyWeight, unitLabel);
  $: distanceUnitLabel = $settings.distanceUnit ?? 'km';
  $: lapDistanceUnitLabel = distanceUnitLabel === 'km' ? 'mtrs' : 'yrds';
  $: lapDistanceConversionFactor = distanceUnitLabel === 'km' ? 1000 : 1760;
  $: workoutValueUnitLabel =
    workoutType === 'distance'
      ? distanceUnitLabel
      : workoutType === 'time'
        ? `${unitLabel}.min`
        : unitLabel;
  $: defaultMomentumFactorDisplay =
    workoutType === 'distance'
      ? String(getDefaultMomentumFactor(workoutType))
      : getDefaultMomentumFactor(workoutType).toFixed(2);
  $: maxIncreasePercent = getMaxIncreasePercent(targetFrequency);
  
  // Ensure distanceInput defaults to 1 for distance workouts in simple mode
  $: if (workoutType === 'distance' && distanceInputMode === 'simple' && (distanceInput === 0 || distanceInput === null || distanceInput === undefined)) {
    distanceInput = 1;
    baseVolume = 1;
  }
  
  // Ensure lapsInput and lapDistanceInput have defaults for laps-based mode
  $: if (workoutType === 'distance' && distanceInputMode === 'laps' && lapDistanceInput === 0 && (lapsInput === null || lapsInput === 0)) {
    // Default: 50 mtrs × 20 laps (metric) or 25 yrds × 40 laps (imperial)
    lapDistanceInput = distanceUnitLabel === 'km' ? 50 : 25;
    lapsInput = distanceUnitLabel === 'km' ? 20 : 40;
    // Convert to km/mi for distanceInput
    distanceInput = lapDistanceInput / lapDistanceConversionFactor;
    baseVolume = Math.round((distanceInput * lapsInput) * 100) / 100;
  } else if (workoutType === 'distance' && distanceInputMode === 'laps' && lapDistanceInput === 0 && distanceInput > 0) {
    // If distanceInput exists but lapDistanceInput doesn't, convert it
    lapDistanceInput = distanceInput * lapDistanceConversionFactor;
  } else if (workoutType === 'distance' && distanceInputMode === 'laps' && (lapsInput === null || lapsInput === 0) && lapDistanceInput > 0) {
    // If lapDistanceInput exists but lapsInput doesn't, default to 1
    lapsInput = 1;
    distanceInput = lapDistanceInput / lapDistanceConversionFactor;
    baseVolume = Math.round((distanceInput * lapsInput) * 100) / 100;
  }

  $: if (workoutType === 'time' && (timeInput === 0 || timeInput === null || timeInput === undefined)) {
    timeInput = 60;
    baseVolume = Math.round(timeInput * getSimpleEffectiveWeight());
  }
  
  $: sliderStep = maxIncreasePercent <= 1 ? 0.01 : 0.1;
  $: clampedIncrease = Math.min(Math.max(0, Number(targetIncreasePercentageInput) || 0), maxIncreasePercent);
  $: intensity = maxIncreasePercent > 0 ? Math.min(1, clampedIncrease / maxIncreasePercent) : 0;
  $: sessionsPerYear = Math.max(1, Math.round(365 / Math.max(1, Number(targetFrequency) || 1)));
  $: progressionRate = clampedIncrease / 100;
  $: annualMultiple = Math.pow(1 + progressionRate, sessionsPerYear);
  $: projectedVolume = baseVolume > 0 ? baseVolume * annualMultiple : 0;
  $: annualMultipleDisplay = multipleFormatter.format(annualMultiple);
  $: projectedVolumeDisplay =
    workoutType === 'time'
      ? formatTimeVolume(projectedVolume)
      : volumeFormatter.format(projectedVolume);
  $: baseVolumeDisplay =
    workoutType === 'time'
      ? formatTimeVolume(baseVolume)
      : volumeFormatter.format(baseVolume);
  $: if (workoutType === 'time') {
    simpleTimeDisplay = formatMicrowaveTimeInput(simpleReps);
    baseTimeInputDisplay = formatMicrowaveTimeInput(baseRepsInput);
    timeVolumeInputDisplay = toDisplayTimeVolumeValue(baseVolume);
  }
  $: progressionPercentDisplay = percentFormatter.format(clampedIncrease);
  $: maxIncreasePercentDisplay = percentFormatter.format(maxIncreasePercent);
  
  function handleIntensityChange(e: Event) {
      const val = Number((e.target as HTMLInputElement).value);
      const clamped = Math.max(0, Math.min(maxIncreasePercent, val));
      targetIncreasePercentageInput = clamped;
  }

  function handleBodyweightChange() {
    // When switching to bodyweight, default offset to 0
    // When switching away, default weight to bodyweight (or some reasonable default)
    if (isBodyweight) {
        weight = 0;
    } else {
        const bodyWeight = bodyWeightDisplay;
        weight = bodyWeight > 0 ? bodyWeight : 10;
    }
  }

  function setBodyweightEnabled(enabled: boolean) {
    const wasBodyweight = isBodyweight;
    isBodyweight = enabled;
    bodyweightMultiplier = enabled ? Math.max(bodyweightMultiplier, 1) : 0;
    if (wasBodyweight !== isBodyweight) {
      handleBodyweightChange();
    }
  }

  function handleBodyweightMultiplierInput(event: Event) {
    const nextValue = Number((event.target as HTMLInputElement).value);
    const nextMultiplier = clampBodyweightMultiplier(nextValue);
    const wasBodyweight = isBodyweight;
    bodyweightMultiplier = nextMultiplier;
    isBodyweight = bodyweightMultiplier > 0;
    if (wasBodyweight !== isBodyweight) {
      handleBodyweightChange();
    }
  }

  function handleWorkoutTypeChange(newType: WorkoutType) {
    if (newType === 'distance') {
      workoutType = 'distance';
      momentumFactor = getDefaultMomentumFactor('distance');
      distanceInputMode = 'simple'; // Reset to simple when switching to distance
      if (distanceInput === 0 || distanceInput === null) {
        distanceInput = 1;
      }
      timeInput = 0;
      lapsInput = null;
      baseVolume = distanceInput;
    } else if (newType === 'time') {
      workoutType = 'time';
      momentumFactor = getDefaultMomentumFactor('time');
      distanceInputMode = 'simple';
      distanceInput = 0;
      lapDistanceInput = 0;
      lapsInput = null;
      if (timeInput === 0 || timeInput === null) {
        timeInput = 60;
      }
      isBodyweight = true;
      bodyweightMultiplier = Math.max(bodyweightMultiplier, 1);
      weight = 0;
      baseVolume = Math.round(timeInput * getSimpleEffectiveWeight(0));
    } else {
      workoutType = 'weight';
      momentumFactor = getDefaultMomentumFactor('weight');
      distanceInputMode = 'simple';
      distanceInput = 0;
      timeInput = 0;
      lapDistanceInput = 0;
      lapsInput = null;
    }
  }

  function handleDistanceInputChange() {
    if (distanceInputMode === 'simple') {
      baseVolume = Math.round(distanceInput * 100) / 100;
    } else {
      // Laps-based: distance * laps = baseVolume
      const laps = lapsInput ?? 1;
      baseVolume = Math.round((distanceInput * laps) * 100) / 100;
    }
  }

  function handleLapDistanceInputChange() {
    // Convert lapDistanceInput (mtrs/yrds) to distanceInput (km/mi)
    distanceInput = lapDistanceInput / lapDistanceConversionFactor;
    if (lapsInput !== null && lapsInput > 0) {
      baseVolume = Math.round((distanceInput * lapsInput) * 100) / 100;
    }
  }

  function handleLapsInputChange() {
    if (distanceInput > 0 && lapsInput !== null && lapsInput > 0) {
      baseVolume = Math.round((distanceInput * lapsInput) * 100) / 100;
    }
  }

  function handleDistanceInputModeChange(newMode: 'simple' | 'laps') {
    distanceInputMode = newMode;
    if (newMode === 'laps') {
      // Set default values based on unit system
      if (lapDistanceInput === 0 && (lapsInput === null || lapsInput === 0)) {
        // Default: 50 mtrs × 20 laps (metric) or 25 yrds × 40 laps (imperial)
        lapDistanceInput = distanceUnitLabel === 'km' ? 50 : 25;
        lapsInput = distanceUnitLabel === 'km' ? 20 : 40;
        // Convert to km/mi for distanceInput
        distanceInput = lapDistanceInput / lapDistanceConversionFactor;
      } else {
        // Initialize laps if not set
        if (lapsInput === null || lapsInput === 0) {
          lapsInput = 1;
        }
        // Convert distanceInput (km/mi) to lapDistanceInput (mtrs/yrds) for display
        if (lapDistanceInput === 0 && distanceInput > 0) {
          lapDistanceInput = distanceInput * lapDistanceConversionFactor;
        }
      }
      // Recalculate baseVolume
      if (distanceInput > 0 && lapsInput > 0) {
        baseVolume = Math.round((distanceInput * lapsInput) * 100) / 100;
      }
    } else {
      // Simple mode: baseVolume = distanceInput
      baseVolume = Math.round(distanceInput * 100) / 100;
      lapDistanceInput = 0;
    }
  }

  function handleCalculateVolume() {
    const reps = Number(baseRepsInput);
    const w = Number(weight);
    
    if (!Number.isFinite(reps) || reps < 0) {
      showToast(workoutType === 'time' ? 'Please enter a valid time' : 'Please enter valid reps');
      return;
    }
    // Weight (offset) can be negative for bodyweight
    if (!Number.isFinite(w)) {
      showToast('Please enter a valid weight');
      return;
    }
    if (!isBodyweight && w <= 0) {
        showToast('Weight must be greater than 0');
        return;
    }
    
    let effectiveWeight = w;
    if (isBodyweight) {
        effectiveWeight = Math.max(1, bodyWeightDisplay * bodyweightMultiplier + w);
    }
    
    baseVolume = Math.round((reps * effectiveWeight) * 100) / 100;
    if (workoutType === 'time') {
      timeInput = reps;
      simpleReps = reps;
      simpleTimeDisplay = formatMicrowaveTimeInput(reps);
    }
  }

  // Reactively update form when workout prop changes
  $: if (workout !== previousWorkout) {
    previousWorkout = workout;
    const isExistingRecord = Boolean(workout?.id);
    if (workout) {
      const templateWorkoutType = workout.workoutType ?? 'weight';
      const templateBaseVolumeMetric = workout.baseVolume ?? 0;
      const templateWeightMetric = workout.weight ?? 0;
      const templateIsBodyweight = workout.isBodyweight ?? false;
      const templateBodyweightMultiplier = clampBodyweightMultiplier(
        workout.bodyweightMultiplier ?? (templateIsBodyweight ? 1 : 0)
      );
      const templateEffectiveWeightMetric = templateBodyweightMultiplier > 0
        ? Math.max(1, $settings.bodyWeight * templateBodyweightMultiplier + templateWeightMetric)
        : Math.max(1, templateWeightMetric);
      const templateBaseVolume =
        templateWorkoutType === 'distance'
          ? fromMetricDistance(templateBaseVolumeMetric, distanceUnitLabel)
          : templateWorkoutType === 'time'
            ? Math.round(templateBaseVolumeMetric / templateEffectiveWeightMetric)
          : fromMetricWeight(templateBaseVolumeMetric, unitLabel);
      const templateWeight =
        templateWorkoutType === 'distance'
          ? fromMetricDistance(templateWeightMetric, distanceUnitLabel)
          : templateWorkoutType === 'time'
            ? fromMetricWeight(templateWeightMetric, unitLabel)
          : fromMetricWeight(templateWeightMetric, unitLabel);
      const templateMomentum = workout.momentum ?? 0;
      const templateDecay = workout.decay ?? DECAY_RATE_PER_DAY;
      const templateFrequency = workout.targetFrequency ?? 1;
      const templateIncrease = (workout.targetIncreasePercentage ?? 0) * 100;
      const templateDistanceMode = workout.distanceInputMode ?? 'simple';
      const templateMomentumFactor =
        workout.momentumFactor ??
        getDefaultMomentumFactor(templateWorkoutType);

      name = workout.name ?? '';
      baseVolume = templateWorkoutType === 'time' ? templateBaseVolumeMetric : templateBaseVolume;
      weight = templateWeight;
      initialMomentum = isExistingRecord ? templateMomentum : 0;
      decay = templateDecay;
      targetIncreasePercentageInput = templateIncrease;
      targetFrequency = templateFrequency;
      isBodyweight = templateIsBodyweight;
      bodyweightMultiplier = templateBodyweightMultiplier;
      isBodyweight = bodyweightMultiplier > 0;
      workoutType = templateWorkoutType;
      momentumFactor = templateMomentumFactor;
      distanceInputMode = templateDistanceMode;

      if (templateWorkoutType === 'distance') {
        if (templateDistanceMode === 'laps' && templateWeight > 0) {
          // For laps-based, weight stores per-lap distance in km internally.
          distanceInput = templateWeight;
          lapDistanceInput = distanceInput * lapDistanceConversionFactor;
          const lapsCalculated =
            templateBaseVolume > 0 && templateWeight > 0
              ? Math.round(templateBaseVolume / templateWeight)
              : 1;
          lapsInput = lapsCalculated || 1;
        } else {
          distanceInput = templateBaseVolume;
          lapDistanceInput = 0;
          lapsInput = null;
        }
        timeInput = 0;
      } else if (templateWorkoutType === 'time') {
        timeInput = Math.round(templateBaseVolume);
        baseVolume = templateBaseVolumeMetric;
        distanceInput = 0;
        lapDistanceInput = 0;
        lapsInput = null;
      } else {
        timeInput = 0;
        distanceInput = 0;
        lapDistanceInput = 0;
        lapsInput = null;
      }

      dailyVolumeInput =
        templateWorkoutType === 'distance'
          ? fromMetricDistance(workout.dailyVolume ?? 0, distanceUnitLabel)
          : templateWorkoutType === 'time'
            ? Math.round((workout.dailyVolume ?? 0) / templateEffectiveWeightMetric)
          : fromMetricWeight(workout.dailyVolume ?? 0, unitLabel);
      lastLoggedAtInput = workout.lastLoggedAt ?? '';
      previousLoggedAtInput = workout.previousLoggedAt ?? '';
      lastUpdateUnixInput = workout.lastUpdateUnix ? String(workout.lastUpdateUnix) : String(getNow());
      syncLastUpdateIso(lastUpdateUnixInput);
      updateSimpleReps();
    } else {
      name = '';
      baseVolume = 0;
      weight = 10;
      initialMomentum = 0;
      decay = DECAY_RATE_PER_DAY;
      targetIncreasePercentageInput = 0;
      targetFrequency = 1;
      isBodyweight = false;
      bodyweightMultiplier = 0;
      workoutType = 'weight';
        momentumFactor = getDefaultMomentumFactor('weight');
      distanceInput = 0;
        timeInput = 0;
      lapDistanceInput = 0;
      lapsInput = null;
      simpleReps = 10;
      // Note: When user switches to distance, handleWorkoutTypeChange will set distanceInput to 1
      dailyVolumeInput = 0;
      lastLoggedAtInput = '';
      previousLoggedAtInput = '';
      lastUpdateUnixInput = String(getNow());
      syncLastUpdateIso(lastUpdateUnixInput);
    }
    baseRepsInput = null; // Reset calculation helper
    baseTimeInputDisplay = '';
    momentumTouched = false;
    showSuperAdvanced = false;
  }

  // New workouts start at zero momentum unless the user explicitly overrides it.
  $: if (!hasPersistedWorkout && !momentumTouched) {
    initialMomentum = 0;
  }

  function handleMomentumInput() {
    momentumTouched = true;
  }

  function handleSave() {
    if (activeTab === 'simple') {
      clampIncreaseToCurrentMax();
    }
    const trimmedName = name.trim();

    if (!trimmedName) {
      showToast('Please enter an exercise name');
      return;
    }

    const roundedBaseVolumeDisplay = Math.round((Number(baseVolume) || 0) * 100) / 100;
    const roundedBaseVolume =
      workoutType === 'distance'
        ? toMetricDistance(roundedBaseVolumeDisplay, distanceUnitLabel)
        : workoutType === 'time'
          ? roundedBaseVolumeDisplay
        : toMetricWeight(roundedBaseVolumeDisplay, unitLabel);
    if (roundedBaseVolume < 0) {
      showToast('Base volume cannot be negative');
      return;
    }

    const normalizedWeightDisplay = Number(weight);
    if (!Number.isFinite(normalizedWeightDisplay)) {
      showToast('Please enter a valid weight');
      return;
    }
    if (workoutType !== 'distance' && !isBodyweight && normalizedWeightDisplay <= 0) {
        showToast('Weight must be greater than 0');
        return;
    }
    const normalizedWeight = toMetricWeight(normalizedWeightDisplay, unitLabel);
    const effectiveWeightMetric = isBodyweight
      ? Math.max(1, $settings.bodyWeight * bodyweightMultiplier + normalizedWeight)
      : Math.max(1, normalizedWeight);

    const normalizedMomentumFactor = Number(momentumFactor);
    if (!Number.isFinite(normalizedMomentumFactor) || normalizedMomentumFactor <= 0) {
      showToast('Please enter a valid momentum factor');
      return;
    }
    
    const normalizedDecay = Number(decay);
    if (!Number.isFinite(normalizedDecay) || normalizedDecay <= 0) {
      showToast('Please enter a valid decay rate');
      return;
    }

    const normalizedIncreasePercentage = Number(activeTab === 'simple' ? clampedIncrease : targetIncreasePercentageInput);
    if (!Number.isFinite(normalizedIncreasePercentage) || normalizedIncreasePercentage < 0) {
        showToast('Please enter a valid increase percentage');
        return;
    }
    if (activeTab === 'simple') {
      targetIncreasePercentageInput = normalizedIncreasePercentage;
    }
    const targetIncreasePercentage = normalizedIncreasePercentage / 100;

    const normalizedFrequency = Math.round(Number(targetFrequency));
    if (!Number.isFinite(normalizedFrequency) || normalizedFrequency < 1) {
        showToast('Please enter a valid frequency (days)');
        return;
    }

    const normalizedMomentum = Math.max(0, Number(initialMomentum) || 0);

    const normalizedDailyVolumeDisplay = Number(dailyVolumeInput);
    if (!Number.isFinite(normalizedDailyVolumeDisplay) || normalizedDailyVolumeDisplay < 0) {
      showToast('Please enter a valid daily volume');
      return;
    }
    const normalizedDailyVolume =
      workoutType === 'distance'
        ? toMetricDistance(normalizedDailyVolumeDisplay, distanceUnitLabel)
        : workoutType === 'time'
          ? Math.max(0, normalizedDailyVolumeDisplay) * effectiveWeightMetric
        : toMetricWeight(normalizedDailyVolumeDisplay, unitLabel);

    const trimmedLastUpdate = lastUpdateUnixInput?.trim() ?? '';
    const normalizedLastUpdateUnix = trimmedLastUpdate ? Number(trimmedLastUpdate) : getNow();
    if (!Number.isFinite(normalizedLastUpdateUnix) || normalizedLastUpdateUnix <= 0) {
      showToast('Please enter a valid last update timestamp (ms since epoch)');
      return;
    }

    const lastLoggedAtResult = validateIsoField(lastLoggedAtInput, 'last logged at');
    if (!lastLoggedAtResult.valid) {
      return;
    }
    const previousLoggedAtResult = validateIsoField(previousLoggedAtInput, 'previous logged at');
    if (!previousLoggedAtResult.valid) {
      return;
    }
    const normalizedLastLoggedAt = lastLoggedAtResult.value;
    const normalizedPreviousLoggedAt = previousLoggedAtResult.value;

    baseVolume = roundedBaseVolumeDisplay;
    weight = normalizedWeightDisplay;
    initialMomentum = normalizedMomentum;
    name = trimmedName;
    decay = normalizedDecay;

    // For laps-based distance workouts, store distance per lap in weight field
    const weightToSave = workoutType === 'distance' && distanceInputMode === 'laps'
      ? toMetricDistance(distanceInput, distanceUnitLabel)
      : normalizedWeight;

    if (workout?.id) {
      // Edit mode
      updateWorkout(workout.id, {
        name: trimmedName,
        baseVolume: roundedBaseVolume,
        weight: weightToSave,
        isBodyweight: isBodyweight,
        bodyweightMultiplier: bodyweightMultiplier,
        workoutType: workoutType,
        momentumFactor: normalizedMomentumFactor,
        distanceInputMode: workoutType === 'distance' ? distanceInputMode : undefined,
        momentum: normalizedMomentum,
        decay: normalizedDecay,
        targetIncreasePercentage: targetIncreasePercentage,
        targetFrequency: normalizedFrequency,
        lastLoggedAt: normalizedLastLoggedAt,
        previousLoggedAt: normalizedPreviousLoggedAt,
        dailyVolume: normalizedDailyVolume,
        lastUpdateUnix: normalizedLastUpdateUnix
      } as Partial<Workout>);
      showToast('Workout updated');
    } else {
      // Create mode
      dispatch('save', {
        name: trimmedName,
        baseVolume: roundedBaseVolume,
        weight: weightToSave,
        isBodyweight: isBodyweight,
        bodyweightMultiplier: bodyweightMultiplier,
        workoutType: workoutType,
        momentumFactor: normalizedMomentumFactor,
        distanceInputMode: workoutType === 'distance' ? distanceInputMode : undefined,
        momentum: normalizedMomentum,
        decay: normalizedDecay,
        targetIncreasePercentage: targetIncreasePercentage,
        targetFrequency: normalizedFrequency,
        lastLoggedAt: normalizedLastLoggedAt,
        previousLoggedAt: normalizedPreviousLoggedAt,
        dailyVolume: normalizedDailyVolume,
        lastUpdateUnix: normalizedLastUpdateUnix
      });
    }
    
    dispatch('close');
  }

  function handleClose() {
    dispatch('close');
  }

  let overlayElement: HTMLDivElement | null = null;

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === overlayElement) {
      handleClose();
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

<div
  class="modal-overlay"
  role="presentation"
  tabindex="-1"
  bind:this={overlayElement}
  on:click={handleOverlayClick}
  on:keydown={handleOverlayKeydown}
>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="modal-header">
      <h2 id="modal-title">{workout?.id ? 'Edit Exercise' : 'Create Exercise'}</h2>
      <div class="header-controls">
          <div class="tabs">
              <button 
                  class="tab-button {activeTab === 'simple' ? 'active' : ''}" 
                  on:click={() => { activeTab = 'simple'; updateSimpleReps(); clampIncreaseToCurrentMax(); }}
              >
                  Simple
              </button>
              <button 
                  class="tab-button {activeTab === 'advanced' ? 'active' : ''}" 
                  on:click={() => activeTab = 'advanced'}
              >
                  Advanced
              </button>
          </div>
          <button class="close-button" on:click={handleClose}>×</button>
      </div>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label for="name">Exercise Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="e.g., Push-ups"
          maxlength="50"
        />
      </div>

      {#if activeTab === 'simple'}
        <!-- Simple Mode UI -->
        <div class="simple-mode">
          <section class="baseline-section" aria-labelledby="baseline-title">
            <div class="baseline-header">
              <h3 id="baseline-title">Baseline Session</h3>
              <p>
                {#if workoutType === 'distance'}
                  Set the distance you can always cover, even after a break.
                {:else if workoutType === 'time'}
                  Set the hold duration you can reliably keep, even after a break.
                {:else}
                  Set the reps and weight you can always manage, even after a break.
                {/if}
              </p>
            </div>
            <div class="workout-type-toggle" role="group" aria-label="Workout type">
              <button
                type="button"
                class="type-btn {workoutType === 'weight' ? 'active' : ''}"
                aria-pressed={workoutType === 'weight'}
                on:click={() => handleWorkoutTypeChange('weight')}
              >
                Weight-based
              </button>
              <button
                type="button"
                class="type-btn {workoutType === 'distance' ? 'active' : ''}"
                aria-pressed={workoutType === 'distance'}
                on:click={() => handleWorkoutTypeChange('distance')}
              >
                Distance-based
              </button>
              <button
                type="button"
                class="type-btn {workoutType === 'time' ? 'active' : ''}"
                aria-pressed={workoutType === 'time'}
                on:click={() => handleWorkoutTypeChange('time')}
              >
                Time-based
              </button>
            </div>
            {#if workoutType !== 'distance'}
              <div class="subtype-section">
                <p class="subtype-label">{workoutType === 'time' ? 'Load setup' : 'Weight setup'}</p>
                <label class="switch-label">
                  <input
                    class="switch-input"
                    type="checkbox"
                    bind:checked={isBodyweight}
                    on:change={() => {
                      setBodyweightEnabled(isBodyweight);
                      handleSimpleWeightChange();
                    }}
                  />
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span class="switch-text">Bodyweight contributes</span>
                </label>
              </div>
              <div class="baseline-grid">
                <div class="form-subgroup">
                  <label for="simple-reps">
                    {workoutType === 'time'
                      ? 'Total hold time you can comfortably manage (mm:ss)'
                      : 'Total workout reps you can comfortably do (all sets combined)'}
                  </label>
                  {#if workoutType === 'time'}
                    <input
                      id="simple-reps"
                      type="text"
                      inputmode="numeric"
                      value={simpleTimeDisplay}
                      placeholder="00:00"
                      on:input={handleSimpleTimeInput}
                    />
                  {:else}
                    <input
                      id="simple-reps"
                      type="number"
                      bind:value={simpleReps}
                      min="1"
                      step="1"
                      on:input={handleSimpleRepsChange}
                    />
                  {/if}
                </div>
                <div class="form-subgroup">
                  <label for="baseline-weight">
                    {isBodyweight
                      ? `Added weight (+/-) (${unitLabel})`
                      : workoutType === 'time'
                        ? `Load used for the hold (${unitLabel})`
                        : `Weight per rep (${unitLabel})`}
                  </label>
                  <input
                    id="baseline-weight"
                    type="number"
                    bind:value={weight}
                    min={isBodyweight ? undefined : "0.1"}
                    step="any"
                    on:input={handleSimpleWeightChange}
                  />
                  {#if isBodyweight}
                    <small>
                      We add this to your body weight (<strong>{bodyWeightDisplay}</strong> {unitLabel}) to calculate volume.
                      Effective {workoutType === 'time' ? 'hold' : 'rep'} weight: <strong>{Math.max(1, bodyWeightDisplay * bodyweightMultiplier + (Number(weight) || 0))} {unitLabel}</strong>
                    </small>
                  {:else}
                    <small>
                      {workoutType === 'time'
                        ? `Use the load you are supporting during the hold (${unitLabel}).`
                        : `Use the load you move for each rep (${unitLabel}).`}
                    </small>
                  {/if}
                </div>
              </div>
            {:else if workoutType === 'distance'}
              <div class="subtype-section">
                <p class="subtype-label">Distance-based input mode</p>
                <div class="type-toggle" role="group" aria-label="Distance input mode">
                  <button
                    type="button"
                    class="type-btn {distanceInputMode === 'simple' ? 'active' : ''}"
                    aria-pressed={distanceInputMode === 'simple'}
                    on:click={() => handleDistanceInputModeChange('simple')}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    class="type-btn {distanceInputMode === 'laps' ? 'active' : ''}"
                    aria-pressed={distanceInputMode === 'laps'}
                    on:click={() => handleDistanceInputModeChange('laps')}
                  >
                    Laps-based
                  </button>
                </div>
              </div>
              {#if distanceInputMode === 'simple'}
                <div class="baseline-grid">
                  <div class="form-subgroup">
                    <label for="distance-input">Distance per session ({distanceUnitLabel})</label>
                    <input
                      id="distance-input"
                      type="number"
                      bind:value={distanceInput}
                      min="0"
                      step="0.1"
                      on:input={handleDistanceInputChange}
                    />
                    <small>Enter the distance you can comfortably cover in a session.</small>
                  </div>
                </div>
              {:else}
                <div class="baseline-grid">
                  <div class="form-subgroup">
                    <label for="distance-per-lap">Distance per lap ({lapDistanceUnitLabel})</label>
                    <input
                      id="distance-per-lap"
                      type="number"
                      bind:value={lapDistanceInput}
                      min="0"
                      step="1"
                      on:input={handleLapDistanceInputChange}
                    />
                    <small>Enter the distance covered in each lap ({lapDistanceUnitLabel}).</small>
                  </div>
                  <div class="form-subgroup">
                    <label for="laps-input">Number of laps</label>
                    <input
                      id="laps-input"
                      type="number"
                      bind:value={lapsInput}
                      min="1"
                      step="1"
                      on:input={handleLapsInputChange}
                    />
                    <small>Enter the number of laps you can comfortably complete.</small>
                  </div>
                </div>
              {/if}
            {/if}
            <div class="baseline-summary">
              <span class="summary-label">Base volume per session</span>
              <span class="summary-value">{baseVolumeDisplay} {workoutValueUnitLabel}</span>
            </div>
            <small class="baseline-footnote">This is the floor we use when rebuilding your momentum.</small>
          </section>

          <!-- Frequency Grid -->
          <div class="form-group">
            <span class="label-text">Frequency</span>
            <div class="frequency-grid">
              <button
                class="freq-btn {targetFrequency === 1 ? 'selected' : ''}"
                on:click={() => setSimpleFrequency(1)}
              >
                Daily
              </button>
              <button
                class="freq-btn {targetFrequency === 2 ? 'selected' : ''}"
                on:click={() => setSimpleFrequency(2)}
              >
                Every 2 Days
              </button>
              <button
                class="freq-btn {targetFrequency === 3 ? 'selected' : ''}"
                on:click={() => setSimpleFrequency(3)}
              >
                Every 3 Days
              </button>
              <button
                class="freq-btn {targetFrequency === 7 ? 'selected' : ''}"
                on:click={() => setSimpleFrequency(7)}
              >
                Weekly
              </button>
            </div>
          </div>

          <!-- Goal Intensity Slider -->
          <div class="form-group">
            <div class="label-row">
              <span class="label-text">Progression Goal</span>
              <span class="intensity-label">
                <span class="intensity-tier">
                  {#if intensity < 0.33}
                    Maintain
                  {:else if intensity < 0.66}
                    Build
                  {:else}
                    Challenge
                  {/if}
                </span>
                <span class="intensity-percent">{progressionPercentDisplay}% per session</span>
              </span>
            </div>
            <div class="slider-container">
              <input
                type="range"
                min="0"
                max={maxIncreasePercent}
                step={sliderStep}
                value={clampedIncrease}
                on:input={handleIntensityChange}
                class="intensity-slider"
                aria-valuemin="0"
                aria-valuemax={maxIncreasePercent}
                aria-valuenow={clampedIncrease}
                aria-valuetext={`${progressionPercentDisplay}% per session increase`}
              />
              <div class="slider-labels">
                <span>0%</span>
                <span>{maxIncreasePercentDisplay}%</span>
              </div>
            </div>
            <small>Determines how quickly your target increases.</small>
            <div class="annual-outlook" role="status" aria-live="polite">
              <div class="outlook-header">
                <span class="outlook-title">1 year outlook</span>
                <span class="outlook-multiple">{annualMultipleDisplay}×</span>
              </div>
              {#if baseVolume > 0}
                <div class="outlook-progress">
                  <div class="outcome">
                    <span class="outcome-label">Baseline today</span>
                    <span class="outcome-value">{baseVolumeDisplay} {workoutValueUnitLabel}</span>
                  </div>
                  <span class="outcome-arrow" aria-hidden="true">→</span>
                  <div class="outcome">
                    <span class="outcome-label">If you stay on pace</span>
                    <span class="outcome-value">{projectedVolumeDisplay} {workoutValueUnitLabel}</span>
                  </div>
                </div>
              {:else}
                <p class="outlook-empty">Set a baseline volume to see your 1-year target.</p>
              {/if}
              <small class="outlook-footnote">
                Assumes {sessionsPerYear} {sessionsPerYear === 1 ? 'session' : 'sessions'} per year at this progression.
              </small>
            </div>
          </div>
        </div>
      {:else}
        <!-- Advanced Mode UI (Existing) -->
      <div class="volume-calculation-group">
        <div class="form-group">
          <p class="label-text">Workout Type</p>
          <div class="workout-type-toggle" role="group" aria-label="Workout type">
            <button
              type="button"
              class="type-btn {workoutType === 'weight' ? 'active' : ''}"
              aria-pressed={workoutType === 'weight'}
              on:click={() => handleWorkoutTypeChange('weight')}
            >
              Weight-based
            </button>
            <button
              type="button"
              class="type-btn {workoutType === 'distance' ? 'active' : ''}"
              aria-pressed={workoutType === 'distance'}
              on:click={() => handleWorkoutTypeChange('distance')}
            >
              Distance-based
            </button>
            <button
              type="button"
              class="type-btn {workoutType === 'time' ? 'active' : ''}"
              aria-pressed={workoutType === 'time'}
              on:click={() => handleWorkoutTypeChange('time')}
            >
              Time-based
            </button>
          </div>
        </div>
        {#if workoutType !== 'distance'}
          <div class="form-group">
            <label for="weight">
              {isBodyweight
                ? `Bodyweight Offset (${unitLabel})`
                : workoutType === 'time'
                  ? `Base Load (${unitLabel})`
                  : `Base Weight (${unitLabel} per rep)`}
            </label>
            <div class="subtype-section">
              <label for="bodyweight-multiplier">Bodyweight reductive multiplier</label>
              <input
                id="bodyweight-multiplier"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={bodyweightMultiplier}
                on:input={handleBodyweightMultiplierInput}
                class="intensity-slider bodyweight-slider"
              />
              <div class="slider-labels">
                <span>0%</span>
                <span>{percentFormatter.format(bodyweightMultiplier * 100)}%</span>
              </div>
              <small>
                Controls how much of your body weight contributes to effective load (0 to 1).
              </small>
            </div>
            <input
              id="weight"
              type="number"
              bind:value={weight}
              min={isBodyweight ? undefined : "0.1"}
              step="any"
            />
            {#if isBodyweight}
              <small>
                  Global Body Weight: <strong>{bodyWeightDisplay} {unitLabel}</strong><br>
                  Effective Weight: <strong>{Math.max(1, bodyWeightDisplay * bodyweightMultiplier + (Number(weight) || 0))} {unitLabel}</strong>
              </small>
            {:else}
              <small>{workoutType === 'time' ? `Load used for the hold (${unitLabel})` : `Weight used for exercise (${unitLabel})`}</small>
            {/if}
          </div>

          <div class="form-group">
            <label for="baseRepsInput">{workoutType === 'time' ? 'Base Time (Optional)' : 'Base Reps (Optional)'}</label>
            {#if workoutType === 'time'}
              <input
                id="baseRepsInput"
                type="text"
                inputmode="numeric"
                value={baseTimeInputDisplay}
                placeholder="00:00"
                on:input={handleBaseTimeInput}
              />
            {:else}
              <input
                id="baseRepsInput"
                type="number"
                bind:value={baseRepsInput}
                min="0"
                step="1"
                placeholder="Reps to calculate volume"
              />
            {/if}
            <small>{workoutType === 'time' ? 'Enter hold time as mm:ss to calculate Base Volume below' : 'Enter reps to calculate Base Volume below'}</small>
          </div>

          <div class="calculate-action">
            <button type="button" class="calculate-button" on:click={handleCalculateVolume}>
              Calculate Volume
            </button>
          </div>
        {:else}
          <div class="form-group">
            <p class="label-text">Distance-based input mode</p>
            <div class="type-toggle" role="group" aria-label="Distance input mode">
              <button
                type="button"
                class="type-btn {distanceInputMode === 'simple' ? 'active' : ''}"
                aria-pressed={distanceInputMode === 'simple'}
                on:click={() => handleDistanceInputModeChange('simple')}
              >
                Simple
              </button>
              <button
                type="button"
                class="type-btn {distanceInputMode === 'laps' ? 'active' : ''}"
                aria-pressed={distanceInputMode === 'laps'}
                on:click={() => handleDistanceInputModeChange('laps')}
              >
                Laps-based
              </button>
            </div>
          </div>
          {#if distanceInputMode === 'simple'}
            <div class="form-group">
              <label for="distance-input-advanced">Distance per session ({distanceUnitLabel})</label>
              <input
                id="distance-input-advanced"
                type="number"
                bind:value={distanceInput}
                min="0"
                step="0.1"
                on:input={handleDistanceInputChange}
              />
              <small>Enter the distance you can comfortably cover in a session.</small>
            </div>
          {:else}
            <div class="form-group">
              <label for="distance-per-lap-advanced">Distance per lap ({distanceUnitLabel})</label>
              <input
                id="distance-per-lap-advanced"
                type="number"
                bind:value={distanceInput}
                min="0"
                step="0.1"
                on:input={handleDistanceInputChange}
              />
              <small>Enter the distance covered in each lap.</small>
            </div>
            <div class="form-group">
              <label for="laps-input-advanced">Number of laps</label>
              <input
                id="laps-input-advanced"
                type="number"
                bind:value={lapsInput}
                min="1"
                step="1"
                on:input={handleLapsInputChange}
              />
              <small>Enter the number of laps you can comfortably complete.</small>
            </div>
          {/if}
        {/if}

        <div class="form-group">
          <label for="baseVolume">
            Base Volume ({workoutValueUnitLabel})
          </label>
          {#if workoutType === 'time'}
            <input
              id="baseVolume"
              type="number"
              value={timeVolumeInputDisplay ?? ''}
              min="0"
              step="0.01"
              on:input={handleTimeVolumeInput}
            />
          {:else}
            <input
              id="baseVolume"
              type="number"
              bind:value={baseVolume}
              min="0"
              step={workoutType === 'distance' ? "0.1" : "1"}
            />
          {/if}
          <small>
            {workoutType === 'time'
              ? `Weighted hold volume shown in ${workoutValueUnitLabel} after bodyweight/added weight is applied.`
              : `Minimum volume added regardless of momentum (${workoutValueUnitLabel})`}
          </small>
        </div>
      </div>
      
      <div class="form-group">
        <label for="decay">Decay Rate (daily)</label>
        <input
          id="decay"
          type="number"
          bind:value={decay}
          min="0.000001"
          step="0.001"
        />
        <small>Daily decay coefficient (default: {DECAY_RATE_PER_DAY})</small>
      </div>

      <div class="form-group">
        <label for="increase">Target Increase (%)</label>
        <input
          id="increase"
          type="number"
          bind:value={targetIncreasePercentageInput}
          min="0"
          step="0.01"
          on:input={handleAdvancedIncreaseInput}
        />
        <small>Additional percentage to increase target volume</small>
      </div>

      <div class="form-group">
        <label for="frequency">Target Frequency (Days)</label>
        <input
          id="frequency"
          type="number"
          bind:value={targetFrequency}
          min="1"
          step="1"
        />
        <small>How often you plan to do this workout (1 = Daily, 7 = Weekly). Used for catch-up calculations.</small>
      </div>

      <div class="form-group">
        <label for="momentum">Initial Momentum (optional)</label>
        <input
          id="momentum"
          type="number"
          bind:value={initialMomentum}
          on:input={handleMomentumInput}
          min="0"
          step="any"
        />
        <small>Starting momentum value (decimals allowed, default: 0)</small>
      </div>

      <div class="super-advanced">
        <button
          type="button"
          class="super-toggle"
          aria-expanded={showSuperAdvanced}
          aria-controls="super-advanced-panel"
          on:click={() => (showSuperAdvanced = !showSuperAdvanced)}
        >
          {showSuperAdvanced ? 'Hide' : 'Show'} super advanced fields
        </button>
        <p class="super-hint">
          Directly edit the persisted workout record (timestamps, cached reps, and daily volume).
          These overrides are typically only necessary for debugging or migrating data.
        </p>
        {#if showSuperAdvanced}
          <div id="super-advanced-panel" class="super-grid">
            <div class="form-group">
              <label for="dailyVolumeRaw">Daily Volume (raw)</label>
              <input
                id="dailyVolumeRaw"
                type="number"
                bind:value={dailyVolumeInput}
                min="0"
                step="any"
              />
              <small>Current accumulated volume for the active day.</small>
            </div>

            <div class="form-group">
              <label for="lastLoggedAt">Last Logged At (ISO)</label>
              <input
                id="lastLoggedAt"
                type="text"
                bind:value={lastLoggedAtInput}
                placeholder="2025-01-03T12:00:00Z"
              />
              <small>Leave blank to clear. Accepts ISO strings or epoch millis.</small>
            </div>

            <div class="form-group">
              <label for="previousLoggedAt">Previous Logged At (ISO)</label>
              <input
                id="previousLoggedAt"
                type="text"
                bind:value={previousLoggedAtInput}
                placeholder="2024-12-31T18:30:00Z"
              />
              <small>Optional timestamp for the prior log event.</small>
            </div>

            <div class="form-group">
              <label for="lastUpdateUnix">Last Update Timestamp (ms)</label>
              <input
                id="lastUpdateUnix"
                type="text"
                inputmode="numeric"
                bind:value={lastUpdateUnixInput}
                on:input={handleLastUpdateMillisInput}
              />
              <small>Milliseconds since epoch used when applying decay.</small>
              <div class="iso-field">
                <label for="lastUpdateIso">ISO Timestamp</label>
                <input
                  id="lastUpdateIso"
                  type="text"
                  bind:value={lastUpdateIsoInput}
                  placeholder="2025-01-03T12:00:00Z"
                  on:input={handleLastUpdateIsoInput}
                  on:blur={handleLastUpdateIsoBlur}
                />
                <small>
                  Edit using a human-readable ISO time; we convert it back to milliseconds when you leave the field.
                </small>
              </div>
            </div>

            <div class="form-group">
              <label for="momentumFactor">Momentum Factor</label>
              <input
                id="momentumFactor"
                type="number"
                bind:value={momentumFactor}
                min="0.000001"
                step="0.001"
              />
              <small>Conversion factor from volume to momentum.</small>
              <small>Default: {defaultMomentumFactorDisplay} for {workoutType}-type workouts.</small>
            </div>

          </div>
          <p class="super-warning">
            ⚠️ Manual edits can desync derived values. Keep a backup before experimenting.
          </p>
        {/if}
      </div>
      {/if}

    </div>

    <div class="modal-footer">
      <button class="cancel-button" on:click={handleClose}>Cancel</button>
      <button class="save-button" on:click={handleSave}>Save</button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: #f4f6f8;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    z-index: 1000;
    padding: 0;
  }

  .modal {
    background: white;
    border-radius: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    overflow: hidden;
    box-shadow: none;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem;
    border-bottom: 1px solid #eee;
    flex-wrap: wrap;
    gap: 1rem;
    background: white;
  }

  .header-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
  }

  .tabs {
      display: flex;
      background: #f0f0f0;
      padding: 4px;
      border-radius: 8px;
  }

  .tab-button {
      background: none;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
      color: #666;
      font-weight: 500;
  }

  .tab-button.active {
      background: white;
      color: var(--color-primary);
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
 
  .baseline-section {
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 1.25rem;
      background: #fdfdfd;
      margin-bottom: 1.5rem;
  }

  .baseline-header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #2f2f2f;
  }

  .baseline-header p {
      margin: 0.35rem 0 1rem 0;
      color: #666;
      font-size: 0.9rem;
      line-height: 1.4;
  }

  .type-toggle,
  .workout-type-toggle {
      display: flex;
      gap: 0.5rem;
      background: #f4f6f8;
      padding: 0.4rem;
      border-radius: 10px;
      margin-bottom: 1.25rem;
  }

  .subtype-section {
      margin-bottom: 1.25rem;
  }

  .subtype-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #666;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
  }

  .type-btn {
      flex: 1;
      background: none;
      border: none;
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      color: #5a5a5a;
      cursor: pointer;
      transition: all 0.2s ease;
  }

  .type-btn.active {
      background: white;
      color: var(--color-primary-accent);
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  }

  .type-btn:focus-visible,
  .freq-btn:focus-visible,
  .tab-button:focus-visible,
  .calculate-button:focus-visible,
  .close-button:focus-visible,
  .cancel-button:focus-visible,
  .save-button:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
  }

  .baseline-grid {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
  }

  .form-subgroup {
      flex: 1 1 200px;
      min-width: 200px;
  }

  .form-subgroup input[type="text"],
  .form-subgroup input[type="number"] {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 1rem;
  }

  .form-subgroup input:focus {
      outline: none;
      border-color: #4CAF50;
  }

  .baseline-summary {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-top: 1.25rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: var(--color-primary-soft);
      border: 1px solid var(--color-primary-border);
      color: #2f2f2f;
      font-weight: 600;
  }

  .summary-label {
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #5a6b7b;
  }

  .summary-value {
      font-size: 1.25rem;
      color: var(--color-primary);
  }

  .baseline-footnote {
      display: block;
      margin-top: 0.65rem;
      color: #697481;
      font-size: 0.85rem;
  }

  .frequency-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
  }

  .freq-btn {
      background: white;
      border: 1px solid #ddd;
      padding: 0.75rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.95rem;
      transition: all 0.2s;
      color: #444;
  }

  .freq-btn:hover {
      background: #f9f9f9;
      border-color: #ccc;
  }

  .freq-btn.selected {
      background: var(--color-primary-soft);
      border-color: var(--color-primary);
      color: var(--color-primary-accent);
      font-weight: 600;
      box-shadow: inset 0 0 0 1px var(--color-primary);
  }

  .intensity-slider {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: linear-gradient(to right, #4CAF50, #FFC107, #F44336);
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      margin: 1rem 0 0.5rem 0;
  }

  .intensity-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: white;
      border: 2px solid #555;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #777;
  }

  .intensity-label {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.15rem;
  }

  .intensity-tier {
      font-size: 0.95rem;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.04em;
  }

  .intensity-percent {
      font-size: 0.8rem;
      color: #1b5e20;
      font-weight: 600;
  }

  .annual-outlook {
      margin-top: 1rem;
      padding: 1rem 1.1rem;
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(67, 160, 71, 0.12), rgba(25, 118, 210, 0.08));
      border: 1px solid rgba(46, 125, 50, 0.2);
      display: grid;
      gap: 0.75rem;
  }

  .outlook-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
  }

  .outlook-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #2e7d32;
      text-transform: uppercase;
      letter-spacing: 0.05em;
  }

  .outlook-multiple {
      font-size: 1.35rem;
      font-weight: 700;
      color: #0d652d;
  }

  .outlook-progress {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
  }

  .outcome {
      flex: 1 1 140px;
      min-width: 140px;
      background: rgba(255, 255, 255, 0.8);
      padding: 0.75rem;
      border-radius: 10px;
      border: 1px solid rgba(46, 125, 50, 0.15);
      display: grid;
      gap: 0.35rem;
  }

  .outcome-label {
      font-size: 0.85rem;
      color: #2e3d2e;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
  }

  .outcome-value {
      font-size: 1.2rem;
      font-weight: 700;
      color: #0d652d;
  }

  .outcome-arrow {
      font-size: 1.4rem;
      color: #1b5e20;
      font-weight: 700;
  }

  .outlook-empty {
      margin: 0;
      font-size: 0.9rem;
      color: #375237;
  }

  .outlook-footnote {
      font-size: 0.8rem;
      color: #305130;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #333;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 2rem;
    color: #666;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-button:hover {
    color: #333;
    border-radius: 4px;
    background-color: #f5f5f5;
  }

  .modal-body {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label,
  .form-subgroup label,
  .label-text {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }
  
  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .label-row .label-text {
    margin-bottom: 0;
  }
  
  .switch-label {
    font-size: 0.9rem;
    font-weight: normal !important;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }

  .switch-input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  .switch-track {
    width: 2.3rem;
    height: 1.35rem;
    border-radius: 999px;
    background: #d0d5dd;
    border: 1px solid #bcc4cf;
    position: relative;
    transition: background-color 0.2s ease, border-color 0.2s ease;
    flex-shrink: 0;
  }

  .switch-thumb {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: #fff;
    position: absolute;
    top: 0.12rem;
    left: 0.12rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease;
  }

  .switch-input:checked + .switch-track {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  .switch-input:checked + .switch-track .switch-thumb {
    transform: translateX(0.95rem);
  }

  .switch-input:focus-visible + .switch-track {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .switch-text {
    color: #333;
  }

  .form-group input[type="text"],
  .form-group input[type="number"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: #4CAF50;
  }

  .form-group small,
  .form-subgroup small {
    display: block;
    margin-top: 0.25rem;
    color: #666;
    font-size: 0.85rem;
  }

  .volume-calculation-group {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1rem;
    background-color: #fafafa;
    margin-bottom: 1.5rem;
  }

  .calculate-action {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }

  .calculate-button {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .calculate-button:hover {
    background: var(--color-primary-hover);
  }

  .super-advanced {
      border-top: 1px dashed #d0d0d0;
      padding-top: 1.25rem;
      margin-top: 1.5rem;
      display: grid;
      gap: 0.5rem;
  }

  .super-toggle {
      justify-self: flex-start;
      background: transparent;
      border: 1px solid #9c27b0;
      color: #9c27b0;
      padding: 0.4rem 0.9rem;
      border-radius: 999px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
  }

  .super-toggle:hover {
      background: #9c27b0;
      color: white;
  }

  .super-hint {
      margin: 0;
      font-size: 0.85rem;
      color: #555;
  }

  .super-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      padding: 1rem;
      border: 1px solid #ede7f6;
      border-radius: 10px;
      background: #faf5ff;
  }

  .super-warning {
      margin: 0;
      font-size: 0.85rem;
      color: #7b1fa2;
      font-weight: 600;
  }

  .iso-field {
      margin-top: 0.75rem;
      display: grid;
      gap: 0.35rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid #eee;
    background: white;
  }


  .cancel-button,
  .save-button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-button {
    background: #f5f5f5;
    color: #333;
  }

  .cancel-button:hover {
    background: #e0e0e0;
  }

  .save-button {
    background: #4CAF50;
    color: white;
    font-weight: 600;
  }

  .save-button:hover {
    background: #45a049;
  }
</style>
