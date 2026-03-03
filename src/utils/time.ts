import { DateTime } from "luxon";

export const SYDNEY_TIMEZONE = "Australia/Sydney";

export function isSydneyMidnight(nowUtc = DateTime.utc()): boolean {
  const local = nowUtc.setZone(SYDNEY_TIMEZONE);
  return local.hour === 0;
}

export function getSydneyDateLabel(nowUtc = DateTime.utc()): string {
  return nowUtc.setZone(SYDNEY_TIMEZONE).toFormat("yyyy-LL-dd");
}

export function getRunWindowStart(lastSuccessfulRunIso: string | null, nowUtc = DateTime.utc()): string {
  if (lastSuccessfulRunIso) {
    return lastSuccessfulRunIso;
  }
  return nowUtc.minus({ hours: 24 }).toUTC().toISO() ?? new Date().toISOString();
}
