<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { workouts } from '$lib/stores';
  import { addWorkout, deleteWorkout, processDailyDecay } from '$lib/storage';
  import { showToast } from '$lib/stores';
  import {
    currentDate,
    currentTimestamp,
    dateOverride,
    setDateOverride,
    clearDateOverride
  } from '$lib/currentDate';
  import WorkoutCard from './WorkoutCard.svelte';
  import WorkoutModal from './WorkoutModal.svelte';
  import HelpPage from './HelpPage.svelte';
  import SettingsModal from './SettingsModal.svelte';
  import TemplateSelectionModal from './TemplateSelectionModal.svelte';
  import type { Workout } from '$lib/types';
  import { WORKOUT_TEMPLATES, type WorkoutTemplate } from '$lib/templates';
  import { DECAY_RATE_PER_DAY } from '$lib/momentum';
  import { getDefaultMomentumFactor, type WorkoutType } from '$lib/workoutTypes';
  import AppIconSvg from '../../icon-source/app-icon.svg?raw';

  let showModal = false;
  let showHelpPage = false;
  let showSettingsModal = false;
  let showTemplateModal = false;
  let showWebAppBar = false;
  // Use Partial<Workout> to allow templates (no ID)
  let editingWorkout: Partial<Workout> | null = null;
  type WorkoutDraft = Pick<
    Workout,
    | 'name'
    | 'momentum'
    | 'baseVolume'
    | 'weight'
    | 'isBodyweight'
    | 'decay'
    | 'targetIncreasePercentage'
    | 'targetFrequency'
    | 'workoutType'
    | 'momentumFactor'
    | 'distanceInputMode'
  > &
    Partial<
      Pick<
        Workout,
        'dailyVolume' | 'lastLoggedAt' | 'previousLoggedAt' | 'lastUpdateUnix'
      >
    >;
  const isDebugBuild = import.meta.env.MODE !== 'production';
  type NavigatorCard = {
    id: string;
    name: string;
    centerRatio: number;
    stackRatio: number;
    iconMarkup: string;
  };
  const fallbackIcon = (AppIconSvg ?? '').trim();
  const templateIconMap = new Map(
    WORKOUT_TEMPLATES.map((template) => [template.name.trim(), (template.icon ?? '').trim()])
  );
  const workoutCardNodes = new Map<string, HTMLElement>();
  let navigatorTrack: HTMLDivElement | null = null;
  let navigatorCards: NavigatorCard[] = [];
  let navigatorVisible = false;
  let navigatorHover = false;
  let navigatorDragging = false;
  let activeWorkoutId: string | null = null;
  let viewportThumbTop = 0;
  let viewportThumbHeight = 0.18;
  let navigatorFrame = 0;
  let dragPointerId: number | null = null;
  let navigatorSignature = '';
  let activeWorkoutName = 'Exercises';
  let activeWorkoutStackRatio = 0.5;

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function getWorkoutIconMarkup(name?: string | null): string {
    if (!name) {
      return fallbackIcon;
    }

    const trimmedName = name.trim();
    const iconMarkup = templateIconMap.get(trimmedName);
    return iconMarkup && iconMarkup.length > 0 ? iconMarkup : fallbackIcon;
  }

  function getDocumentHeight(): number {
    return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  }

  function getScrollRange(): number {
    return Math.max(getDocumentHeight() - window.innerHeight, 0);
  }

  function scheduleNavigatorRefresh() {
    if (typeof window === 'undefined' || navigatorFrame) {
      return;
    }

    navigatorFrame = window.requestAnimationFrame(() => {
      navigatorFrame = 0;
      refreshNavigator();
    });
  }

  function scrollToWorkout(id: string, behavior: ScrollBehavior = 'smooth') {
    const node = workoutCardNodes.get(id);

    if (!node) {
      return;
    }

    const cardTop = node.getBoundingClientRect().top + window.scrollY;
    const targetTop = clamp(cardTop - 24, 0, getScrollRange());
    window.scrollTo({ top: targetTop, behavior });
  }

  function scrollFromNavigatorPosition(clientY: number, behavior: ScrollBehavior = 'auto') {
    if (!navigatorTrack) {
      return;
    }

    const rect = navigatorTrack.getBoundingClientRect();
    const pointerRatio = clamp((clientY - rect.top) / rect.height, 0, 1);
    const targetCenter = pointerRatio * getDocumentHeight();
    const targetTop = clamp(targetCenter - window.innerHeight / 2, 0, getScrollRange());
    window.scrollTo({ top: targetTop, behavior });
  }

  function refreshNavigator() {
    if (typeof window === 'undefined') {
      return;
    }

    const nodes = Array.from(workoutCardNodes.entries())
      .filter(([, node]) => node.isConnected)
      .map(([id, node]) => {
        const rect = node.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const height = Math.max(rect.height, 1);

        return {
          id,
          name: node.dataset.workoutName ?? 'Exercise',
          top,
          height
        };
      })
      .sort((a, b) => a.top - b.top);

    if (nodes.length === 0) {
      navigatorVisible = false;
      navigatorCards = [];
      activeWorkoutId = null;
      return;
    }

    const documentHeight = Math.max(getDocumentHeight(), window.innerHeight);
    const scrollRange = getScrollRange();
    navigatorVisible = nodes.length > 2 && scrollRange > 160;

    navigatorCards = nodes.map(({ id, name, top, height }, index) => {
      const stackRatio =
        nodes.length === 1 ? 0.5 : 0.06 + (index / (nodes.length - 1)) * 0.88;

      return {
        id,
        name,
        centerRatio: clamp((top + height / 2) / documentHeight, 0, 1),
        stackRatio,
        iconMarkup: getWorkoutIconMarkup(name)
      };
    });

    viewportThumbHeight = clamp(window.innerHeight / documentHeight, 0.14, 0.4);
    viewportThumbTop =
      scrollRange > 0 ? clamp((window.scrollY / scrollRange) * (1 - viewportThumbHeight), 0, 1) : 0;

    const viewportCenterRatio = clamp((window.scrollY + window.innerHeight / 2) / documentHeight, 0, 1);
    activeWorkoutId =
      navigatorCards.reduce(
        (closest, card) => {
          const distance = Math.abs(card.centerRatio - viewportCenterRatio);

          if (distance < closest.distance) {
            return { id: card.id, distance };
          }

          return closest;
        },
        { id: navigatorCards[0]?.id ?? null, distance: Number.POSITIVE_INFINITY }
      ).id ?? null;
  }

  function handleNavigatorPointerDown(event: PointerEvent) {
    navigatorDragging = true;
    navigatorHover = true;
    dragPointerId = event.pointerId;
    navigatorTrack?.setPointerCapture(event.pointerId);
    scrollFromNavigatorPosition(event.clientY);
    event.preventDefault();
  }

  function handleNavigatorPointerMove(event: PointerEvent) {
    if (!navigatorDragging || dragPointerId !== event.pointerId) {
      return;
    }

    scrollFromNavigatorPosition(event.clientY);
    event.preventDefault();
  }

  function handleNavigatorPointerUp(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) {
      return;
    }

    navigatorTrack?.releasePointerCapture(event.pointerId);
    navigatorDragging = false;
    dragPointerId = null;
    navigatorHover = event.pointerType === 'mouse';
  }

  function handleNavigatorKeydown(event: KeyboardEvent) {
    if (!navigatorCards.length) {
      return;
    }

    const currentIndex = Math.max(
      navigatorCards.findIndex((card) => card.id === activeWorkoutId),
      0
    );
    const lastIndex = navigatorCards.length - 1;

    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      scrollToWorkout(navigatorCards[Math.min(currentIndex + 1, lastIndex)].id);
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      scrollToWorkout(navigatorCards[Math.max(currentIndex - 1, 0)].id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      scrollToWorkout(navigatorCards[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      scrollToWorkout(navigatorCards[lastIndex].id);
    }
  }

  function registerWorkoutCard(node: HTMLElement, workout: Workout) {
    let currentWorkout = workout;
    const resizeObserver = new ResizeObserver(() => {
      scheduleNavigatorRefresh();
    });

    node.dataset.workoutName = currentWorkout.name;
    workoutCardNodes.set(currentWorkout.id, node);
    resizeObserver.observe(node);
    scheduleNavigatorRefresh();

    return {
      update(nextWorkout: Workout) {
        if (nextWorkout.id !== currentWorkout.id) {
          workoutCardNodes.delete(currentWorkout.id);
          workoutCardNodes.set(nextWorkout.id, node);
        }

        currentWorkout = nextWorkout;
        node.dataset.workoutName = currentWorkout.name;
        scheduleNavigatorRefresh();
      },
      destroy() {
        resizeObserver.disconnect();
        workoutCardNodes.delete(currentWorkout.id);
        scheduleNavigatorRefresh();
      }
    };
  }

  $: {
    const nextSignature = $workouts.map(({ id, name }) => `${id}:${name}`).join('|');

    if (nextSignature !== navigatorSignature) {
      navigatorSignature = nextSignature;

      if (typeof window !== 'undefined') {
        tick().then(() => {
          scheduleNavigatorRefresh();
        });
      }
    }
  }

  $: activeWorkoutName = navigatorCards.find((card) => card.id === activeWorkoutId)?.name ?? 'Exercises';
  $: activeWorkoutStackRatio =
    navigatorCards.find((card) => card.id === activeWorkoutId)?.stackRatio ?? 0.5;

  onMount(() => {
    // Keep the same top-level app chrome in both the PWA and Android WebView shell.
    showWebAppBar = true;

    const handleWindowChange = () => {
      scheduleNavigatorRefresh();
    };
    const layoutObserver = new ResizeObserver(() => {
      scheduleNavigatorRefresh();
    });

    window.addEventListener('scroll', handleWindowChange, { passive: true });
    window.addEventListener('resize', handleWindowChange);
    layoutObserver.observe(document.documentElement);
    layoutObserver.observe(document.body);
    tick().then(() => {
      scheduleNavigatorRefresh();
    });

    return () => {
      window.removeEventListener('scroll', handleWindowChange);
      window.removeEventListener('resize', handleWindowChange);
      layoutObserver.disconnect();

      if (navigatorFrame) {
        window.cancelAnimationFrame(navigatorFrame);
      }
    };
  });

  function handleAdd() {
    showTemplateModal = true;
  }

  function handleTemplateSelect(event: CustomEvent<WorkoutTemplate>) {
    editingWorkout = { ...event.detail };
    showTemplateModal = false;
    showModal = true;
  }

  function normalizeWorkoutType(templateType: WorkoutTemplate['workoutType']): WorkoutType {
    return templateType ?? 'weight';
  }

  function handleTemplateQuickAdd(event: CustomEvent<WorkoutTemplate>) {
    const template = event.detail;
    const baseVolume = Math.max(0, Number(template.baseVolume) || 0);
    const decay = DECAY_RATE_PER_DAY;
    const frequency = Math.max(1, Math.round(Number(template.targetFrequency) || 1));
    const workoutType = normalizeWorkoutType(template.workoutType);
    const momentumFactor = getDefaultMomentumFactor(workoutType);
    const targetIncreasePercentage =
      typeof template.targetIncreasePercentage === 'number' ? template.targetIncreasePercentage : 0;
    const distanceInputMode = workoutType === 'distance' ? template.distanceInputMode : undefined;
    const weight = Number.isFinite(template.weight) ? template.weight : 0;

    addWorkout({
      name: template.name,
      baseVolume,
      weight,
      isBodyweight: template.isBodyweight,
      workoutType,
      momentumFactor,
      distanceInputMode,
      momentum: 0,
      decay,
      targetIncreasePercentage,
      targetFrequency: frequency
    });

    showToast(`${template.name} added`);
    showTemplateModal = false;
  }

  function handleCustomAdd() {
    editingWorkout = null;
    showTemplateModal = false;
    showModal = true;
  }

  function handleTemplateClose() {
    showTemplateModal = false;
  }

  function handleSettings() {
    showSettingsModal = true;
  }

  function handleHelp() {
    showHelpPage = true;
  }

  function handleEdit(event: CustomEvent<Workout>) {
    const { detail } = event;
    editingWorkout = { ...detail };
    showModal = true;
  }

  function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this workout?')) {
      deleteWorkout(id);
      showToast('Workout deleted');
    }
  }

  function handleSave(event: CustomEvent<WorkoutDraft>) {
    const workoutData = event.detail;
    addWorkout(workoutData);
    showToast('Workout created');
    showModal = false;
    editingWorkout = null;
  }

  function handleClose() {
    showModal = false;
    editingWorkout = null;
  }

  function handleSettingsClose() {
    showSettingsModal = false;
  }

  function handleHelpClose() {
    showHelpPage = false;
  }

  function handleDateInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const value = target.value;

    if (!value) {
      clearDateOverride();
      return;
    }

    setDateOverride(value);
  }

  function handleDateReset() {
    clearDateOverride();
  }

  // Ensure decay is applied when the date changes (e.g. crossing midnight or debug override)
  $: if ($currentDate) {
      processDailyDecay();
  }
</script>

<div class="workout-list">
  {#if showWebAppBar}
    <header class="app-bar">
      <div>
        <p class="app-title">FitMo</p>
      </div>
      <div class="app-bar-actions">
        <button class="icon-button app-bar-button" on:click={handleHelp} aria-label="Help">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M10.15 9.35a2.05 2.05 0 0 1 4.1.18c0 1.45-1.2 2-1.88 2.47-.47.33-.72.58-.72 1.15v.35"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="12" cy="16.85" r="0.9" fill="currentColor" />
          </svg>
        </button>
        <button class="icon-button app-bar-button" on:click={handleSettings} aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
      </div>
    </header>
  {/if}

  <header class="header">
    <h1>Exercises</h1>
    <div class="header-actions">
      {#if !showWebAppBar}
        <button class="icon-button" on:click={handleHelp} aria-label="Help">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M10.15 9.35a2.05 2.05 0 0 1 4.1.18c0 1.45-1.2 2-1.88 2.47-.47.33-.72.58-.72 1.15v.35"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="12" cy="16.85" r="0.9" fill="currentColor" />
          </svg>
        </button>
        <button class="icon-button" on:click={handleSettings} aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
      {/if}
      <button class="add-button" on:click={handleAdd}>+ Add Exercise</button>
    </div>
  </header>

  {#if isDebugBuild}
    <section class="debug-controls">
      <div class="debug-field">
        <label for="debug-date">Simulated clock</label>
        <input
          id="debug-date"
          type="datetime-local"
          value={$dateOverride ?? ''}
          on:input={handleDateInput}
        />
        {#if $dateOverride}
          <button type="button" class="clear-button" on:click={handleDateReset}>
            Reset
          </button>
        {/if}
      </div>
      <div class="debug-status">
        Active clock:
        <span>{new Date($currentTimestamp).toLocaleString()}</span>
        <span class="system-note">({$currentDate})</span>
        {#if !$dateOverride}
          <span class="system-note">(system)</span>
        {/if}
      </div>
    </section>
  {/if}

  {#if $workouts.length === 0}
    <div class="empty-state">
      <p>No exercises yet. Create your first exercise to start tracking!</p>
    </div>
  {:else}
    <div class="workouts">
      {#each $workouts as workout (workout.id)}
        <div class="workout-card-shell" use:registerWorkoutCard={workout}>
          <WorkoutCard
            {workout}
            on:edit={handleEdit}
            on:delete={() => handleDelete(workout.id)}
          />
        </div>
      {/each}
    </div>
  {/if}

  {#if navigatorVisible && !showModal && !showTemplateModal && !showHelpPage && !showSettingsModal}
    <div
      class="mini-navigator"
      class:navigator-interactive={navigatorHover || navigatorDragging}
      class:navigator-dragging={navigatorDragging}
      role="slider"
      tabindex="0"
      aria-label="Exercise navigator"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.max(navigatorCards.length - 1, 0)}
      aria-valuenow={Math.max(navigatorCards.findIndex((card) => card.id === activeWorkoutId), 0)}
      aria-valuetext={activeWorkoutName}
      on:mouseenter={() => (navigatorHover = true)}
      on:mouseleave={() => {
        if (!navigatorDragging) {
          navigatorHover = false;
        }
      }}
      on:focus={() => (navigatorHover = true)}
      on:blur={() => {
        if (!navigatorDragging) {
          navigatorHover = false;
        }
      }}
      on:pointerdown={handleNavigatorPointerDown}
      on:pointermove={handleNavigatorPointerMove}
      on:pointerup={handleNavigatorPointerUp}
      on:pointercancel={handleNavigatorPointerUp}
      on:keydown={handleNavigatorKeydown}
    >
      <div class="mini-navigator__title" style={`top: ${activeWorkoutStackRatio * 100}%;`}>
        {activeWorkoutName}
      </div>
      <div class="mini-navigator__track" bind:this={navigatorTrack}>
        <div class="mini-navigator__spine"></div>
        <div
          class="mini-navigator__viewport"
          style={`top: ${viewportThumbTop * 100}%; height: ${viewportThumbHeight * 100}%;`}
        ></div>
        {#each navigatorCards as card (card.id)}
          <button
            type="button"
            class="mini-navigator__icon"
            class:mini-navigator__icon-active={card.id === activeWorkoutId}
            aria-label={`Go to ${card.name}`}
            style={`top: ${card.stackRatio * 100}%;`}
            on:pointerdown|stopPropagation
            on:click|stopPropagation={() => scrollToWorkout(card.id)}
          >
            <span class="mini-navigator__icon-art" aria-hidden="true">
              {@html card.iconMarkup}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if showModal}
    <WorkoutModal
      workout={editingWorkout}
      on:save={handleSave}
      on:close={handleClose}
    />
  {/if}

  {#if showTemplateModal}
    <TemplateSelectionModal
      on:select={handleTemplateSelect}
      on:add={handleTemplateQuickAdd}
      on:custom={handleCustomAdd}
      on:close={handleTemplateClose}
    />
  {/if}

  {#if showHelpPage}
    <HelpPage on:close={handleHelpClose} />
  {/if}

  {#if showSettingsModal}
    <SettingsModal
      on:close={handleSettingsClose}
    />
  {/if}
</div>

<style>
  .workout-list {
    width: 100%;
  }

  .app-bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding:
      calc(0.35rem + var(--android-safe-area-top, env(safe-area-inset-top, 0px)))
      calc(1rem + var(--android-safe-area-right, env(safe-area-inset-right, 0px)))
      0.35rem
      calc(1rem + var(--android-safe-area-left, env(safe-area-inset-left, 0px)));
    margin: -1rem -1rem 1rem;
    background: var(--color-primary);
    color: white;
    border-radius: 0 0 12px 12px;
    box-shadow: 0 6px 18px rgba(36, 62, 81, 0.14);
  }

  .app-title {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .app-bar-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header h1 {
    font-size: 2rem;
    color: #333;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .debug-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px dashed #f0c36d;
    border-radius: 8px;
    background: #fff8e1;
    color: #6d4c41;
  }

  .debug-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .debug-field label {
    font-weight: 600;
  }

  .debug-field input {
    padding: 0.4rem 0.6rem;
    border: 1px solid #d7ccc8;
    border-radius: 6px;
    font-size: 0.95rem;
  }

  .clear-button {
    background: transparent;
    border: 1px solid #f57c00;
    color: #f57c00;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .clear-button:hover {
    background: #f57c00;
    color: white;
  }

  .debug-status {
    font-size: 0.9rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: baseline;
  }

  .debug-status span {
    font-weight: 600;
  }

  .system-note {
    font-weight: 400;
    color: #8d6e63;
  }

  .add-button {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-button:hover {
    background: var(--color-primary-hover);
  }

  .add-button:active {
    transform: scale(0.98);
  }

  .icon-button {
    background: #f5f5f5;
    color: #333;
    border: 1px solid #ddd;
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    transition: background 0.2s;
  }

  .icon-button:hover {
    background: #e0e0e0;
  }

  .app-bar-button {
    background: transparent;
    color: white;
    border: none;
    padding: 0.2rem;
    border-radius: 0;
    font-size: 1.15rem;
  }

  .app-bar-button:hover {
    background: transparent;
  }

  .app-bar-button svg {
    display: block;
    width: 1.2rem;
    height: 1.2rem;
    fill: currentColor;
  }

  .icon-button svg {
    display: block;
    width: 1.2rem;
    height: 1.2rem;
    fill: currentColor;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #666;
  }

  .workouts {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .workout-card-shell {
    min-width: 0;
  }

  .mini-navigator {
    position: fixed;
    top: 50%;
    right: calc(0.3rem + env(safe-area-inset-right, 0px));
    transform: translateY(-50%);
    z-index: 40;
    opacity: 0.4;
    user-select: none;
    touch-action: none;
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .mini-navigator:focus-visible {
    outline: 2px solid rgba(54, 88, 109, 0.55);
    outline-offset: 3px;
  }

  .navigator-interactive {
    opacity: 1;
    transform: translateY(-50%) scale(1.02);
  }

  .navigator-dragging {
    transform: translateY(-50%) scale(1.04);
  }

  .mini-navigator__title {
    position: absolute;
    top: 50%;
    right: calc(100% + 0.55rem);
    white-space: nowrap;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--color-primary);
    opacity: 0;
    transform: translateY(-50%) translateX(0.3rem);
    pointer-events: none;
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9),
      0 0 10px rgba(255, 255, 255, 0.85);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .navigator-interactive .mini-navigator__title {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }

  .mini-navigator__track {
    position: relative;
    width: 1.55rem;
    height: min(58vh, 24rem);
    min-height: 9rem;
    overflow: visible;
    transition:
      width 0.2s ease,
      transform 0.2s ease;
  }

  .navigator-interactive .mini-navigator__track {
    width: 2.1rem;
  }

  .mini-navigator__spine,
  .mini-navigator__viewport,
  .mini-navigator__icon {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .mini-navigator__spine {
    top: 0;
    width: 2px;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(36, 62, 81, 0.16), rgba(36, 62, 81, 0.28));
    transition:
      width 0.2s ease,
      opacity 0.2s ease;
  }

  .navigator-interactive .mini-navigator__spine {
    width: 3px;
  }

  .mini-navigator__viewport {
    width: 0.7rem;
    min-height: 1.35rem;
    border-radius: 999px;
    background: rgba(54, 88, 109, 0.14);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
    opacity: 0.75;
    transition:
      width 0.2s ease,
      opacity 0.2s ease;
  }

  .navigator-interactive .mini-navigator__viewport {
    width: 1rem;
    opacity: 0.95;
  }

  .mini-navigator__icon {
    top: 50%;
    width: 1.15rem;
    height: 1.15rem;
    padding: 0;
    border: none;
    background: transparent;
    color: rgba(36, 62, 81, 0.55);
    border-radius: 5px;
    cursor: pointer;
    transform: translate(-50%, -50%) scale(0.88);
    transform-origin: center;
    transition:
      color 0.2s ease,
      transform 0.2s ease,
      filter 0.2s ease,
      opacity 0.2s ease;
  }

  .navigator-interactive .mini-navigator__icon {
    width: 1.35rem;
    height: 1.35rem;
    transform: translate(-50%, -50%) scale(1);
    color: rgba(36, 62, 81, 0.78);
  }

  .mini-navigator__icon:hover {
    color: rgba(36, 62, 81, 0.9);
  }

  .mini-navigator__icon-active {
    color: var(--color-primary);
    transform: translate(-50%, -50%) scale(1.14);
    filter: drop-shadow(0 4px 12px rgba(36, 62, 81, 0.22));
  }

  .navigator-interactive .mini-navigator__icon-active {
    transform: translate(-50%, -50%) scale(1.22);
  }

  .mini-navigator__icon-art {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    overflow: hidden;
  }

  .mini-navigator__icon-art :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  @media (max-width: 640px) {
    .mini-navigator {
      right: calc(0.15rem + env(safe-area-inset-right, 0px));
    }

    .mini-navigator__track {
      height: min(52vh, 20rem);
    }

    .mini-navigator__title {
      font-size: 0.76rem;
      right: calc(100% + 0.4rem);
    }
  }
</style>
