const APP_CACHE = 'fitness-momentum-app-v1';
const STATIC_CACHE = 'fitness-momentum-static-v1';
const REMINDER_DB = 'fitness-momentum-reminders';
const REMINDER_STORE = 'snapshots';
const REMINDER_SNAPSHOT_KEY = 'current';
const REMINDER_LAST_CHECK_KEY = 'last-pwa-check-at';
const REMINDER_PERIODIC_SYNC_TAG = 'fitmo-reminder-check';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/icons/') ||
    /\.(?:css|js|png|svg|jpg|jpeg|ico|webmanifest|woff2?)$/i.test(pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          return caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

function openReminderDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REMINDER_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REMINDER_STORE)) {
        db.createObjectStore(REMINDER_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readReminderValue(key) {
  const db = await openReminderDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(REMINDER_STORE, 'readonly');
    const request = transaction.objectStore(REMINDER_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeReminderValue(key, value) {
  const db = await openReminderDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(REMINDER_STORE, 'readwrite');
    transaction.objectStore(REMINDER_STORE).put(value, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function getDatePart(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getReminderDate(time, date) {
  const [hours, minutes] = time.split(':').map(Number);
  const target = new Date(date);
  target.setHours(hours || 0, minutes || 0, 0, 0);
  return target;
}

function isTimeInWindow(time, start, end) {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const final = new Date(end);
  final.setHours(0, 0, 0, 0);

  while (cursor <= final) {
    const reminderDate = getReminderDate(time, cursor);
    if (reminderDate > start && reminderDate <= end) {
      return true;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return false;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.abs(Math.round((end.getTime() - start.getTime()) / 86400000));
}

function isSuppressedByFrequency(item, today) {
  if (!item.lastLoggedAt) {
    return false;
  }

  const lastDate = String(item.lastLoggedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    return false;
  }

  const days = daysBetween(lastDate, today);
  const targetFrequency = Math.max(1, Number(item.targetFrequency) || 1);
  return days !== null && days > 0 && days < targetFrequency;
}

function getEligibleReminderItems(group, now) {
  const today = getDatePart(now);
  return (group.items || []).filter((item) =>
    item &&
    !item.goalMet &&
    !isSuppressedByFrequency(item, today) &&
    typeof item.line === 'string' &&
    item.line.length > 0
  );
}

async function runPeriodicReminderCheck() {
  const snapshot = await readReminderValue(REMINDER_SNAPSHOT_KEY);
  if (!snapshot || !snapshot.enabled || !Array.isArray(snapshot.groups)) {
    await writeReminderValue(REMINDER_LAST_CHECK_KEY, new Date().toISOString());
    return;
  }

  const now = new Date();
  const lastCheckValue = await readReminderValue(REMINDER_LAST_CHECK_KEY);
  const fallbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastCheck = lastCheckValue ? new Date(lastCheckValue) : fallbackStart;
  const start = Number.isNaN(lastCheck.getTime()) ? fallbackStart : lastCheck;

  for (const group of snapshot.groups) {
    if (!group || typeof group.time !== 'string' || !isTimeInWindow(group.time, start, now)) {
      continue;
    }

    const items = getEligibleReminderItems(group, now);
    if (items.length === 0) {
      continue;
    }

    await self.registration.showNotification(
      items.length === 1 ? 'Exercise reminder' : `${items.length} exercises to go`,
      {
        body: items.map((item) => item.line).join('\n'),
        tag: `fitmo-reminder-${getDatePart(now)}-${group.time}`,
        renotify: false,
        data: { url: '/' }
      }
    );
  }

  await writeReminderValue(REMINDER_LAST_CHECK_KEY, now.toISOString());
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== REMINDER_PERIODIC_SYNC_TAG) {
    return;
  }

  event.waitUntil(runPeriodicReminderCheck());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
