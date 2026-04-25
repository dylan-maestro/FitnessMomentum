export function normalizeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Use local time, but ensure we aren't getting weird edge cases with invalid dates
  if (Number.isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameDay(date1: string | null, date2: string): boolean {
  if (!date1) return false;
  return normalizeDate(date1) === normalizeDate(date2);
}

export function daysBetween(date1: string | null, date2: string): number {
  if (!date1) return 0;
  const d1 = new Date(normalizeDate(date1));
  const d2 = new Date(normalizeDate(date2));
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function isNextDay(date1: string | null, date2: string): boolean {
  if (!date1) return false;
  const days = daysBetween(date1, date2);
  return days === 1;
}

