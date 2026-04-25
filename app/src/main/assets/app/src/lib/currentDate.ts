import { derived, writable } from 'svelte/store';
import { normalizeDate } from './date';

const STORAGE_KEY = 'fitness-debug-date-override';

const nowStore = writable<number>(Date.now());
const overrideStore = writable<string | null>(null);

let overrideOffsetMs = 0;

function computeNow(): number {
  return Date.now() + overrideOffsetMs;
}

function updateNow(): void {
  nowStore.set(computeNow());
}

function formatDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseOverrideInput(value: string): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.length === 10 ? `${trimmed}T00:00` : trimmed;
  const parsed = Date.parse(normalized);

  if (Number.isNaN(parsed)) {
    console.warn('Ignoring invalid override value:', value);
    return null;
  }

  return parsed;
}

function persistOverride(value: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (value === null) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const payload = JSON.stringify({
    input: value,
    offset: overrideOffsetMs
  });
  window.localStorage.setItem(STORAGE_KEY, payload);
}

overrideStore.subscribe((value) => {
  persistOverride(value);
  updateNow();
});

if (typeof window !== 'undefined') {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { input?: string; offset?: number } | string;
      if (typeof parsed === 'string') {
        // Legacy format: plain date string
        const legacyTimestamp = parseOverrideInput(parsed);
        if (legacyTimestamp !== null) {
          overrideOffsetMs = legacyTimestamp - Date.now();
          overrideStore.set(formatDateTimeLocal(legacyTimestamp));
        }
      } else {
        if (typeof parsed.offset === 'number' && Number.isFinite(parsed.offset)) {
          overrideOffsetMs = parsed.offset;
        }
        if (typeof parsed.input === 'string') {
          overrideStore.set(parsed.input);
        } else if (parsed.offset !== undefined) {
          overrideStore.set(formatDateTimeLocal(computeNow()));
        }
      }
    } catch (error) {
      console.warn('Failed to parse stored override, clearing it.', error);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  updateNow();

  const interval = window.setInterval(updateNow, 15_000);
  const handleFocus = () => updateNow();
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      updateNow();
    }
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibility);

  window.addEventListener('beforeunload', () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibility);
  });
} else {
  updateNow();
}

export const currentTimestamp = {
  subscribe: nowStore.subscribe
};

export const currentDate = derived(currentTimestamp, (value) =>
  normalizeDate(new Date(value))
);

export const dateOverride = {
  subscribe: overrideStore.subscribe
};

export function getNow(): number {
  return computeNow();
}

export function getToday(): string {
  return normalizeDate(new Date(getNow()));
}

export function setDateOverride(value: string): void {
  const targetTimestamp = parseOverrideInput(value);
  if (targetTimestamp === null) {
    return;
  }

  overrideOffsetMs = targetTimestamp - Date.now();
  const normalizedInput = formatDateTimeLocal(targetTimestamp);
  overrideStore.set(normalizedInput);
}

export function clearDateOverride(): void {
  overrideOffsetMs = 0;
  overrideStore.set(null);
}
