/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

interface Window {
  Android?: {
    saveBackup?: (data: string, filename: string) => void;
    importBackup?: () => void;
    setLightStatusBar?: (enabled: boolean) => void;
    getNotificationPermissionState?: () => string;
    requestNotificationPermission?: () => void;
    syncReminderSnapshot?: (snapshotJson: string) => void;
  };
  __onAndroidNotificationPermissionResult?: (state: string) => void;
}

