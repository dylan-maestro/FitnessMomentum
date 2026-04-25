<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { WORKOUT_TEMPLATES, type WorkoutTemplate } from '$lib/templates';
  import { fade, scale } from 'svelte/transition';
  import AppIconSvg from '../../icon-source/app-icon.svg?raw';

  const dispatch = createEventDispatcher<{
    select: WorkoutTemplate;
    add: WorkoutTemplate;
    custom: void;
    close: void;
  }>();

  function handleSelect(template: WorkoutTemplate) {
    dispatch('select', template);
  }

  function handleQuickAdd(template: WorkoutTemplate) {
    dispatch('add', template);
  }

  function handleCustom() {
    dispatch('custom');
  }

  function handleClose() {
    dispatch('close');
  }

  let overlayElement: HTMLDivElement | null = null;
  const fallbackIcon = (AppIconSvg ?? '').trim();

  function getIconMarkup(template: WorkoutTemplate): string {
    const icon = template.icon?.trim();
    return icon && icon.length > 0 ? icon : fallbackIcon;
  }

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
  transition:fade={{ duration: 200 }}
>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    transition:scale={{ duration: 200, start: 0.95 }}
  >
    <div class="modal-header">
      <h2 id="modal-title">Select Exercise</h2>
      <button class="close-button" on:click={handleClose}>×</button>
    </div>

    <div class="modal-body">
      <p class="subtitle">Choose a template to get started quickly, or create a custom exercise.</p>
      
      <button class="custom-button" on:click={handleCustom}>
        <span class="plus">+</span>
        Create Custom Exercise
      </button>

      <div class="divider">
        <span>OR</span>
      </div>

      <div class="templates-grid">
        {#each WORKOUT_TEMPLATES as template}
          <div class="template-card">
            <div class="template-icon" aria-hidden="true">
              {@html getIconMarkup(template)}
            </div>
            <div class="template-info">
              <h3>{template.name}</h3>
              <p class="template-details">
                {template.workoutType === 'weight'
                  ? (template.isBodyweight ? 'Bodyweight' : 'Weight-based')
                  : template.workoutType === 'distance'
                    ? 'Distance-based'
                    : 'Time-based'} •
                {template.targetFrequency === 1 ? 'Daily' : `Every ${template.targetFrequency} days`}
              </p>
            </div>
            <div class="template-actions">
              <button
                type="button"
                class="action-button primary"
                on:click={() => handleQuickAdd(template)}
              >
                Add
              </button>
              <button
                type="button"
                class="action-button secondary"
                on:click={() => handleSelect(template)}
              >
                Tweak
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding:
      calc(1rem + var(--android-safe-area-top, env(safe-area-inset-top, 0px)))
      calc(1rem + var(--android-safe-area-right, env(safe-area-inset-right, 0px)))
      calc(1rem + var(--android-safe-area-bottom, env(safe-area-inset-bottom, 0px)))
      calc(1rem + var(--android-safe-area-left, env(safe-area-inset-left, 0px)));
    backdrop-filter: blur(2px);
  }

  .modal {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #eee;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #666;
    cursor: pointer;
    line-height: 1;
    padding: 0.5rem;
    margin: -0.5rem;
    border-radius: 50%;
    transition: background 0.2s;
  }

  .close-button:hover {
    background: #f5f5f5;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .subtitle {
    margin: 0 0 1.5rem 0;
    color: #666;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .templates-grid {
    display: grid;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .template-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    transition: all 0.2s;
    width: 100%;
  }

  .template-card:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px var(--color-primary-shadow);
  }

  .template-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    overflow: hidden;
    display: inline-block;
  }

  :global(.template-icon svg) {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: inherit;
  }

  .template-info {
    flex: 1;
    min-width: 0;
  }

  .template-info h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    color: #333;
    font-weight: 600;
  }

  .template-details {
    margin: 0;
    font-size: 0.85rem;
    color: #666;
  }

  .template-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    white-space: nowrap;
  }

  .action-button {
    flex: 0 0 auto;
    padding: 0.4rem 0.7rem;
    border-radius: 8px;
    border: 1px solid transparent;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-button.primary {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .action-button.primary:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .action-button.secondary {
    background: white;
    color: #333;
    border-color: #d0d0d0;
  }

  .action-button.secondary:hover {
    border-color: #999;
    color: #111;
  }

  .divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 1.5rem 0;
    color: #999;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid #eee;
  }

  .divider span {
    padding: 0 1rem;
  }

  .custom-button {
    width: 100%;
    padding: 1rem;
    background: white;
    border: 1px dashed #bbb;
    border-radius: 12px;
    color: #666;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .custom-button:hover {
    border-color: #666;
    color: #333;
    background: #fafafa;
  }

  .plus {
    font-size: 1.2rem;
    font-weight: 400;
  }
</style>

