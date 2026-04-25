<script lang="ts">
  import { onMount } from 'svelte';
  import { toastMessage } from '$lib/stores';
  import { loadWorkouts } from '$lib/storage';
  import WorkoutList from './routes/WorkoutList.svelte';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import Toast from '$lib/components/Toast.svelte';

  let loading = true;

  onMount(async () => {
    try {
      await loadWorkouts();
      loading = false;
    } catch (error) {
      console.error('Failed to load workouts:', error);
      loading = false;
    }
  });
</script>

<svelte:window />

<main class="app-container">
  <InstallPrompt />

  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading workouts...</p>
    </div>
  {:else}
    <WorkoutList />
  {/if}
  
  {#if $toastMessage}
    <Toast message={$toastMessage} />
  {/if}
</main>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    --color-primary: #243e51;
    --color-primary-hover: #1b2f3d;
    --color-primary-accent: #36586d;
    --color-primary-border: #b8c4cc;
    --color-primary-soft: #e7edf2;
    --color-primary-shadow: rgba(36, 62, 81, 0.12);
    --color-tertiary: #f1ebce;
    --color-tertiary-hover: #e4dcb0;
    --color-tertiary-text: #243e51;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #f5f5f5;
    color: #333;
    line-height: 1.6;
  }

  .app-container {
    min-height: 100vh;
    padding: 1rem;
    max-width: 600px;
    margin: 0 auto;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    gap: 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e0e0e0;
    border-top-color: #4CAF50;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

