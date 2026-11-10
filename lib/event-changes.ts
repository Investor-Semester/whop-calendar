import type { CalendarEvent, UpdateEventInput } from "./events-store";

// An expanded occurrence is not the stored series anchor. Do not overwrite that
// anchor (or recurrence metadata) when an admin only changes the link or title.
export function changedEventFields(event: CalendarEvent, form: UpdateEventInput): UpdateEventInput {
  const updates = Object.fromEntries(Object.entries(form).filter(([key, value]) => {
    if (value === undefined) return false;
    const previous = event[key as keyof UpdateEventInput];
    if (key === "startDate" || key === "endDate") {
      return Date.parse(value as string) !== Date.parse(previous as string);
    }
    return JSON.stringify(value) !== JSON.stringify(previous);
  })) as UpdateEventInput;
  // Date edits must carry the pair. Mixing a selected occurrence's new end with
  // the stored series' older start would create a multi-week event duration.
  if (updates.startDate !== undefined || updates.endDate !== undefined) {
    updates.startDate = form.startDate ?? event.startDate;
    updates.endDate = form.endDate ?? event.endDate;
  }
  return updates;
}
