/** Recurrence uses an IANA zone, never the server's zone or a fixed UTC offset. */
export const LEGACY_EVENT_TIME_ZONE = "America/Denver";

const formatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}

export function eventTimeZone(event: { timeZone?: string }): string {
  return isValidTimeZone(event.timeZone) ? event.timeZone : LEGACY_EVENT_TIME_ZONE;
}

// A Date used only as a UTC-field carrier for a wall-clock date and time.
export function wallTime(instant: Date, timeZone: string): Date {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second), instant.getUTCMilliseconds()));
}

/** Compatible DST disambiguation: earlier instant in a fold, forward by the gap. */
export function instantFromWallTime(wall: Date, timeZone: string): Date {
  const target = wall.getTime();
  const offsets = new Set<number>();
  for (const hours of [-48, -24, 0, 24, 48]) {
    const sample = new Date(target + hours * 3600000);
    offsets.add(wallTime(sample, timeZone).getTime() - sample.getTime());
  }
  const candidates = [...offsets].map(offset => new Date(target - offset));
  const exact = candidates.filter(d => wallTime(d, timeZone).getTime() === target);
  if (exact.length) return new Date(Math.min(...exact.map(d => d.getTime())));
  const later = candidates.filter(d => wallTime(d, timeZone).getTime() > target)
    .sort((a, b) => wallTime(a, timeZone).getTime() - wallTime(b, timeZone).getTime());
  if (!later.length) throw new Error("Cannot resolve event time in " + timeZone);
  return later[0];
}

export function eventDateKey(instant: string | Date, timeZone: string): string {
  return wallTime(new Date(instant), timeZone).toISOString().slice(0, 10);
}

export function dateTimeInputValue(instant: Date, timeZone: string): string {
  return wallTime(instant, timeZone).toISOString().slice(0, 16);
}

export function dateTimeInputToInstant(value: string, timeZone: string, original?: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Invalid event date");
  const wall = new Date(value + ":00.000Z");
  if (!Number.isFinite(wall.getTime())) throw new Error("Invalid event date");
  // Keep the exact original instant on an unchanged edit, including the later side of a fold.
  if (original && dateTimeInputValue(new Date(original), timeZone) === value) return new Date(original);
  const instant = instantFromWallTime(wall, timeZone);
  if (dateTimeInputValue(instant, timeZone) !== value) {
    throw new Error("That local time does not exist because the clocks change. Choose another time.");
  }
  return instant;
}
