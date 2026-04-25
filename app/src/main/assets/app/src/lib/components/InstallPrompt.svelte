<script lang="ts">
  import { onMount } from 'svelte';

  type PromptOutcome = {
    outcome: 'accepted' | 'dismissed';
    platform?: string;
  };

  type DeferredInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<PromptOutcome>;
  };

  const DISMISS_KEY = 'fitness-install-banner-dismissed-until';
  const DISMISS_FOR_MS = 1000 * 60 * 60 * 24 * 14;

  let showBanner = false;
  let canPromptInstall = false;
  let isIos = false;
  let isStandalone = false;
  let deferredPrompt: DeferredInstallPromptEvent | null = null;

  function detectIos(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }

  function detectStandaloneMode(): boolean {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    return iosStandalone || mediaStandalone;
  }

  function getDismissedUntil(): number {
    try {
      const value = window.localStorage.getItem(DISMISS_KEY);
      return Number(value) || 0;
    } catch {
      return 0;
    }
  }

  function setDismissedUntil(timestamp: number): void {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(timestamp));
    } catch {
      // Ignore storage failures (privacy modes, restricted storage, etc.).
    }
  }

  function clearDismissedUntil(): void {
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  function shouldShowBanner(): boolean {
    if (window.location.protocol === 'file:') {
      // Android WebView host cannot install as a web app.
      return false;
    }
    if (isStandalone) {
      return false;
    }
    return Date.now() > getDismissedUntil();
  }

  function dismissForNow(): void {
    setDismissedUntil(Date.now() + DISMISS_FOR_MS);
    showBanner = false;
  }

  async function handleInstall(): Promise<void> {
    if (!deferredPrompt) {
      return;
    }

    try {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      canPromptInstall = false;

      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        clearDismissedUntil();
        showBanner = false;
      } else {
        dismissForNow();
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
      dismissForNow();
    }
  }

  onMount(() => {
    if (typeof window === 'undefined') {
      return;
    }

    isIos = detectIos();
    isStandalone = detectStandaloneMode();
    showBanner = shouldShowBanner() && isIos;

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as DeferredInstallPromptEvent;
      installEvent.preventDefault();
      deferredPrompt = installEvent;
      canPromptInstall = true;
      showBanner = shouldShowBanner();
    };

    const handleAppInstalled = () => {
      isStandalone = true;
      canPromptInstall = false;
      deferredPrompt = null;
      clearDismissedUntil();
      showBanner = false;
    };

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      isStandalone = detectStandaloneMode();
      if (isStandalone) {
        showBanner = false;
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', handleDisplayModeChange);
    } else if (typeof displayModeQuery.addListener === 'function') {
      displayModeQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (typeof displayModeQuery.removeEventListener === 'function') {
        displayModeQuery.removeEventListener('change', handleDisplayModeChange);
      } else if (typeof displayModeQuery.removeListener === 'function') {
        displayModeQuery.removeListener(handleDisplayModeChange);
      }
    };
  });
</script>

{#if showBanner}
  <section class="install-banner" aria-label="Install app">
    <div class="banner-content">
      <p class="banner-title">Install Fitness Momentum</p>
      {#if canPromptInstall}
        <p class="banner-text">Install for faster launch and a full-screen app experience.</p>
      {:else}
        <p class="banner-text">
          On iPhone/iPad: tap the Share button, then choose <strong>Add to Home Screen</strong>.
        </p>
      {/if}
    </div>

    <div class="banner-actions">
      {#if canPromptInstall}
        <button type="button" class="install-btn" on:click={handleInstall}>Install</button>
      {/if}
      <button type="button" class="dismiss-btn" on:click={dismissForNow}>Not now</button>
    </div>
  </section>
{/if}

<style>
  .install-banner {
    background: var(--color-primary-soft);
    border: 1px solid var(--color-primary-border);
    border-radius: 12px;
    padding: 0.85rem;
    margin-bottom: 2.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .banner-content {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .banner-title {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.2;
    color: var(--color-primary);
    font-weight: 700;
  }

  .banner-text {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.35;
    color: #3a4b56;
  }

  .banner-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .install-btn,
  .dismiss-btn {
    border-radius: 999px;
    padding: 0.42rem 0.82rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .install-btn {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  .install-btn:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .dismiss-btn {
    background: transparent;
    color: var(--color-primary);
    border-color: var(--color-primary-border);
  }

  .dismiss-btn:hover {
    background: rgba(36, 62, 81, 0.08);
  }
</style>
