import type { CalendarEvent, UpdateEventInput } from "./events-store";

// An expanded occurrence is not the stored series anchor. Do not overwrite that
// anchor (or recurrence metadata) when an admin only changes the link or title.
export function changedEventFields(event: CalendarEvent, form: UpdateEventInput): UpdateEventInput {
  return Object.fromEntries(Object.entries(form).filter(([key, value]) => {
    if (value === undefined) return false;
    const previous = event[key as keyof UpdateEventInput];
    if (key === "startDate" || key === "endDate") {
      return Date.parse(value as string) !== Date.parse(previous as string);
    }
    return JSON.stringify(value) !== JSON.stringify(previous);
  })) as UpdateEventInput;
}
