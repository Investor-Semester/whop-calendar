import { isValidTimeZone } from "./event-time";
import type { UpdateEventInput } from "./events-store";

export class InvalidEventPatch extends Error {}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function date(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

const fields = new Set([
  "title", "description", "startDate", "endDate", "timeZone", "location", "meetingType",
  "meetingLink", "recurrence", "imageUrl", "maxAttendees", "color", "hidden",
]);

export function validateEventUpdates(value: unknown): UpdateEventInput {
  if (!object(value)) throw new InvalidEventPatch("Event updates must be an object");
  const updates: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!fields.has(key)) throw new InvalidEventPatch(`Field cannot be updated: ${key}`);
    if (field === undefined) continue;
    if (["title", "description", "location", "meetingLink", "imageUrl"].includes(key)) {
      if (typeof field !== "string" || (key === "title" && !field.trim())) {
        throw new InvalidEventPatch(`Invalid ${key}`);
      }
      if ((key === "meetingLink" || key === "imageUrl") && field) {
        try {
          if (!["https:", "http:"].includes(new URL(field).protocol)) throw new Error();
        } catch { throw new InvalidEventPatch(`Invalid ${key}`); }
      }
    } else if (key === "startDate" || key === "endDate") {
      if (!date(field)) throw new InvalidEventPatch(`Invalid ${key}`);
    } else if (key === "timeZone") {
      if (!isValidTimeZone(field)) throw new InvalidEventPatch("Invalid timeZone");
    } else if (key === "meetingType") {
      if (typeof field !== "string" || !["zoom", "google-meet", "other"].includes(field)) throw new InvalidEventPatch("Invalid meetingType");
    } else if (key === "color") {
      if (typeof field !== "string" || !["indigo", "rose", "emerald", "amber", "sky", "violet"].includes(field)) throw new InvalidEventPatch("Invalid color");
    } else if (key === "hidden") {
      if (typeof field !== "boolean") throw new InvalidEventPatch("Invalid hidden");
    } else if (key === "maxAttendees") {
      if (field !== null && (typeof field !== "number" || !Number.isSafeInteger(field) || field < 1)) throw new InvalidEventPatch("Invalid maxAttendees");
    } else if (key === "recurrence") {
      if (!object(field) || Object.keys(field).some(k => !["frequency", "interval", "endDate", "count"].includes(k)) ||
          typeof field.frequency !== "string" || !["daily", "weekly", "monthly", "custom"].includes(field.frequency) ||
          typeof field.interval !== "number" || !Number.isSafeInteger(field.interval) || field.interval < 1 ||
          (field.endDate !== undefined && !date(field.endDate)) ||
          (field.count !== undefined && (typeof field.count !== "number" || !Number.isSafeInteger(field.count) || field.count < 1))) {
        throw new InvalidEventPatch("Invalid recurrence");
      }
    }
    updates[key] = field;
  }
  return updates as UpdateEventInput;
}

export function parseEventPatch(body: unknown) {
  if (!object(body)) throw new InvalidEventPatch("Request body must be an object");
  const { action, mode = "all", occurrenceDate, ...fields } = body;
  if (action !== undefined && action !== "hide" && action !== "unhide") throw new InvalidEventPatch("Invalid action");
  if (mode !== "all" && mode !== "single" && mode !== "future") throw new InvalidEventPatch("Invalid mode");
  if (occurrenceDate !== undefined && !date(occurrenceDate)) throw new InvalidEventPatch("Invalid occurrenceDate");
  if (mode !== "all" && !date(occurrenceDate)) throw new InvalidEventPatch("occurrenceDate is required");
  const updates = validateEventUpdates(fields);
  if (action && Object.keys(updates).length) throw new InvalidEventPatch("Visibility actions cannot include field updates");
  return { action, mode, occurrenceDate: occurrenceDate as string | undefined, updates };
}
