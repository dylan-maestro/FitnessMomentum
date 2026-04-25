export function registerPwaServiceWorker(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // The Android shell already serves bundled assets locally through WebViewAssetLoader.
  if (window.location.protocol === 'file:' || window.location.hostname === 'appassets.androidplatform.net') {
    return;
  }

  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Service worker registration failed:', error);
    });
  });
}
