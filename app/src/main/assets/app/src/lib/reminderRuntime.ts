import { get } from 'svelte/store';
import { currentDate, getNow } from './currentDate';
import { settings, workouts } from './stores';
import { buildReminderSnapshot, getNotificationBody, getNotificationTitle, type ReminderGroup, type ReminderSnapshot } from './reminders';

const DB_NAME = 'fitness-momentum-reminders';
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';
const PERIODIC_SYNC_TAG = 'fitmo-reminder-check';
const PERIODIC_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const FOREGROUND_LAST_FIRED_PREFIX = 'fitness-reminder-fired';

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
    unregister: (tag: string) => Promise<void>;
  };
};

type PermissionDescriptorWithPeriodicSync = PermissionDescriptor & {
  name: PermissionName | 'periodic-background-sync';
};

let initialized = false;
let foregroundTimers: number[] = [];

function openReminderDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeReminderSnapshot(snapshot: ReminderSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const db = await openReminderDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function isStandalonePwa(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isAndroidWebViewShell(): boolean {
  return window.location.hostname === 'appassets.androidplatform.net';
}

function canUseBrowserNotifications(): boolean {
  return typeof Notification !== 'undefined';
}

async function getPeriodicBackgroundSyncPermission(): Promise<PermissionState | 'unsupported'> {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync'
    } as PermissionDescriptorWithPeriodicSync);
    return status.state;
  } catch {
    return 'unsupported';
  }
}

export async function getReminderPlatformStatus(): Promise<{
  isAndroidNative: boolean;
  isStandalone: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  periodicSync: PermissionState | 'unsupported';
  supportsPeriodicSync: boolean;
  supportsForegroundNotifications: boolean;
  message: string;
}> {
  const isAndroidNative = isAndroidWebViewShell() && typeof window.Android?.syncReminderSnapshot === 'function';
  const isStandalone = isStandalonePwa();
  const notificationPermission = canUseBrowserNotifications() ? Notification.permission : 'unsupported';
  const registration = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.ready.catch(() => null)
    : null;
  const supportsPeriodicSync = Boolean(
    !isAndroidNative &&
    isStandalone &&
    registration &&
    'periodicSync' in registration
  );
  const periodicSync = supportsPeriodicSync
    ? await getPeriodicBackgroundSyncPermission()
    : 'unsupported';

  let message = 'Foreground reminders are available while FitMo is open.';
  if (isAndroidNative) {
    message = 'Android app reminders are scheduled by the native app, even when FitMo is closed.';
  } else if (supportsPeriodicSync && periodicSync === 'granted') {
    message = 'This installed PWA can use approximate background checks. Exact timing still depends on the browser.';
  } else if (supportsPeriodicSync) {
    message = 'This installed PWA may support approximate background checks after browser permission is granted.';
  } else if (isStandalone) {
    message = 'This browser does not support Periodic Background Sync, so reminders work while FitMo is open until Web Push is added.';
  }

  return {
    isAndroidNative,
    isStandalone,
    notificationPermission,
    periodicSync,
    supportsPeriodicSync,
    supportsForegroundNotifications: canUseBrowserNotifications(),
    message
  };
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUseBrowserNotifications()) {
    return 'unsupported';
  }

  if (Notification.permission !== 'default') {
    return Notification.permission;
  }

  return Notification.requestPermission();
}

export async function requestAndroidNotificationPermission(): Promise<void> {
  window.Android?.requestNotificationPermission?.();
}

async function registerPeriodicReminderSync(): Promise<void> {
  if (
    isAndroidWebViewShell() ||
    !isStandalonePwa() ||
    !canUseBrowserNotifications() ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.ready as PeriodicSyncRegistration;
  if (!registration.periodicSync) {
    return;
  }

  const permission = await getPeriodicBackgroundSyncPermission();
  if (permission !== 'granted' || Notification.permission !== 'granted') {
    return;
  }

  await registration.periodicSync.register(PERIODIC_SYNC_TAG, {
    minInterval: PERIODIC_SYNC_INTERVAL_MS
  });
}

function getLastFiredKey(today: string, time: string): string {
  return `${FOREGROUND_LAST_FIRED_PREFIX}:${today}:${time}`;
}

function markForegroundNotificationFired(today: string, time: string): void {
  localStorage.setItem(getLastFiredKey(today, time), '1');
}

function hasForegroundNotificationFired(today: string, time: string): boolean {
  return localStorage.getItem(getLastFiredKey(today, time)) === '1';
}

function showForegroundNotification(group: ReminderGroup, today: string): void {
  if (!canUseBrowserNotifications() || Notification.permission !== 'granted') {
    return;
  }

  if (hasForegroundNotificationFired(today, group.time)) {
    return;
  }

  markForegroundNotificationFired(today, group.time);
  new Notification(getNotificationTitle(group), {
    body: getNotificationBody(group),
    tag: `fitmo-reminder-${today}-${group.time}`
  });
}

function scheduleForegroundReminders(snapshot: ReminderSnapshot, today: string): void {
  for (const timer of foregroundTimers) {
    window.clearTimeout(timer);
  }
  foregroundTimers = [];

  if (!snapshot.enabled || !canUseBrowserNotifications()) {
    return;
  }

  const now = new Date(getNow());
  for (const group of snapshot.groups) {
    const [hours, minutes] = group.time.split(':').map(Number);
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    const delay = target.getTime() - now.getTime();
    if (delay < 0 || delay > 24 * 60 * 60 * 1000) {
      continue;
    }

    const timer = window.setTimeout(() => {
      showForegroundNotification(group, today);
    }, delay);
    foregroundTimers.push(timer);
  }
}

async function syncReminderRuntime(): Promise<void> {
  const today = get(currentDate);
  const snapshot = buildReminderSnapshot(get(workouts), get(settings), today, new Date(getNow()));
  await writeReminderSnapshot(snapshot).catch((error: unknown) => {
    console.warn('Failed to write reminder snapshot:', error);
  });

  window.Android?.syncReminderSnapshot?.(JSON.stringify(snapshot));
  await registerPeriodicReminderSync().catch((error: unknown) => {
    console.warn('Failed to register periodic reminder sync:', error);
  });
  scheduleForegroundReminders(snapshot, today);
}

export function initReminderRuntime(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }
  initialized = true;

  const sync = () => {
    void syncReminderRuntime();
  };

  workouts.subscribe(sync);
  settings.subscribe(sync);
  currentDate.subscribe(sync);

  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sync();
    }
  });
}
