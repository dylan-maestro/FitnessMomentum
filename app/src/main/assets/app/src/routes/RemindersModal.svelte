<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { updateSettings } from '$lib/storage';
  import { settings, showToast } from '$lib/stores';
  import {
    getReminderPlatformStatus,
    requestAndroidNotificationPermission,
    requestBrowserNotificationPermission
  } from '$lib/reminderRuntime';

  const dispatch = createEventDispatcher();

  let enabled = $settings.reminders.enabled;
  let idealTime = $settings.reminders.idealTime ?? '';
  let lastChanceTime = $settings.reminders.lastChanceTime ?? '';
  let platformMessage = 'Checking reminder support...';
  let permissionLabel = 'Unknown';
  let canRequestBrowserPermission = false;
  let canRequestAndroidPermission = false;

  $: if ($settings.reminders) {
    enabled = $settings.reminders.enabled;
    idealTime = $settings.reminders.idealTime ?? '';
    lastChanceTime = $settings.reminders.lastChanceTime ?? '';
  }

  function normalizeTime(value: string): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed || null;
  }

  function saveReminderSettings() {
    updateSettings({
      reminders: {
        enabled,
        idealTime: normalizeTime(idealTime),
        lastChanceTime: normalizeTime(lastChanceTime)
      }
    });
  }

  async function refreshPlatformStatus() {
    const status = await getReminderPlatformStatus();
    platformMessage = status.message;
    permissionLabel = status.notificationPermission === 'unsupported'
      ? 'Not supported'
      : status.notificationPermission;
    canRequestBrowserPermission =
      !status.isAndroidNative &&
      status.supportsForegroundNotifications &&
      status.notificationPermission === 'default';
    canRequestAndroidPermission = status.isAndroidNative &&
      window.Android?.getNotificationPermissionState?.() !== 'granted';
  }

  function handleEnabledChange(event: Event) {
    enabled = (event.currentTarget as HTMLInputElement).checked;
    saveReminderSettings();
  }

  function handleTimeBlur() {
    saveReminderSettings();
  }

  function clearIdealTime() {
    idealTime = '';
    saveReminderSettings();
  }

  function clearLastChanceTime() {
    lastChanceTime = '';
    saveReminderSettings();
  }

  async function requestPermission() {
    if (canRequestAndroidPermission) {
      await requestAndroidNotificationPermission();
      showToast('Notification permission requested');
      return;
    }

    const result = await requestBrowserNotificationPermission();
    if (result === 'granted') {
      showToast('Notifications enabled');
    } else if (result === 'denied') {
      showToast('Notifications are blocked in this browser');
    }
    await refreshPlatformStatus();
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

  onMount(() => {
    window.__onAndroidNotificationPermissionResult = () => {
      void refreshPlatformStatus();
    };
    void refreshPlatformStatus();

    return () => {
      delete window.__onAndroidNotificationPermissionResult;
    };
  });
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
    aria-labelledby="reminders-modal-title"
  >
    <div class="modal-header">
      <h2 id="reminders-modal-title">Reminders</h2>
      <button class="close-button" on:click={handleClose}>×</button>
    </div>

    <div class="modal-body">
      <div class="reminder-toggle-card">
        <div class="reminder-toggle-copy">
          <span id="global-reminders-label" class="toggle-title">Global Reminders</span>
          <span class="toggle-description">Turn all reminder delivery on or off.</span>
        </div>
        <label class="switch-label" aria-labelledby="global-reminders-label">
          <input
            id="global-reminders"
            class="switch-input"
            type="checkbox"
            checked={enabled}
            on:change={handleEnabledChange}
          />
          <span class="switch-track" aria-hidden="true">
            <span class="switch-thumb"></span>
          </span>
          <span class="switch-state">{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <div class="time-grid" class:time-grid-disabled={!enabled}>
        <div class="form-group">
          <label for="ideal-reminder-time">Ideal time</label>
          <div class="time-input-row">
            <input
              id="ideal-reminder-time"
              type="time"
              bind:value={idealTime}
              on:blur={handleTimeBlur}
              disabled={!enabled}
            />
            <button
              type="button"
              class="clear-time-button"
              on:click={clearIdealTime}
              disabled={!enabled || !idealTime}
              aria-label="Clear ideal reminder time"
            >
              Clear
            </button>
          </div>
        </div>
        <div class="form-group">
          <label for="last-chance-reminder-time">Last chance (optional)</label>
          <div class="time-input-row">
            <input
              id="last-chance-reminder-time"
              type="time"
              bind:value={lastChanceTime}
              on:blur={handleTimeBlur}
              disabled={!enabled}
            />
            <button
              type="button"
              class="clear-time-button"
              on:click={clearLastChanceTime}
              disabled={!enabled || !lastChanceTime}
              aria-label="Clear last chance reminder time"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      <small class="field-note">
        {#if enabled}
          Leaving both times empty acts like a soft global off; exercise overrides can still remind you.
        {:else}
          Turn global reminders on to edit the default reminder times.
        {/if}
      </small>

      <section class="platform-card" aria-labelledby="platform-title">
        <h3 id="platform-title">This Device</h3>
        <p>{platformMessage}</p>
        <p class="permission-status">Notification permission: {permissionLabel}</p>
        {#if canRequestBrowserPermission || canRequestAndroidPermission}
          <button type="button" class="action-btn" on:click={requestPermission}>
            Enable notifications
          </button>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
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
  }

  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #eee;
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
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .form-group input[type="time"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
  }

  .form-group input[type="time"]:disabled {
    background: #f1f3f5;
    border-color: #d8dee4;
    color: #98a2b3;
    cursor: not-allowed;
  }

  .time-input-row {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .clear-time-button {
    flex: 0 0 auto;
    padding: 0 0.75rem;
    border: 1px solid #d0d5dd;
    border-radius: 6px;
    background: white;
    color: #475467;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .clear-time-button:hover:not(:disabled) {
    border-color: var(--color-primary-border);
    color: var(--color-primary);
    background: var(--color-primary-soft);
  }

  .clear-time-button:disabled {
    background: #f1f3f5;
    color: #98a2b3;
    cursor: not-allowed;
  }

  .field-note {
    display: block;
    margin-top: 0.25rem;
    color: #666;
    font-size: 0.85rem;
  }

  .reminder-toggle-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid #dfe5eb;
    border-radius: 10px;
    background: #f8fafc;
  }

  .reminder-toggle-copy {
    min-width: 0;
  }

  .toggle-title {
    display: block;
    margin-bottom: 0.25rem;
    color: #333;
    font-weight: 700;
  }

  .toggle-description {
    display: block;
    color: #666;
    font-size: 0.85rem;
    line-height: 1.35;
  }

  .switch-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: #243e51;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }

  .switch-input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  .switch-track {
    width: 2.6rem;
    height: 1.45rem;
    border-radius: 999px;
    background: #d0d5dd;
    border: 1px solid #bcc4cf;
    position: relative;
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .switch-thumb {
    width: 1.08rem;
    height: 1.08rem;
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
    transform: translateX(1.1rem);
  }

  .switch-input:focus-visible + .switch-track {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .switch-state {
    min-width: 1.8rem;
    text-align: left;
  }

  .time-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .time-grid-disabled {
    opacity: 0.65;
  }

  .platform-card {
    margin-top: 1.5rem;
    padding: 1rem;
    border: 1px solid #dfe5eb;
    border-radius: 10px;
    background: #f8fafc;
  }

  .platform-card h3 {
    margin: 0 0 0.5rem;
    color: #243e51;
    font-size: 1rem;
  }

  .platform-card p {
    margin: 0 0 0.5rem;
    color: #555;
  }

  .permission-status {
    font-weight: 600;
  }

  .action-btn {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    font-size: 0.95rem;
    font-weight: 600;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .action-btn:hover {
    background: #f5f5f5;
    border-color: #ccc;
    color: #333;
  }

  @media (max-width: 480px) {
    .reminder-toggle-card {
      align-items: flex-start;
      flex-direction: column;
    }

    .time-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
