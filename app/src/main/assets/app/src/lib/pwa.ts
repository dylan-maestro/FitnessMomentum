export function registerPwaServiceWorker(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Android's shell loads from file://android_asset and cannot use service workers.
  if (window.location.protocol === 'file:') {
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
