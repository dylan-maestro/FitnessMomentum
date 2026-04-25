<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { updateSettings, getBackupData, restoreBackupData } from '$lib/storage';
  import { settings, showToast } from '$lib/stores';
  import { fromMetricWeight, toMetricWeight } from '$lib/units';
  import packageInfo from '../../package.json';

  const dispatch = createEventDispatcher();

  let weightUnit: 'kg' | 'lb' = $settings.weightUnit ?? 'kg';
  let bodyWeight = fromMetricWeight($settings.bodyWeight, weightUnit);
  let distanceUnit: 'km' | 'mi' = $settings.distanceUnit ?? 'km';
  const appVersion: string = packageInfo.version;

  function handleWeightUnitChange(nextUnit: 'kg' | 'lb') {
    if (nextUnit === weightUnit) {
      return;
    }

    const metricWeight = toMetricWeight(Number(bodyWeight), weightUnit);
    weightUnit = nextUnit;
    bodyWeight = Math.round(fromMetricWeight(metricWeight, weightUnit));
  }

  function handleSave() {
    const normalizedWeight = Number(bodyWeight);
    
    if (!Number.isFinite(normalizedWeight) || normalizedWeight < 0) {
      showToast('Please enter a valid body weight');
      return;
    }
    const roundedWeight = Math.round(normalizedWeight);
    bodyWeight = roundedWeight;

    const normalizedUnit: 'kg' | 'lb' = weightUnit === 'lb' ? 'lb' : 'kg';
    const normalizedDistanceUnit: 'km' | 'mi' = distanceUnit === 'mi' ? 'mi' : 'km';
    const metricBodyWeight = toMetricWeight(roundedWeight, normalizedUnit);

    updateSettings({
      bodyWeight: metricBodyWeight,
      weightUnit: normalizedUnit,
      distanceUnit: normalizedDistanceUnit
    });
    showToast('Settings saved');
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

  let fileInput: HTMLInputElement;

  type AndroidBridge = {
    saveBackup?: (data: string, filename: string) => void;
    importBackup?: () => void;
  };

  type FilePickerWindow = Window & typeof globalThis & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<Array<{ getFile: () => Promise<File> }>>;
    Android?: AndroidBridge;
    __onAndroidBackupImported?: (content: string) => void;
    __onAndroidBackupImportError?: (message: string) => void;
  };

  function getAndroidBridge(): AndroidBridge | null {
    const maybeAndroid = (window as FilePickerWindow).Android;
    if (!maybeAndroid || typeof maybeAndroid !== 'object') {
      return null;
    }
    return maybeAndroid;
  }

  async function processImportedBackup(content: string) {
    const success = await restoreBackupData(content);
    if (success) {
      showToast('Data imported successfully');
    } else {
      showToast('Import failed: Invalid data');
    }
  }

  onMount(() => {
    const win = window as FilePickerWindow;
    win.__onAndroidBackupImported = (content: string) => {
      processImportedBackup(content);
    };
    win.__onAndroidBackupImportError = (message: string) => {
      showToast(message || 'Import failed');
    };
  });

  onDestroy(() => {
    const win = window as FilePickerWindow;
    delete win.__onAndroidBackupImported;
    delete win.__onAndroidBackupImportError;
  });

  function handleExport() {
    try {
      const data = getBackupData();
      const filename = `fitness-momentum-backup-${new Date().toISOString().split('T')[0]}.json`;
      const android = getAndroidBridge();

      if (typeof android?.saveBackup === 'function') {
        android.saveBackup(data, filename);
        showToast('Choose where to save your backup');
        return;
      }

      const win = window as FilePickerWindow;
      const showSaveFilePicker = win.showSaveFilePicker;
      if (typeof showSaveFilePicker === 'function') {
        void (async () => {
          const handle = await showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(data);
          await writable.close();
          showToast('Data exported successfully');
        })().catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          console.error('Export failed:', error);
          showToast('Export failed');
        });
        return;
      }

      // Final fallback for browsers without the File System Access API.
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully');
    } catch (e) {
      console.error('Export failed:', e);
      showToast('Export failed');
    }
  }

  function triggerImport() {
    const android = getAndroidBridge();
    if (typeof android?.importBackup === 'function') {
      android.importBackup();
      return;
    }

    const win = window as FilePickerWindow;
    const showOpenFilePicker = win.showOpenFilePicker;
    if (typeof showOpenFilePicker === 'function') {
      void (async () => {
        const handles = await showOpenFilePicker({
          multiple: false,
          types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }]
        });
        if (!handles.length) {
          return;
        }
        const file = await handles[0].getFile();
        const content = await file.text();
        await processImportedBackup(content);
      })().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Import failed:', error);
        showToast('Import failed');
      });
      return;
    }

    fileInput.click();
  }

  async function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (content) {
        await processImportedBackup(content);
      }
    };

    reader.readAsText(file);
    input.value = ''; // Reset
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
      <h2 id="modal-title">Settings</h2>
      <button class="close-button" on:click={handleClose}>×</button>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label for="bodyWeight">Body Weight</label>
        <input
          id="bodyWeight"
          type="number"
          bind:value={bodyWeight}
          min="0"
          step="1"
          placeholder="Enter your body weight"
        />
        <small>Used as the default weight for bodyweight exercises</small>
      </div>
      <fieldset class="form-group unit-fieldset">
        <legend>Display Units</legend>
        <div class="unit-toggle" role="group" aria-label="Select display units">
          <button
            type="button"
            class="unit-btn {weightUnit === 'kg' ? 'active' : ''}"
            aria-pressed={weightUnit === 'kg'}
            on:click={() => handleWeightUnitChange('kg')}
          >
            Kilograms (kg)
          </button>
          <button
            type="button"
            class="unit-btn {weightUnit === 'lb' ? 'active' : ''}"
            aria-pressed={weightUnit === 'lb'}
            on:click={() => handleWeightUnitChange('lb')}
          >
            Pounds (lb)
          </button>
        </div>
        <small>This affects how weight and volume are displayed.</small>
      </fieldset>
      <fieldset class="form-group unit-fieldset">
        <legend>Distance Units</legend>
        <div class="unit-toggle" role="group" aria-label="Select distance units">
          <button
            type="button"
            class="unit-btn {distanceUnit === 'km' ? 'active' : ''}"
            aria-pressed={distanceUnit === 'km'}
            on:click={() => (distanceUnit = 'km')}
          >
            Kilometers (km)
          </button>
          <button
            type="button"
            class="unit-btn {distanceUnit === 'mi' ? 'active' : ''}"
            aria-pressed={distanceUnit === 'mi'}
            on:click={() => (distanceUnit = 'mi')}
          >
            Miles (mi)
          </button>
        </div>
        <small>This affects how distance is displayed for distance-type workouts.</small>
      </fieldset>

      <fieldset class="form-group unit-fieldset">
        <legend>Data Management</legend>
        <div class="data-management-buttons">
            <button type="button" class="action-btn export-btn" on:click={handleExport}>
                Export Data
            </button>
            <button type="button" class="action-btn import-btn" on:click={triggerImport}>
                Import Data
            </button>
            <input 
                type="file" 
                accept=".json" 
                style="display: none;" 
                bind:this={fileInput}
                on:change={handleImport} 
            />
        </div>
        <small>Backup your workouts and settings to a JSON file, or restore from a previous backup.</small>
      </fieldset>
    </div>

    <div class="modal-footer">
      <button class="cancel-button" on:click={handleClose}>Cancel</button>
      <button class="save-button" on:click={handleSave}>Save</button>
    </div>
    <p class="app-version">Version {appVersion}</p>
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

  .form-group input {
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

  .form-group small {
    display: block;
    margin-top: 0.25rem;
    color: #666;
    font-size: 0.85rem;
  }

  .unit-fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1.5rem 0;
  }

  .unit-fieldset legend {
    font-weight: 600;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .unit-toggle {
    display: flex;
    gap: 0.5rem;
    background: #f0f0f0;
    padding: 0.4rem;
    border-radius: 10px;
  }

  .unit-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 0.65rem 0.85rem;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #555;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .unit-btn:hover {
    background: rgba(255, 255, 255, 0.6);
  }

  .unit-btn.active {
    background: white;
    color: var(--color-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }

  .unit-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid #eee;
  }

  .app-version {
    padding: 0 1.5rem 1.5rem;
    font-size: 0.85rem;
    color: #888;
    text-align: right;
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
  }

  .save-button:hover {
    background: #45a049;
  }

  .data-management-buttons {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .action-btn {
    flex: 1;
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
</style>
