import type { CalendarEvent } from "./events-store";
import { eventDateKey, eventTimeZone, instantFromWallTime, wallTime } from "./event-time";

export function expandRecurringEvent(base: CalendarEvent, now = new Date()): CalendarEvent[] {
  if (!base.recurrence) return [base];
  const { frequency, interval, endDate, count } = base.recurrence;
  if (!Number.isSafeInteger(interval) || interval < 1) return [base];
  const timeZone = eventTimeZone(base);
  const occurrences: CalendarEvent[] = [];
  const windowStart = new Date(now);
  windowStart.setUTCDate(1);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - 1);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(now);
  windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 12);
  const duration = Date.parse(base.endDate) - Date.parse(base.startDate);
  const wall = wallTime(new Date(base.startDate), timeZone);
  const maxCount = count ?? 500;
  // Date-picker values, including old UTC-midnight values, include the entire last day.
  const endDay = endDate && /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(endDate)
    ? endDate.slice(0, 10) : undefined;
  for (let idx = 0; idx < maxCount; idx++) {
    const current = idx === 0 ? new Date(base.startDate) : instantFromWallTime(wall, timeZone);
    const key = eventDateKey(current, timeZone);
    if (endDay ? key > endDay : endDate && current > new Date(endDate)) break;
    if (current > windowEnd) break;
    const isExcluded = base.excludedDates?.some(d => eventDateKey(d, timeZone) === key);
    const isHiddenByDate = base.hiddenDates?.some(d => eventDateKey(d, timeZone) === key);
    const isHiddenFromDate = base.hiddenFromDate
      ? key >= eventDateKey(base.hiddenFromDate, timeZone) : false;
    if (current >= windowStart && !isExcluded) {
      occurrences.push({ ...base, timeZone,
        id: idx === 0 ? base.id : base.id + "_occ" + idx,
        startDate: current.toISOString(), endDate: new Date(current.getTime() + duration).toISOString(),
        recurringBaseId: base.id, hidden: !!(base.hidden || isHiddenByDate || isHiddenFromDate),
      });
    }
    // Advance the original wall-clock fields so a spring gap doesn't shift later occurrences.
    if (frequency === "monthly") wall.setUTCMonth(wall.getUTCMonth() + interval);
    else if (["daily", "weekly", "custom"].includes(frequency)) {
      wall.setUTCDate(wall.getUTCDate() + interval * (frequency === "weekly" ? 7 : 1));
    } else break;
  }
  return occurrences;
}
