<script lang="ts">
  import { updateWorkout } from "$lib/storage";
  import { showToast, settings } from "$lib/stores";
  import type { Workout } from "$lib/types";
  import { createEventDispatcher, onDestroy, tick } from "svelte";
  import {
    applyMomentumUpdate,
  } from "$lib/momentum";
  import { getNow, currentDate } from "$lib/currentDate";
  import { normalizeDate, daysBetween } from "$lib/date";
  import {
    fromMetricDistance,
    fromMetricLapDistance,
    fromMetricWeight,
    toMetricDistance,
    toMetricLapDistance,
    toMetricWeight,
  } from "$lib/units";
  import MomentumHistoryModal from "$lib/components/MomentumHistoryModal.svelte";
  import { ALL_WORKOUT_TEMPLATES } from "$lib/templates";
  import { getGoalProgress } from "$lib/goalProgress";
  import { shareWorkoutProgress } from "$lib/shareProgress";
  import AppIconSvg from "../../icon-source/app-icon.svg?raw";

  type WorkoutWithBase = Workout & { baseVolume?: number };

  export let workout: WorkoutWithBase;

  const dispatch = createEventDispatcher();

  let localWorkout: WorkoutWithBase = workout;
  let repsInput = "";
  let lapsInput = "";
  let hasManualReps = false;
  let hasManualLaps = false;
  let isLogging = false;
  let isPrimaryInputDragging = false;
  let primaryInputDragPointerId: number | null = null;
  let primaryInputDragStartY = 0;
  let primaryInputDragStartValue = 0;
  let primaryInputDragMoved = false;
  let primaryAdjusterOffsetY = 0;
  let isLapsInputDragging = false;
  let lapsInputDragPointerId: number | null = null;
  let lapsInputDragStartY = 0;
  let lapsInputDragStartValue = 1;
  let lapsInputDragMoved = false;
  let lapsAdjusterOffsetY = 0;
  let isWeightInputDragging = false;
  let weightInputDragPointerId: number | null = null;
  let weightInputDragStartY = 0;
  let weightInputDragStartValue = 0;
  let weightInputDragMoved = false;
  let weightAdjusterOffsetY = 0;
  let recommendedReps = 0;
  let unitLabel: "kg" | "lb" = "kg";
  let showHistoryModal = false;
  let showPeakCelebration = false;
  let peakCelebrationTimeout: ReturnType<typeof setTimeout> | null = null;
  const TREND_LOOKBACK = 7;
  const SPARKLINE_LOOKBACK_DAYS = 30;
  const SPARKLINE_WIDTH = 220;
  const SPARKLINE_HEIGHT = 110;
  const SPARKLINE_MARGIN_X = 10;
  const SPARKLINE_MARGIN_Y = 8;
  const SPARKLINE_DRAW_WIDTH = SPARKLINE_WIDTH - SPARKLINE_MARGIN_X * 2;
  const SPARKLINE_DRAW_HEIGHT = SPARKLINE_HEIGHT - SPARKLINE_MARGIN_Y * 2;
  const SPARKLINE_STROKE_WIDTH = 3;
  const DRAG_PIXELS_PER_STEP = 24;
  const ADJUSTER_TAP_MOVE_TOLERANCE = 8;
  const MAX_ADJUSTER_DEFLECTION_PX = 6;
  const ADJUSTER_DEFLECTION_CURVE = 42;
  const TIME_UNIT_LABEL = "sec";
  type SparklinePalette = {
    stroke: string;
    gradientStart: string;
    gradientEnd: string;
  };
  const SPARKLINE_POSITIVE: SparklinePalette = {
    stroke: "rgba(56, 142, 60, 0.75)",
    gradientStart: "rgba(67, 160, 71, 0.35)",
    gradientEnd: "rgba(67, 160, 71, 0)",
  };
  const SPARKLINE_NEGATIVE: SparklinePalette = {
    stroke: "rgba(198, 40, 40, 0.78)",
    gradientStart: "rgba(239, 83, 80, 0.28)",
    gradientEnd: "rgba(239, 83, 80, 0)",
  };
  const fallbackIcon = (AppIconSvg ?? "").trim();
  const templateIconMap = new Map(
    ALL_WORKOUT_TEMPLATES.map((template) => [
      template.name.trim(),
      (template.icon ?? "").trim(),
    ]),
  );

  function getWorkoutIconMarkup(name?: string | null): string {
    if (!name) {
      return fallbackIcon;
    }

    const trimmedName = name.trim();
    const iconMarkup = templateIconMap.get(trimmedName);
    return iconMarkup && iconMarkup.length > 0 ? iconMarkup : fallbackIcon;
  }

  function getAllTimeHighMomentum(target: WorkoutWithBase): number {
    const historyPeak = Array.isArray(target.momentumHistory)
      ? target.momentumHistory.reduce((peak, entry) => {
          const value = Number(entry?.momentum);
          return Number.isFinite(value) && value > peak ? value : peak;
        }, 0)
      : 0;
    const storedPeak =
      typeof target.allTimeHighMomentum === "number" &&
      Number.isFinite(target.allTimeHighMomentum) &&
      target.allTimeHighMomentum >= 0
        ? target.allTimeHighMomentum
        : 0;

    return Math.max(storedPeak, Number(target.momentum) || 0, historyPeak);
  }

  function roundPeakMomentumForMilestone(momentum: number): number {
    if (!Number.isFinite(momentum) || momentum <= 0) {
      return 0;
    }
    return Math.round(momentum * 10) / 10;
  }

  function clearPeakCelebrationTimer() {
    if (peakCelebrationTimeout) {
      clearTimeout(peakCelebrationTimeout);
      peakCelebrationTimeout = null;
    }
  }

  function triggerPeakCelebration() {
    clearPeakCelebrationTimer();
    showPeakCelebration = true;
    peakCelebrationTimeout = setTimeout(() => {
      showPeakCelebration = false;
      peakCelebrationTimeout = null;
    }, 2200);
  }

  function persistLoggedWorkout(updated: WorkoutWithBase, now: number) {
    const today = normalizeDate(new Date(now));
    const previousPeak = getAllTimeHighMomentum(localWorkout);
    const reachedNewPeak =
      roundPeakMomentumForMilestone(updated.momentum) >
      roundPeakMomentumForMilestone(previousPeak);
    const allTimeHighMomentum = reachedNewPeak ? updated.momentum : previousPeak;
    const shouldCelebratePeak =
      reachedNewPeak && localWorkout.lastAllTimeHighCelebratedOn !== today;

    updateWorkout(localWorkout.id, {
      momentum: updated.momentum,
      lastUpdateUnix: updated.lastUpdateUnix,
      lastLoggedAt: updated.lastLoggedAt,
      previousLoggedAt: updated.previousLoggedAt,
      dailyVolume: updated.dailyVolume,
      momentumHistory: updated.momentumHistory,
      allTimeHighMomentum,
      lastAllTimeHighCelebratedOn: shouldCelebratePeak
        ? today
        : (localWorkout.lastAllTimeHighCelebratedOn ?? null),
    });

    return { shouldCelebratePeak, allTimeHighMomentum };
  }

  onDestroy(() => {
    clearPeakCelebrationTimer();
  });

  $: historySeries = Array.isArray(localWorkout.momentumHistory)
    ? localWorkout.momentumHistory
    : [];
  $: allTimeHighMomentum = getAllTimeHighMomentum(localWorkout);
  $: isAtAllTimeHigh =
    allTimeHighMomentum > 0 &&
    localWorkout.momentum >= allTimeHighMomentum - 1e-6;
  $: trendSpan =
    historySeries.length > 1
      ? Math.min(TREND_LOOKBACK, historySeries.length - 1)
      : 0;
  $: trendBaseline =
    trendSpan > 0 ? historySeries[historySeries.length - 1 - trendSpan] : null;
  $: trendLatest = historySeries.length
    ? historySeries[historySeries.length - 1]
    : null;
  $: trendDelta =
    trendLatest && trendBaseline
      ? trendLatest.momentum - trendBaseline.momentum
      : null;
  $: trendPercent =
    trendDelta !== null && trendBaseline && trendBaseline.momentum > 0
      ? (trendDelta / trendBaseline.momentum) * 100
      : null;
  $: trendText =
    trendDelta === null
      ? "—"
      : `${trendDelta > 0 ? "+" : ""}${trendDelta.toFixed(1)}`;
  $: trendPercentText =
    trendPercent === null
      ? ""
      : ` (${trendPercent > 0 ? "+" : ""}${trendPercent.toFixed(1)}%)`;
  $: trendBadgeText =
    trendSpan > 0 && trendDelta !== null
      ? `${trendSpan}d ${trendText}`
      : "Trend —";
  $: trendClass =
    trendDelta === null
      ? "neutral"
      : trendDelta > 0
        ? "positive"
        : trendDelta < 0
          ? "negative"
          : "neutral";
  $: trendTooltip =
    trendSpan > 0 && trendDelta !== null
      ? `${trendSpan} day change ${trendText}${trendPercentText}`
      : "Momentum trend unavailable";
  $: workoutIconMarkup = getWorkoutIconMarkup(localWorkout.name);
  $: sparklineSortedHistory = historySeries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  $: sparklineRecentEntries = (() => {
    if (!sparklineSortedHistory.length) {
      return [];
    }
    const latest = sparklineSortedHistory[sparklineSortedHistory.length - 1];
    if (!latest?.date) {
      return [];
    }
    const withinWindow = sparklineSortedHistory.filter((entry) => {
      if (!entry?.date) {
        return false;
      }
      return (
        daysBetween(entry.date, latest.date) <= SPARKLINE_LOOKBACK_DAYS - 1
      );
    });
    if (withinWindow.length) {
      return withinWindow;
    }
    const fallbackCount = Math.min(
      SPARKLINE_LOOKBACK_DAYS,
      sparklineSortedHistory.length,
    );
    return sparklineSortedHistory.slice(-fallbackCount);
  })();
  $: sparklineMomentumValues = sparklineRecentEntries.map(
    (entry) => entry.momentum,
  );
  $: sparklineMin =
    sparklineMomentumValues.length > 0
      ? Math.min(...sparklineMomentumValues)
      : null;
  $: sparklineMax =
    sparklineMomentumValues.length > 0
      ? Math.max(...sparklineMomentumValues)
      : null;
  $: sparklineRange =
    sparklineMin !== null && sparklineMax !== null
      ? Math.max(sparklineMax - sparklineMin, 1)
      : null;
  $: sparklinePoints =
    sparklineRange !== null && sparklineMin !== null
      ? sparklineRecentEntries.map((entry, index) => {
          const ratio =
            sparklineRecentEntries.length > 1
              ? index / (sparklineRecentEntries.length - 1)
              : 0.5;
          const x = SPARKLINE_MARGIN_X + ratio * SPARKLINE_DRAW_WIDTH;
          const normalized =
            sparklineRange === 0
              ? 0.5
              : Math.min(
                  1,
                  Math.max(
                    0,
                    (entry.momentum - sparklineMin) / (sparklineRange || 1),
                  ),
                );
          const y =
            SPARKLINE_MARGIN_Y +
            SPARKLINE_DRAW_HEIGHT -
            normalized * (SPARKLINE_DRAW_HEIGHT || 1);
          return { x, y };
        })
      : [];
  $: sparklineColorSet = (() => {
    if (sparklineRecentEntries.length >= 2) {
      const firstMomentum = sparklineRecentEntries[0]?.momentum ?? null;
      const lastMomentum =
        sparklineRecentEntries[sparklineRecentEntries.length - 1]?.momentum ??
        null;
      if (
        firstMomentum !== null &&
        lastMomentum !== null &&
        Number.isFinite(firstMomentum) &&
        Number.isFinite(lastMomentum) &&
        lastMomentum < firstMomentum
      ) {
        return SPARKLINE_NEGATIVE;
      }
    }
    return SPARKLINE_POSITIVE;
  })();

  function buildSparklineCurve(points: { x: number; y: number }[]): string {
    if (points.length < 2) {
      return "";
    }
    const segments: string[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      if (i === 0) {
        segments.push(`Q ${current.x} ${current.y} ${midX} ${midY}`);
      } else {
        segments.push(`T ${midX} ${midY}`);
      }
      if (i === points.length - 2) {
        segments.push(`T ${next.x} ${next.y}`);
      }
    }
    return segments.join(" ");
  }

  function buildSparklinePath(points: { x: number; y: number }[]): string {
    if (!points.length) {
      return "";
    }
    if (points.length === 1) {
      const { y } = points[0];
      const startX = SPARKLINE_MARGIN_X;
      const endX = SPARKLINE_WIDTH - SPARKLINE_MARGIN_X;
      return `M ${startX} ${y} L ${endX} ${y}`;
    }
    const curve = buildSparklineCurve(points);
    return `M ${points[0].x} ${points[0].y} ${curve}`;
  }

  function buildSparklineAreaPath(points: { x: number; y: number }[]): string {
    if (!points.length) {
      return "";
    }
    const baseY = SPARKLINE_MARGIN_Y + SPARKLINE_DRAW_HEIGHT;
    if (points.length === 1) {
      const { x, y } = points[0];
      return `M ${x} ${baseY} L ${x} ${y} L ${x} ${baseY} Z`;
    }
    const first = points[0];
    const last = points[points.length - 1];
    const curve = buildSparklineCurve(points);
    return `M ${first.x} ${baseY} L ${first.x} ${first.y} ${curve} L ${last.x} ${baseY} Z`;
  }

  function formatTimeValue(seconds: number): string {
    return Math.max(0, Math.round(seconds)).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }

  function parseMicrowaveTimeInput(value: string): number {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      return 0;
    }
    const secondsPart = digits.slice(-2);
    const minutesPart = digits.slice(0, -2);
    const seconds = Number(secondsPart || "0");
    const minutes = Number(minutesPart || "0");
    return minutes * 60 + seconds;
  }

  function formatMicrowaveTimeInput(seconds: number): string {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainderSeconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainderSeconds).padStart(2, "0")}`;
  }

  function countDigitsBeforeCaret(value: string, caretPosition: number | null): number {
    if (caretPosition === null) {
      return value.replace(/\D/g, "").length;
    }

    return value.slice(0, caretPosition).replace(/\D/g, "").length;
  }

  function getCaretPositionForDigitCount(value: string, digitCount: number): number {
    if (digitCount <= 0) {
      return 0;
    }

    let seenDigits = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (/\d/.test(value[index])) {
        seenDigits += 1;
      }
      if (seenDigits >= digitCount) {
        return index + 1;
      }
    }

    return value.length;
  }

  async function restoreTimeInputCaret(target: HTMLInputElement, digitCount: number) {
    await tick();

    if (document.activeElement !== target) {
      return;
    }

    const caretPosition = getCaretPositionForDigitCount(target.value, digitCount);
    target.setSelectionRange(caretPosition, caretPosition);
  }

  function formatDurationWords(seconds: number): string {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainderSeconds = safeSeconds % 60;

    if (minutes > 0 && remainderSeconds > 0) {
      return `${minutes} min ${remainderSeconds} sec`;
    }
    if (minutes > 0) {
      return `${minutes} min`;
    }
    return `${remainderSeconds} sec`;
  }

  function formatWorkoutValue(value: number, type: "weight" | "distance" | "time"): string {
    if (type === "time") {
      return formatTimeValue(value);
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function formatLogInputValue(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function formatTimeVolume(value: number, unit: "kg" | "lb"): string {
    const converted = fromMetricWeight(value, unit) / 60;
    return converted.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function toDataUri(svg: string): string {
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }

  $: sparklinePath = buildSparklinePath(sparklinePoints);
  $: sparklineAreaPath = buildSparklineAreaPath(sparklinePoints);
  $: sparklineSvg = sparklinePoints.length
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}" preserveAspectRatio="none"><defs><linearGradient id="sparkline-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${sparklineColorSet.gradientStart}"/><stop offset="100%" stop-color="${sparklineColorSet.gradientEnd}"/></linearGradient></defs>${
        sparklineAreaPath
          ? `<path d="${sparklineAreaPath}" fill="url(#sparkline-gradient)" />`
          : ""
      }${
        sparklinePath
          ? `<path d="${sparklinePath}" fill="none" stroke="${sparklineColorSet.stroke}" stroke-width="${SPARKLINE_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`
          : ""
      }</svg>`
    : "";
  $: momentumSparklineBackground =
    sparklineSvg.length > 0 ? toDataUri(sparklineSvg) : "none";

  function openHistoryModal() {
    showHistoryModal = true;
  }

  function closeHistoryModal() {
    showHistoryModal = false;
  }

  function handleMomentumKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openHistoryModal();
    }
  }

  function getMaxIncreasePercent(freq?: number | null) {
    const normalized = Math.max(1, Math.round(freq || 1));
    if (normalized >= 7) {
      return 7;
    }
    return Math.min(7, normalized);
  }

  $: unitLabel = $settings.weightUnit ?? "kg";
  $: distanceUnitLabel = $settings.distanceUnit ?? "km";
  $: lapDistanceUnitLabel = distanceUnitLabel === "km" ? "mtrs" : "yrds";
  $: workoutType = localWorkout.workoutType ?? "weight";
  $: displayUnitLabel =
    workoutType === "distance"
      ? distanceUnitLabel
      : workoutType === "time"
        ? TIME_UNIT_LABEL
        : unitLabel;
  $: timeVolumeUnitLabel = `${unitLabel}.min`;
  $: distanceInputMode = localWorkout.distanceInputMode ?? "simple";

  // Reactive derivations for progress tracking
  $: today = $currentDate;
  $: goalProgress = getGoalProgress(localWorkout as Workout, $settings, today);
  $: todayVolume = goalProgress.todayVolume;
  $: effectiveWeight = goalProgress.effectiveWeight;
  $: distancePerLap = goalProgress.distancePerLap;
  $: bodyweightContributionMultiplier = Math.min(
    1,
    Math.max(
      0,
      Number.isFinite(localWorkout.bodyweightMultiplier ?? NaN)
        ? (localWorkout.bodyweightMultiplier ?? 0)
        : localWorkout.isBodyweight
          ? 1
          : 0,
    ),
  );
  $: usesBodyweightContribution = bodyweightContributionMultiplier > 0;
  $: targetIncreasePercentage = localWorkout.targetIncreasePercentage ?? 0;
  $: targetFrequency = goalProgress.targetFrequency;
  $: maxIncreasePercent = getMaxIncreasePercent(targetFrequency);
  $: progressionPercent = targetIncreasePercentage * 100;
  $: intensityRatio =
    maxIncreasePercent > 0
      ? Math.min(1, Math.max(0, progressionPercent / maxIncreasePercent))
      : 0;
  $: intensityLabel =
    progressionPercent <= 0
      ? "Maintain"
      : intensityRatio < 0.33
        ? "Maintain"
        : intensityRatio < 0.66
          ? "Build"
          : "Challenge";
  $: intensityTone =
    intensityLabel === "Challenge"
      ? "high"
      : intensityLabel === "Build"
        ? "mid"
        : "low";

  // Last active display
  $: lastActiveDisplay = (() => {
    if (!localWorkout.lastLoggedAt) return "Never";

    const last = normalizeDate(localWorkout.lastLoggedAt);
    const diff = daysBetween(last, today); // diff is absolute but we know last <= today usually

    // Check if future date? Assuming today is always >= lastLoggedAt since we travel forward
    // But just in case of weird clock manipulations:
    if (last === today) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff} days ago`;

    // Fallback to date string
    const d = new Date(localWorkout.lastLoggedAt);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  })();

  $: dailyTargetTonnage = goalProgress.dailyTargetVolume;
  $: progressPercent = goalProgress.progressPercent;

  $: if (workout !== localWorkout) {
    if (localWorkout.id !== workout.id) {
      hasManualReps = false;
    }
    localWorkout = workout;
  }

  // Recommended reps/distance for INPUT is based on REMAINING daily target
  $: recommendedReps =
    workoutType === "distance"
      ? distanceInputMode === "laps"
        ? 0 // For laps-based, we calculate recommendedLaps separately
        : Math.max(0, Math.round((dailyTargetTonnage - todayVolume) * 10) / 10)
      : workoutType === "time"
        ? Math.max(
            0,
            Math.ceil((dailyTargetTonnage - todayVolume) / effectiveWeight),
          )
      : Math.max(
          0,
          Math.ceil((dailyTargetTonnage - todayVolume) / effectiveWeight),
        );

  // For laps-based, calculate recommended laps (rounded up) and distance per lap
  $: remainingVolume = goalProgress.remainingVolume;
  // For laps-based, use the current input value (if manually entered) or the stored distance per lap
  $: currentLapDistanceInput =
    workoutType === "distance" && distanceInputMode === "laps" && repsInput
      ? Number(repsInput) // Input is in mtrs/yrds
      : 0;
  $: currentDistancePerLap =
    workoutType === "distance" && distanceInputMode === "laps"
      ? currentLapDistanceInput > 0
        ? toMetricLapDistance(currentLapDistanceInput, distanceUnitLabel)
        : distancePerLap // Fall back to stored value
      : 0;
  $: recommendedLaps =
    workoutType === "distance" &&
    distanceInputMode === "laps" &&
    currentDistancePerLap > 0
      ? Math.max(0, Math.ceil(remainingVolume / currentDistancePerLap))
      : 0;
  $: recommendedLapDistance =
    workoutType === "distance" &&
    distanceInputMode === "laps" &&
    distancePerLap > 0
      ? Math.round(fromMetricLapDistance(distancePerLap, distanceUnitLabel))
      : 0;
  $: recommendedDistanceDisplay =
    workoutType === "distance"
      ? Math.max(0, Math.round(fromMetricDistance(recommendedReps, distanceUnitLabel) * 10) / 10)
      : 0;
  $: todayVolumeDisplay =
    workoutType === "distance"
      ? fromMetricDistance(todayVolume, distanceUnitLabel)
      : workoutType === "time"
        ? Math.max(0, Math.round(todayVolume / effectiveWeight))
      : fromMetricWeight(todayVolume, unitLabel);
  $: dailyTargetDisplay =
    workoutType === "distance"
      ? fromMetricDistance(dailyTargetTonnage, distanceUnitLabel)
      : workoutType === "time"
        ? Math.max(0, Math.round(dailyTargetTonnage / effectiveWeight))
      : fromMetricWeight(dailyTargetTonnage, unitLabel);
  $: hasMultipleInputs =
    workoutType === "weight" ||
    workoutType === "time" ||
    (workoutType === "distance" && distanceInputMode === "laps");
  $: hasValidPrimaryInput =
    workoutType === "time"
      ? parseMicrowaveTimeInput(repsInput) > 0
      : Number(repsInput) > 0;
  $: parsedLogValue =
    workoutType === "distance" && distanceInputMode === "laps"
      ? Number(lapsInput)
      : workoutType === "time"
        ? parseMicrowaveTimeInput(repsInput)
        : Number(repsInput);
  $: hasValidLogValue = Number.isFinite(parsedLogValue) && parsedLogValue > 0;
  $: canLogVolume = hasValidPrimaryInput && hasValidLogValue;
  $: logButtonLabel =
    workoutType === "distance"
      ? distanceInputMode === "laps"
        ? hasValidLogValue
          ? `Log ${formatLogInputValue(parsedLogValue)} Laps`
          : "Enter laps to log more ⤴"
        : hasValidLogValue
          ? `Log ${formatLogInputValue(parsedLogValue)} ${distanceUnitLabel}`
          : "Enter distance to log more ⤴"
      : workoutType === "time"
        ? hasValidLogValue
          ? `Log ${formatTimeValue(Math.round(parsedLogValue))}`
          : "Enter time to log more ⤴"
        : hasValidLogValue
          ? `Log ${formatLogInputValue(parsedLogValue)} Reps`
          : "Enter reps to log more ⤴";

  $: if (!hasManualReps) {
    if (workoutType === "distance" && distanceInputMode === "laps") {
      // Prefill with stored distance per lap
      repsInput =
        recommendedLapDistance > 0 ? String(recommendedLapDistance) : "";
    } else {
      repsInput =
        recommendedReps > 0
          ? workoutType === "distance"
            ? String(recommendedDistanceDisplay)
            : workoutType === "time"
              ? formatMicrowaveTimeInput(recommendedReps)
              : String(recommendedReps)
          : "";
    }
  }
  // For laps-based, prefill laps with recommended value (rounded up) - updates dynamically when distance changes
  $: if (
    workoutType === "distance" &&
    distanceInputMode === "laps" &&
    !hasManualLaps
  ) {
    if (recommendedLaps > 0) {
      lapsInput = String(recommendedLaps);
    } else {
      lapsInput = "";
    }
  }

  function handleRepsInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const digitCaretPosition =
      workoutType === "time"
        ? countDigitsBeforeCaret(target.value, target.selectionStart)
        : 0;
    repsInput =
      workoutType === "time"
        ? formatMicrowaveTimeInput(parseMicrowaveTimeInput(target.value))
        : target.value;
    hasManualReps = true;

    if (workoutType === "time") {
      void restoreTimeInputCaret(target, digitCaretPosition);
    }
  }

  function getPrimaryInputStep(): number {
    if (workoutType === "distance") {
      return distanceInputMode === "simple" ? 0.1 : 1;
    }
    return 1;
  }

  function getStepPrecision(step: number): number {
    const [, fraction = ""] = String(step).split(".");
    return fraction.length;
  }

  function formatValueByStep(value: number, step: number): string {
    if (step >= 1) {
      return String(Math.round(value));
    }
    const precision = getStepPrecision(step);
    return value.toFixed(precision);
  }

  function roundToStep(value: number, step: number): number {
    const precision = getStepPrecision(step);
    const rounded = Math.round(value / step) * step;
    return Number(rounded.toFixed(precision));
  }

  function isSupportedAdjusterPointer(event: PointerEvent): boolean {
    return event.pointerType !== "mouse" || event.button === 0;
  }

  function getAdjusterDirection(
    event: PointerEvent | MouseEvent,
    target: HTMLElement,
  ): 1 | -1 {
    const rect = target.getBoundingClientRect();
    return event.clientY <= rect.top + rect.height / 2 ? 1 : -1;
  }

  function getAdjusterOffsetY(deltaY: number): number {
    return Number(
      (
        -Math.tanh(deltaY / ADJUSTER_DEFLECTION_CURVE) *
        MAX_ADJUSTER_DEFLECTION_PX
      ).toFixed(2),
    );
  }

  function nudgePrimaryInput(direction: 1 | -1) {
    const step = getPrimaryInputStep();
    const parsedValue =
      workoutType === "time"
        ? parseMicrowaveTimeInput(repsInput)
        : Number(repsInput);
    const initialValue = Number.isFinite(parsedValue) ? parsedValue : 0;
    const nextValue = Math.max(
      0,
      roundToStep(initialValue + direction * step, step),
    );

    repsInput =
      workoutType === "time"
        ? formatMicrowaveTimeInput(nextValue)
        : formatValueByStep(nextValue, step);
    hasManualReps = true;

    if (workoutType === "distance" && distanceInputMode === "laps") {
      syncLapDistanceToWorkout(nextValue);
    }
  }

  function nudgeLapsInput(direction: 1 | -1) {
    const parsedValue = Number(lapsInput);
    const initialValue = Number.isFinite(parsedValue)
      ? Math.round(parsedValue)
      : 1;
    const nextValue = Math.max(1, initialValue + direction);
    lapsInput = String(nextValue);
    hasManualLaps = true;
  }

  function nudgeWeightInput(direction: 1 | -1) {
    const currentValue = fromMetricWeight(localWorkout.weight, unitLabel);
    const nextValueRaw = currentValue + direction;
    const clampedValue = usesBodyweightContribution
      ? Math.round(nextValueRaw)
      : Math.max(1, Math.round(nextValueRaw));
    const metricWeight = toMetricWeight(clampedValue, unitLabel);

    if (Math.abs(metricWeight - localWorkout.weight) > 0.0001) {
      updateWorkout(localWorkout.id, { weight: metricWeight });
    }
  }

  function handlePrimaryAdjusterKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowUp") {
      nudgePrimaryInput(1);
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      nudgePrimaryInput(-1);
      event.preventDefault();
    }
  }

  function handleLapsAdjusterKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowUp") {
      nudgeLapsInput(1);
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      nudgeLapsInput(-1);
      event.preventDefault();
    }
  }

  function handleWeightAdjusterKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowUp") {
      nudgeWeightInput(1);
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      nudgeWeightInput(-1);
      event.preventDefault();
    }
  }

  function beginPrimaryInputDrag(event: PointerEvent) {
    if (!isSupportedAdjusterPointer(event)) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const parsedValue =
      workoutType === "time"
        ? parseMicrowaveTimeInput(repsInput)
        : Number(repsInput);
    const initialValue = Number.isFinite(parsedValue) ? parsedValue : 0;

    isPrimaryInputDragging = true;
    primaryInputDragPointerId = event.pointerId;
    primaryInputDragStartY = event.clientY;
    primaryInputDragStartValue = Math.max(0, initialValue);
    primaryInputDragMoved = false;
    primaryAdjusterOffsetY = 0;

    target.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function movePrimaryInputDrag(event: PointerEvent) {
    if (
      !isPrimaryInputDragging ||
      primaryInputDragPointerId === null ||
      event.pointerId !== primaryInputDragPointerId
    ) {
      return;
    }

    const deltaY = primaryInputDragStartY - event.clientY;
    primaryAdjusterOffsetY = getAdjusterOffsetY(deltaY);
    primaryInputDragMoved =
      primaryInputDragMoved ||
      Math.abs(deltaY) >= ADJUSTER_TAP_MOVE_TOLERANCE;
    const stepCount = Math.trunc(deltaY / DRAG_PIXELS_PER_STEP);
    const step = getPrimaryInputStep();
    const nextValue = Math.max(
      0,
      roundToStep(primaryInputDragStartValue + stepCount * step, step),
    );

    repsInput =
      workoutType === "time"
        ? formatMicrowaveTimeInput(nextValue)
        : formatValueByStep(nextValue, step);
    hasManualReps = true;
    event.preventDefault();
    event.stopPropagation();
  }

  function syncLapDistanceToWorkout(lapDistance: number) {
    if (workoutType === "distance" && distanceInputMode === "laps") {
      if (Number.isFinite(lapDistance) && lapDistance > 0) {
        const distancePerLapKm = toMetricLapDistance(lapDistance, distanceUnitLabel);
        if (Math.abs(distancePerLapKm - localWorkout.weight) > 0.0001) {
          updateWorkout(localWorkout.id, { weight: distancePerLapKm });
        }
      }
    }
  }

  function endPrimaryInputDrag(event: PointerEvent) {
    if (
      !isPrimaryInputDragging ||
      primaryInputDragPointerId === null ||
      event.pointerId !== primaryInputDragPointerId
    ) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    isPrimaryInputDragging = false;
    primaryInputDragPointerId = null;
    primaryAdjusterOffsetY = 0;
    if (!primaryInputDragMoved) {
      nudgePrimaryInput(getAdjusterDirection(event, target));
    }

    if (workoutType === "distance" && distanceInputMode === "laps") {
      const lapDistance = Number(repsInput);
      syncLapDistanceToWorkout(lapDistance);
    }

    primaryInputDragMoved = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function beginLapsInputDrag(event: PointerEvent) {
    if (!isSupportedAdjusterPointer(event)) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const parsedValue = Number(lapsInput);
    const initialValue = Number.isFinite(parsedValue) ? parsedValue : 1;

    isLapsInputDragging = true;
    lapsInputDragPointerId = event.pointerId;
    lapsInputDragStartY = event.clientY;
    lapsInputDragStartValue = Math.max(1, Math.round(initialValue));
    lapsInputDragMoved = false;
    lapsAdjusterOffsetY = 0;

    target.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveLapsInputDrag(event: PointerEvent) {
    if (
      !isLapsInputDragging ||
      lapsInputDragPointerId === null ||
      event.pointerId !== lapsInputDragPointerId
    ) {
      return;
    }

    const deltaY = lapsInputDragStartY - event.clientY;
    lapsAdjusterOffsetY = getAdjusterOffsetY(deltaY);
    lapsInputDragMoved =
      lapsInputDragMoved || Math.abs(deltaY) >= ADJUSTER_TAP_MOVE_TOLERANCE;
    const stepCount = Math.trunc(deltaY / DRAG_PIXELS_PER_STEP);
    const nextValue = Math.max(1, lapsInputDragStartValue + stepCount);

    lapsInput = String(nextValue);
    hasManualLaps = true;
    event.preventDefault();
    event.stopPropagation();
  }

  function endLapsInputDrag(event: PointerEvent) {
    if (
      !isLapsInputDragging ||
      lapsInputDragPointerId === null ||
      event.pointerId !== lapsInputDragPointerId
    ) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    isLapsInputDragging = false;
    lapsInputDragPointerId = null;
    lapsAdjusterOffsetY = 0;
    if (!lapsInputDragMoved) {
      nudgeLapsInput(getAdjusterDirection(event, target));
    }
    lapsInputDragMoved = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function beginWeightInputDrag(event: PointerEvent) {
    if (!isSupportedAdjusterPointer(event)) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    const initialValue = fromMetricWeight(localWorkout.weight, unitLabel);

    isWeightInputDragging = true;
    weightInputDragPointerId = event.pointerId;
    weightInputDragStartY = event.clientY;
    weightInputDragStartValue = initialValue;
    weightInputDragMoved = false;
    weightAdjusterOffsetY = 0;

    target.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveWeightInputDrag(event: PointerEvent) {
    if (
      !isWeightInputDragging ||
      weightInputDragPointerId === null ||
      event.pointerId !== weightInputDragPointerId
    ) {
      return;
    }

    const deltaY = weightInputDragStartY - event.clientY;
    weightAdjusterOffsetY = getAdjusterOffsetY(deltaY);
    weightInputDragMoved =
      weightInputDragMoved || Math.abs(deltaY) >= ADJUSTER_TAP_MOVE_TOLERANCE;
    const stepCount = Math.trunc(deltaY / DRAG_PIXELS_PER_STEP);
    const nextValueRaw = weightInputDragStartValue + stepCount;
    const clampedValue = usesBodyweightContribution
      ? Math.round(nextValueRaw)
      : Math.max(1, Math.round(nextValueRaw));
    const metricWeight = toMetricWeight(clampedValue, unitLabel);

    if (Math.abs(metricWeight - localWorkout.weight) > 0.0001) {
      updateWorkout(localWorkout.id, { weight: metricWeight });
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function endWeightInputDrag(event: PointerEvent) {
    if (
      !isWeightInputDragging ||
      weightInputDragPointerId === null ||
      event.pointerId !== weightInputDragPointerId
    ) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    isWeightInputDragging = false;
    weightInputDragPointerId = null;
    weightAdjusterOffsetY = 0;
    if (!weightInputDragMoved) {
      nudgeWeightInput(getAdjusterDirection(event, target));
    }
    weightInputDragMoved = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleLapDistanceChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const lapDistance = Number(target.value);
    syncLapDistanceToWorkout(lapDistance);
  }

  function handleLapsInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    lapsInput = target.value;
    hasManualLaps = true;
  }

  function handleLogVolume() {
    if (workoutType === "distance" && distanceInputMode === "laps") {
      const lapDistance = Number(repsInput); // Input in mtrs/yrds
      const laps = Number(lapsInput);

      if (!Number.isFinite(lapDistance) || lapDistance <= 0) {
        showToast(`Enter positive distance per lap (${lapDistanceUnitLabel})`);
        return;
      }
      if (!Number.isFinite(laps) || laps <= 0) {
        showToast("Enter positive number of laps");
        return;
      }

      const distancePerLapKm = toMetricLapDistance(lapDistance, distanceUnitLabel);
      const volumeToLog = distancePerLapKm * laps;
      isLogging = true;

      try {
        const now = getNow();
        console.log(
          `[Debug] Logging volume: ${volumeToLog} at ${new Date(now).toISOString()} (Normalized: ${normalizeDate(new Date(now))})`,
        );
        const updated = applyMomentumUpdate(localWorkout, volumeToLog, now);

        const peakResult = persistLoggedWorkout(updated, now);

        const delta = updated.momentum - localWorkout.momentum;
        const momentumDisplay = Math.round(updated.momentum);
        const volumeDisplay = fromMetricDistance(volumeToLog, distanceUnitLabel).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });

        if (peakResult.shouldCelebratePeak) {
          triggerPeakCelebration();
          showToast(
            `All-time high! ${localWorkout.name} reached ${momentumDisplay} momentum.`,
            4200,
          );
        } else {
          showToast(
            delta > 0
              ? `Logged ${lapDistance} ${lapDistanceUnitLabel} × ${laps} laps (${volumeDisplay} ${distanceUnitLabel}). Momentum +${delta.toFixed(1)} → ${momentumDisplay}.`
              : `Logged ${lapDistance} ${lapDistanceUnitLabel} × ${laps} laps (${volumeDisplay} ${distanceUnitLabel}). Momentum ${momentumDisplay}.`,
          );
        }

        hasManualReps = false;
        hasManualLaps = false;
      } catch (error) {
        console.error("Failed to log volume:", error);
        showToast("Failed to log volume");
      } finally {
        isLogging = false;
      }
      return;
    }

    const value =
      workoutType === "time"
        ? parseMicrowaveTimeInput(repsInput)
        : Number(repsInput);

    if (!Number.isFinite(value) || value <= 0) {
      showToast(
        workoutType === "distance"
          ? "Enter positive distance"
          : workoutType === "time"
            ? "Enter positive time"
          : "Enter positive reps",
      );
      return;
    }

    const volumeToLog =
      workoutType === "distance"
        ? toMetricDistance(value, distanceUnitLabel)
        : workoutType === "time"
          ? Math.round(value) * effectiveWeight
          : value * effectiveWeight;
    isLogging = true;

    try {
      const now = getNow();
      console.log(
        `[Debug] Logging volume: ${volumeToLog} at ${new Date(now).toISOString()} (Normalized: ${normalizeDate(new Date(now))})`,
      );
      const updated = applyMomentumUpdate(localWorkout, volumeToLog, now);

      const peakResult = persistLoggedWorkout(updated, now);

      const delta = updated.momentum - localWorkout.momentum;
      const momentumDisplay = Math.round(updated.momentum);
      const valueLabel =
        workoutType === "distance"
          ? `${value} ${distanceUnitLabel}`
          : workoutType === "time"
            ? `${Math.round(value)} ${TIME_UNIT_LABEL}`
          : `${value} reps`;
      const volumeLabel =
        workoutType === "distance"
          ? `${fromMetricDistance(volumeToLog, distanceUnitLabel).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${distanceUnitLabel}`
          : workoutType === "time"
            ? `${formatTimeValue(Math.round(volumeToLog / effectiveWeight))} ${TIME_UNIT_LABEL}`
          : `${fromMetricWeight(volumeToLog, unitLabel).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitLabel}`;
      if (peakResult.shouldCelebratePeak) {
        triggerPeakCelebration();
        showToast(
          `All-time high! ${localWorkout.name} reached ${momentumDisplay} momentum.`,
          4200,
        );
      } else {
        showToast(
          delta > 0
            ? `Logged ${valueLabel} (${volumeLabel}). Momentum +${delta.toFixed(1)} → ${momentumDisplay}.`
            : `Logged ${valueLabel} (${volumeLabel}). Momentum ${momentumDisplay}.`,
        );
      }

      hasManualReps = false;
      hasManualLaps = false;
    } catch (error) {
      console.error("Failed to log volume:", error);
      showToast("Failed to log volume");
    } finally {
      isLogging = false;
    }
  }

  function handleEdit() {
    dispatch("edit", localWorkout);
  }

  async function handleShare() {
    try {
      const result = await shareWorkoutProgress({
        workout: localWorkout,
        settings: $settings,
        shareDate: $currentDate,
      });
      if (result === "downloaded") {
        showToast("Progress image downloaded");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      showToast(error instanceof Error ? error.message : "Unable to share progress image");
    }
  }

  function handleWeightChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const newWeight = Number(target.value);

    if (!Number.isFinite(newWeight)) return;
    if (!usesBodyweightContribution && newWeight <= 0) return;
    if (usesBodyweightContribution && newWeight === 0) {
      target.value = "";
    }

    const metricWeight = toMetricWeight(newWeight, unitLabel);
    if (Math.abs(metricWeight - localWorkout.weight) > 0.0001) {
      updateWorkout(localWorkout.id, { weight: metricWeight });
    }
  }
</script>

<div class="workout-card">
  <button
    type="button"
    class="card-corner-button share-card-button"
    aria-label={`Share ${localWorkout.name} progress`}
    title="Share progress"
    on:click|stopPropagation={handleShare}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="17.5" cy="5.5" r="2.3" />
      <circle cx="17.5" cy="18.5" r="2.3" />
      <path
        d="M8.05 10.85 15.45 6.7M8.05 13.15l7.4 4.15"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
      />
    </svg>
  </button>
  <button
    type="button"
    class="card-corner-button edit-card-button"
    aria-label={`Edit ${localWorkout.name}`}
    title="Edit exercise"
    on:click|stopPropagation={handleEdit}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4.5 16.9 16.7 4.7a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.1 20.5H4.5v-3.6Zm2 1.6h.8L18.9 6.9l-.8-.8L6.5 17.7v.8Z"
      />
    </svg>
  </button>
  <div class="header-row">
    <div class="header-main">
      <div class="header-top">
        <div class="workout-icon" aria-hidden="true">
          {@html workoutIconMarkup}
        </div>
        <div class="title-block">
          <h2>
            <span class="title-text">{localWorkout.name}</span>
            {#if isAtAllTimeHigh}
              <span
                class="peak-crown"
                title="At all-time high momentum"
                aria-label="At all-time high momentum"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M5 18h14l-1.3-8.2-4.6 3.4L12 6 10.9 13.2 6.3 9.8 5 18zm14.9-11.4a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zM12 5.4A1.4 1.4 0 1 1 12 2.6a1.4 1.4 0 0 1 0 2.8zM4.1 6.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zM5 19.4h14V21H5v-1.6z"
                  />
                </svg>
              </span>
            {/if}
          </h2>
        </div>
      </div>
      <div class="badge-row">
        <span class="badge" title="Last activity">{lastActiveDisplay}</span>
        {#if (localWorkout.targetFrequency ?? 1) > 1}
          <span class="badge secondary"
            >Every {localWorkout.targetFrequency}d</span
          >
        {/if}
        <span class="badge intensity {intensityTone}">
          <span class="dot" aria-hidden="true"></span>
          {intensityLabel}
        </span>
      </div>
    </div>
    <div
      class="momentum-pill"
      class:celebrating={showPeakCelebration}
      role="button"
      tabindex="0"
      aria-haspopup="dialog"
      aria-expanded={showHistoryModal}
      aria-label={`Current momentum ${Math.round(localWorkout.momentum)}. ${trendTooltip}. Press enter to view history.`}
      title="View momentum history"
      on:click|stopPropagation={openHistoryModal}
      on:keydown={handleMomentumKeydown}
      style:--momentum-sparkline-image={momentumSparklineBackground}
    >
      {#if showPeakCelebration}
        <span class="peak-burst" aria-hidden="true"></span>
        <span class="peak-burst delayed" aria-hidden="true"></span>
        <span class="peak-banner" aria-hidden="true">New peak</span>
      {/if}
      <span class="momentum-value">{Math.round(localWorkout.momentum)}</span>
      <span class="momentum-label">Momentum</span>
      <span class={`momentum-trend ${trendClass}`} title={trendTooltip}>
        {trendBadgeText}
      </span>
    </div>
  </div>

  <div class="progress-section">
    <div class="progress-bar-bg" aria-label="Daily progress">
      <div class="progress-bar-fill" style="width: {progressPercent}%"></div>
    </div>
    <div class="progress-meta">
      <span class="target-text">
        {#if workoutType === "distance" && distanceInputMode === "laps"}
          {#if recommendedLaps > 0}
            Goal: <strong>{recommendedLaps}</strong> more laps
          {:else}
            Daily target met!
          {/if}
        {:else if recommendedReps > 0}
          Goal:
          <strong>
            {workoutType === "distance"
              ? `${recommendedDistanceDisplay} ${distanceUnitLabel}`
              : workoutType === "time"
                ? formatDurationWords(recommendedReps)
                : `${recommendedReps} reps`}
          </strong>
          more
        {:else}
          Daily target met!
        {/if}
      </span>
      <span class="volume-text">
        {#if workoutType === "time"}
          {formatTimeVolume(todayVolume, unitLabel)} / {formatTimeVolume(dailyTargetTonnage, unitLabel)}
          {timeVolumeUnitLabel}
        {:else}
          {formatWorkoutValue(todayVolumeDisplay, workoutType)} / {formatWorkoutValue(dailyTargetDisplay, workoutType)}
          {displayUnitLabel}
        {/if}
      </span>
    </div>
  </div>

  <div class="action-grid" class:multi-inputs={hasMultipleInputs}>
    {#if workoutType === "weight" || workoutType === "time"}
      <div class="input-group">
        <label for="weight-{localWorkout.id}">
          {usesBodyweightContribution ? "Added Weight" : workoutType === "time" ? "Load" : "Weight"} ({unitLabel})
        </label>
        <div class="input-with-adjuster">
          <input
            id="weight-{localWorkout.id}"
            type="number"
            step="any"
            value={usesBodyweightContribution && localWorkout.weight === 0 ? "" : fromMetricWeight(localWorkout.weight, unitLabel)}
            placeholder={usesBodyweightContribution ? "0" : undefined}
            on:change={handleWeightChange}
            on:click|stopPropagation
          />
          <button
            type="button"
            class="input-adjuster"
            class:adjusting={isWeightInputDragging}
            style={`--adjuster-offset-y: ${weightAdjusterOffsetY}px;`}
            aria-label={`Adjust ${usesBodyweightContribution ? "added weight" : workoutType === "time" ? "load" : "weight"} up or down`}
            title="Drag or tap to adjust"
            on:pointerdown={beginWeightInputDrag}
            on:pointermove={moveWeightInputDrag}
            on:pointerup={endWeightInputDrag}
            on:pointercancel={endWeightInputDrag}
            on:keydown={handleWeightAdjusterKeydown}
            on:click|preventDefault|stopPropagation
          >
            <span class="adjuster-arrow adjuster-arrow-up" aria-hidden="true"></span>
            <span class="adjuster-divider" aria-hidden="true"></span>
            <span class="adjuster-arrow adjuster-arrow-down" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <div class="input-group">
        <label for="reps-{localWorkout.id}">{workoutType === "time" ? "Time (mm:ss)" : "Reps"}</label>
        <div class="input-with-adjuster">
          <input
            id="reps-{localWorkout.id}"
            type={workoutType === "time" ? "text" : "number"}
            inputmode={workoutType === "time" ? "numeric" : undefined}
            min="0"
            step="1"
            value={repsInput}
            on:input={handleRepsInput}
            placeholder={workoutType === "time" ? "00:00" : "e.g. 10"}
          />
          <button
            type="button"
            class="input-adjuster"
            class:adjusting={isPrimaryInputDragging}
            style={`--adjuster-offset-y: ${primaryAdjusterOffsetY}px;`}
            aria-label={workoutType === "time" ? "Adjust time up or down" : "Adjust reps up or down"}
            title="Drag or tap to adjust"
            on:pointerdown={beginPrimaryInputDrag}
            on:pointermove={movePrimaryInputDrag}
            on:pointerup={endPrimaryInputDrag}
            on:pointercancel={endPrimaryInputDrag}
            on:keydown={handlePrimaryAdjusterKeydown}
            on:click|preventDefault|stopPropagation
          >
            <span class="adjuster-arrow adjuster-arrow-up" aria-hidden="true"></span>
            <span class="adjuster-divider" aria-hidden="true"></span>
            <span class="adjuster-arrow adjuster-arrow-down" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    {:else if distanceInputMode === "laps"}
      <div class="input-group">
        <label for="distance-per-lap-{localWorkout.id}"
          >Distance per lap ({lapDistanceUnitLabel})</label
        >
        <div class="input-with-adjuster">
          <input
            id="distance-per-lap-{localWorkout.id}"
            type="number"
            min="0"
            step="1"
            value={repsInput}
            on:input={handleRepsInput}
            on:change={handleLapDistanceChange}
            placeholder={distanceUnitLabel === "km" ? "e.g. 400" : "e.g. 440"}
          />
          <button
            type="button"
            class="input-adjuster"
            class:adjusting={isPrimaryInputDragging}
            style={`--adjuster-offset-y: ${primaryAdjusterOffsetY}px;`}
            aria-label="Adjust distance per lap up or down"
            title="Drag or tap to adjust"
            on:pointerdown={beginPrimaryInputDrag}
            on:pointermove={movePrimaryInputDrag}
            on:pointerup={endPrimaryInputDrag}
            on:pointercancel={endPrimaryInputDrag}
            on:keydown={handlePrimaryAdjusterKeydown}
            on:click|preventDefault|stopPropagation
          >
            <span class="adjuster-arrow adjuster-arrow-up" aria-hidden="true"></span>
            <span class="adjuster-divider" aria-hidden="true"></span>
            <span class="adjuster-arrow adjuster-arrow-down" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="input-group">
        <label for="laps-{localWorkout.id}">Laps</label>
        <div class="input-with-adjuster">
          <input
            id="laps-{localWorkout.id}"
            type="number"
            min="1"
            step="1"
            value={lapsInput}
            on:input={handleLapsInput}
            placeholder="e.g. 10"
          />
          <button
            type="button"
            class="input-adjuster"
            class:adjusting={isLapsInputDragging}
            style={`--adjuster-offset-y: ${lapsAdjusterOffsetY}px;`}
            aria-label="Adjust laps up or down"
            title="Drag or tap to adjust"
            on:pointerdown={beginLapsInputDrag}
            on:pointermove={moveLapsInputDrag}
            on:pointerup={endLapsInputDrag}
            on:pointercancel={endLapsInputDrag}
            on:keydown={handleLapsAdjusterKeydown}
            on:click|preventDefault|stopPropagation
          >
            <span class="adjuster-arrow adjuster-arrow-up" aria-hidden="true"></span>
            <span class="adjuster-divider" aria-hidden="true"></span>
            <span class="adjuster-arrow adjuster-arrow-down" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    {:else}
      <div class="input-group">
        <label for="distance-{localWorkout.id}"
          >Distance ({distanceUnitLabel})</label
        >
        <div class="input-with-adjuster">
          <input
            id="distance-{localWorkout.id}"
            type="number"
            min="0"
            step="0.1"
            value={repsInput}
            on:input={handleRepsInput}
            placeholder="e.g. 5.0"
          />
          <button
            type="button"
            class="input-adjuster"
            class:adjusting={isPrimaryInputDragging}
            style={`--adjuster-offset-y: ${primaryAdjusterOffsetY}px;`}
            aria-label="Adjust distance up or down"
            title="Drag or tap to adjust"
            on:pointerdown={beginPrimaryInputDrag}
            on:pointermove={movePrimaryInputDrag}
            on:pointerup={endPrimaryInputDrag}
            on:pointercancel={endPrimaryInputDrag}
            on:keydown={handlePrimaryAdjusterKeydown}
            on:click|preventDefault|stopPropagation
          >
            <span class="adjuster-arrow adjuster-arrow-up" aria-hidden="true"></span>
            <span class="adjuster-divider" aria-hidden="true"></span>
            <span class="adjuster-arrow adjuster-arrow-down" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    {/if}

    <button
      class="log-button"
      on:click={handleLogVolume}
      disabled={isLogging || !canLogVolume}
    >
      {#if isLogging}
        Logging...
      {:else}
        {logButtonLabel}
      {/if}
    </button>
  </div>

</div>

{#if showHistoryModal}
  <MomentumHistoryModal workout={localWorkout} on:close={closeHistoryModal} />
{/if}

<style>
  .workout-card {
    background: white;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transition: box-shadow 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    container-type: inline-size;
    position: relative;
  }

  .workout-card:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }

  .card-corner-button {
    position: absolute;
    top: 0.35rem;
    z-index: 3;
    width: 2.2rem;
    height: 2.2rem;
    border: 1px solid rgba(36, 62, 81, 0.03);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.29);
    color: #546e7a9b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s,
      transform 0.2s,
      box-shadow 0.2s;
  }

  .share-card-button {
    left: 0.35rem;
  }

  .edit-card-button {
    right: 0.35rem;
  }

  .card-corner-button svg {
    width: 1.15rem;
    height: 1.15rem;
    fill: currentColor;
  }

  .card-corner-button:hover {
    background: white;
    color: #1976d2;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(38, 50, 56, 0.18);
  }

  .card-corner-button:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 3px rgba(66, 165, 245, 0.25),
      0 4px 12px rgba(38, 50, 56, 0.18);
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .header-main {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    flex: 1;
    min-width: 0;
  }

  .header-top {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    width: 100%;
  }

  .workout-icon {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    background: #f5f7fa;
    border: 1px solid rgba(36, 62, 81, 0.12);
  }

  .workout-icon :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .title-block {
    flex: 1;
    min-width: 0;
  }

  .title-block h2 {
    margin: 0;
    font-size: 1.4rem;
    color: #2c3e50;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .title-text {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .peak-crown {
    width: 1.1rem;
    height: 1.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #f9a825;
    filter: drop-shadow(0 1px 2px rgba(249, 168, 37, 0.28));
  }

  .peak-crown :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
    fill: currentColor;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
  }

  .badge {
    background: var(--color-primary-soft);
    color: var(--color-primary-accent);
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .badge.secondary {
    background: #ede7f6;
    color: #5e35b1;
  }

  .badge.intensity {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .badge.intensity.low {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .badge.intensity.mid {
    background: #fff3e0;
    color: #f57c00;
  }

  .badge.intensity.high {
    background: #ffebee;
    color: #c62828;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    display: inline-block;
  }

  .momentum-pill {
    min-width: 96px;
    border-radius: 10px;
    padding: 0.4rem 0.75rem;
    border: 1px solid #dcedc8;
    background: #f1f8e9;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-transform: uppercase;
    gap: 0.2rem;
    cursor: pointer;
    transition:
      box-shadow 0.2s ease,
      transform 0.2s ease;
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .momentum-pill::before {
    content: "";
    position: absolute;
    inset: 0;
    background-color: transparent;
    background-image: var(--momentum-sparkline-image);
    background-repeat: no-repeat;
    background-size: 120% 100%;
    background-position: center bottom;
    opacity: 0.4;
    pointer-events: none;
    z-index: 0;
    transform: translateZ(0);
  }

  .momentum-pill > * {
    position: relative;
    z-index: 1;
  }

  .momentum-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: #43a047;
    line-height: 1.2;
  }

  .momentum-label {
    font-size: 0.65rem;
    color: #7cb342;
    letter-spacing: 0.08em;
  }

  .momentum-trend {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: #546e7a;
  }

  .momentum-trend.positive {
    color: #2e7d32;
  }

  .momentum-trend.negative {
    color: #c62828;
  }

  .momentum-pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.45);
  }

  .momentum-pill:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.22);
  }

  .momentum-pill.celebrating {
    border-color: #fbc02d;
    background: linear-gradient(180deg, #fff8d5 0%, #fffde7 100%);
    box-shadow:
      0 0 0 3px rgba(251, 192, 45, 0.22),
      0 10px 24px rgba(255, 193, 7, 0.24);
    animation: peak-pop 0.7s cubic-bezier(0.22, 1.2, 0.36, 1);
  }

  .peak-burst {
    position: absolute;
    inset: -18%;
    border-radius: 18px;
    border: 2px solid rgba(251, 192, 45, 0.85);
    opacity: 0;
    pointer-events: none;
    z-index: 0;
    animation: peak-ring 1.15s ease-out forwards;
  }

  .peak-burst.delayed {
    animation-delay: 0.14s;
    border-color: rgba(255, 167, 38, 0.75);
  }

  .peak-banner {
    position: absolute;
    top: 0.22rem;
    right: 0.22rem;
    padding: 0.14rem 0.4rem;
    border-radius: 999px;
    background: linear-gradient(135deg, #f57f17, #ffb300);
    color: white;
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(245, 127, 23, 0.28);
    pointer-events: none;
    z-index: 2;
    animation: peak-banner-in 0.25s ease-out;
  }

  @keyframes peak-pop {
    0% {
      transform: scale(1);
    }
    30% {
      transform: scale(1.08);
    }
    60% {
      transform: scale(0.98);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes peak-ring {
    0% {
      opacity: 0.85;
      transform: scale(0.88);
    }
    100% {
      opacity: 0;
      transform: scale(1.14);
    }
  }

  @keyframes peak-banner-in {
    0% {
      opacity: 0;
      transform: translateY(4px) scale(0.92);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .progress-bar-bg {
    height: 9px;
    width: 100%;
    border-radius: 999px;
    background: #e0e0e0;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #66bb6a, #43a047);
    transition: width 0.3s ease;
  }

  .progress-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #546e7a;
  }

  .target-text strong {
    color: #1976d2;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    align-items: end;
  }

  .action-grid > .log-button {
    width: 100%;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .input-group label {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    font-weight: 600;
    color: #607d8b;
  }

  .input-with-adjuster {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .input-group input {
    width: 100%;
    border: 1px solid #dfe6e9;
    border-radius: 8px;
    padding: 0.65rem 3.45rem 0.65rem 0.75rem;
    font-size: 1rem;
    background: #fafafa;
    appearance: textfield;
    -moz-appearance: textfield;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  .input-group input::-webkit-outer-spin-button,
  .input-group input::-webkit-inner-spin-button {
    margin: 0;
    -webkit-appearance: none;
  }

  .input-group input:focus {
    outline: none;
    border-color: #42a5f5;
    box-shadow: 0 0 0 2px rgba(66, 165, 245, 0.2);
    background: white;
  }

  .input-adjuster {
    position: absolute;
    top: 50%;
    right: 0.45rem;
    transform: translateY(calc(-50% + var(--adjuster-offset-y, 0px)));
    width: 2.3rem;
    height: 2.3rem;
    border: none;
    border-radius: 50%;
    padding: 0.2rem 0;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.14rem;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
    overflow: visible;
    transition:
      transform 120ms ease-out,
      box-shadow 120ms ease-out;
  }

  .input-adjuster::before {
    content: "";
    position: absolute;
    inset: 0.2rem;
    border: 1px solid #d0d9de;
    border-radius: 50%;
    background: linear-gradient(180deg, #ffffff 0%, #f3f6f8 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      inset 0 -1px 1px rgba(176, 190, 197, 0.28),
      0 3px 6px rgba(38, 50, 56, 0.14),
      0 8px 18px rgba(38, 50, 56, 0.12);
  }

  .input-adjuster > * {
    position: relative;
    z-index: 1;
  }

  .input-adjuster:focus {
    outline: none;
  }

  .input-adjuster:focus-visible {
    box-shadow: 0 0 0 2px rgba(66, 165, 245, 0.2);
  }

  .input-adjuster:focus-visible::before {
    border-color: #42a5f5;
  }

  .input-adjuster.adjusting {
    transform: translateY(
      calc(-50% + var(--adjuster-offset-y, 0px) + 1px)
    );
  }

  .input-adjuster.adjusting::before {
    background: linear-gradient(180deg, #eef6fb 0%, #e3eef7 100%);
    border-color: #90caf9;
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.8),
      inset 0 -1px 2px rgba(144, 202, 249, 0.3),
      0 2px 4px rgba(38, 50, 56, 0.12),
      0 4px 10px rgba(38, 50, 56, 0.1);
  }

  .adjuster-divider {
    width: 0.92rem;
    height: 1px;
    background: rgba(96, 125, 139, 0.45);
    flex: 0 0 auto;
  }

  .adjuster-arrow {
    width: 0;
    height: 0;
    border-left: 0.26rem solid transparent;
    border-right: 0.26rem solid transparent;
    flex: 0 0 auto;
  }

  .adjuster-arrow-up {
    border-bottom: 0.36rem solid #607d8b;
  }

  .adjuster-arrow-down {
    border-top: 0.36rem solid #607d8b;
  }

  .log-button {
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0.65rem 1rem;
    font-size: 1rem;
    font-weight: 600;
    background: var(--color-tertiary);
    color: var(--color-tertiary-text);
    cursor: pointer;
    transition:
      background 0.2s,
      transform 0.2s;
    align-self: end;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @media (max-width: 520px) {
    .action-grid.multi-inputs > .log-button {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  .log-button:hover:not(:disabled) {
    background: var(--color-tertiary-hover);
  }

  .log-button:disabled {
    background: #bdbdbd;
    cursor: not-allowed;
  }

  @container (max-width: 380px) {
    .header-row {
      display: grid;
      grid-template-columns: minmax(52px, 96px) minmax(0, 1fr);
      grid-template-areas:
        "title title"
        "icon pill"
        "badges badges";
      gap: 0.75rem;
      align-items: stretch;
    }

    .header-main,
    .header-top {
      display: contents;
    }

    .title-block {
      grid-area: title;
      text-align: center;
    }

    .title-block h2 {
      justify-content: center;
      font-size: 1.35rem;
      width: 100%;
    }

    .workout-icon {
      grid-area: icon;
      width: 100%;
      height: auto;
      aspect-ratio: 1;
      align-self: start;
      min-width: 52px;
    }

    .momentum-pill {
      grid-area: pill;
      width: 100%;
      min-width: 0;
      min-height: 72px;
      padding: 0.6rem;
    }

    .badge-row {
      grid-area: badges;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }
  }
</style>
