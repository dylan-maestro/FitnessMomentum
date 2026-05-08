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

  type FilterOption = {
    label: string;
    matches: (template: WorkoutTemplate) => boolean;
  };

  const filterOptions: FilterOption[] = [
    {
      label: 'Common',
      matches: (template) => template.tags?.has('common') ?? false
    },
    {
      label: 'Weight',
      matches: (template) => template.workoutType === 'weight'
    },
    {
      label: 'Distance',
      matches: (template) => template.workoutType === 'distance'
    },
    {
      label: 'Time',
      matches: (template) => template.workoutType === 'time'
    }
  ];

  let activeFilter = filterOptions[0].label;
  let expandedTemplateName: string | null = null;
  $: activeFilterOption =
    filterOptions.find((filterOption) => filterOption.label === activeFilter) ?? filterOptions[0];
  $: filteredTemplates = WORKOUT_TEMPLATES.filter(activeFilterOption.matches);

  function handleSelect(template: WorkoutTemplate) {
    dispatch('select', template);
  }

  function handleQuickAdd(template: WorkoutTemplate) {
    dispatch('add', template);
  }

  function handleCardKeydown(event: KeyboardEvent, template: WorkoutTemplate) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleQuickAdd(template);
    }
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

      <div class="filter-bar" aria-label="Exercise filters">
        {#each filterOptions as filterOption}
          <button
            type="button"
            class:active={activeFilter === filterOption.label}
            aria-pressed={activeFilter === filterOption.label}
            on:click={() => (activeFilter = filterOption.label)}
          >
            {filterOption.label}
          </button>
        {/each}
      </div>

      <div class="templates-grid">
        {#each filteredTemplates as template (template.name)}
          <div class="template-group">
            <div class="parent-template">
              <div
                class="template-card"
                role="button"
                tabindex="0"
                on:click={() => handleQuickAdd(template)}
                on:keydown={(event) => handleCardKeydown(event, template)}
              >
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
                <button
                  type="button"
                  class="tweak-button"
                  aria-label={`Tweak ${template.name}`}
                  on:click|stopPropagation={() => handleSelect(template)}
                >
                  <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">
                    <path
                      d="M32 64C14.3 64 0 78.3 0 96s14.3 32 32 32l86.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 128c17.7 0 32-14.3 32-32s-14.3-32-32-32L265.3 64C253 35.7 224.8 16 192 16s-61 19.7-73.3 48L32 64zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l246.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48l54.7 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-54.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 224zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l54.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-246.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 384z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>

              {#if template.variants?.length}
                <button
                  type="button"
                  class="variants-button"
                  aria-expanded={expandedTemplateName === template.name}
                  on:click|preventDefault|stopPropagation={() => {
                    expandedTemplateName =
                      expandedTemplateName === template.name ? null : template.name;
                  }}
                >
                  {expandedTemplateName === template.name ? 'hide variants' : 'see variants'}
                </button>
              {/if}
            </div>

            {#if template.variants?.length && expandedTemplateName === template.name}
              <div class="variant-list">
                {#each template.variants as variant}
                  <div
                    class="template-card variant-card"
                    role="button"
                    tabindex="0"
                    on:click={() => handleQuickAdd(variant)}
                    on:keydown={(event) => handleCardKeydown(event, variant)}
                  >
                    <div class="template-icon variant-icon" aria-hidden="true">
                      {@html getIconMarkup(variant)}
                    </div>
                    <div class="template-info">
                      <h3>{variant.name}</h3>
                    </div>
                    <button
                      type="button"
                      class="tweak-button"
                      aria-label={`Tweak ${variant.name}`}
                      on:click|stopPropagation={() => handleSelect(variant)}
                    >
                      <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">
                        <path
                          d="M32 64C14.3 64 0 78.3 0 96s14.3 32 32 32l86.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 128c17.7 0 32-14.3 32-32s-14.3-32-32-32L265.3 64C253 35.7 224.8 16 192 16s-61 19.7-73.3 48L32 64zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l246.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48l54.7 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-54.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 224zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l54.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-246.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 384z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
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

  .template-group {
    display: grid;
  }

  .parent-template {
    position: relative;
  }

  .filter-bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    gap: 0.5rem;
    padding: 0.25rem 0 0.85rem;
    margin-bottom: 0.15rem;
    background: white;
  }

  .filter-bar button {
    flex: 0 0 auto;
    padding: 0.35rem 0.7rem;
    border: 1px solid #d8d8d8;
    border-radius: 999px;
    background: white;
    color: #555;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s,
      color 0.2s;
  }

  .filter-bar button:hover,
  .filter-bar button:focus-visible {
    border-color: var(--color-primary);
    color: var(--color-primary);
    outline: none;
  }

  .filter-bar button.active {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: white;
  }

  .template-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 3rem 0.85rem 1rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    transition: all 0.2s;
    width: 100%;
    cursor: pointer;
    text-align: left;
  }

  .template-card:hover,
  .template-card:focus-visible {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px var(--color-primary-shadow);
  }

  .template-card:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .template-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    overflow: hidden;
    display: inline-block;
  }

  .variants-button {
    position: absolute;
    right: 0.7rem;
    bottom: 0;
    transform: translateY(50%);
    justify-self: end;
    padding: 0.22rem 0.55rem;
    border: 1px solid #d3d3d3;
    border-radius: 999px;
    background: #f7f7f7;
    color: #666;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    z-index: 2;
    transition:
      background 0.2s,
      border-color 0.2s,
      color 0.2s;
  }

  .variants-button:hover,
  .variants-button:focus-visible {
    border-color: var(--color-primary);
    color: var(--color-primary);
    outline: none;
  }

  .variant-list {
    display: grid;
    gap: 0.35rem;
    margin-top: 1rem;
    margin-left: 1.25rem;
    padding-left: 0.75rem;
    border-left: 2px solid #e0e0e0;
  }

  .variant-card {
    gap: 0.6rem;
    padding: 0.55rem 2.6rem 0.55rem 0.7rem;
    background: #f5f5f5;
    border-color: #dedede;
    color: #555;
  }

  .variant-card:hover,
  .variant-card:focus-visible {
    background: #eceff1;
    border-color: #b9c2c8;
    box-shadow: none;
    transform: none;
  }

  .variant-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    opacity: 0.8;
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

  .variant-card .template-info h3 {
    margin: 0;
    font-size: 0.92rem;
    color: #555;
  }

  .template-details {
    margin: 0;
    font-size: 0.85rem;
    color: #666;
  }

  .tweak-button {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    width: 1rem;
    height: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #a2a2a2;
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;
  }

  .tweak-button:hover,
  .tweak-button:focus-visible {
    background: rgba(0, 0, 0, 0.06);
    color: #222;
    outline: none;
  }

  .tweak-button svg {
    width: 1.15rem;
    height: 1.15rem;
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

