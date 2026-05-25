/**
 * events-store.ts - Upstash Redis-backed event store.
 */

import { Redis } from "@upstash/redis";

// Types

export type MeetingType = "zoom" | "google-meet" | "other";

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "custom";
  interval: number;
  endDate?: string;
  count?: number;
}

export interface CalendarEvent {
  id: string;
  experienceId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location?: string;
  meetingType?: MeetingType;
  meetingLink?: string;
  recurrence?: RecurrenceRule;
  imageUrl?: string;
  maxAttendees: number | null;
  rsvps: string[];
  createdBy: string;
  createdAt: string;
  color: EventColor;
  recurringBaseId?: string;
  excludedDates?: string[];  // ISO dates of individually deleted occurrences
  // Visibility controls (admin-only feature)
  hidden?: boolean;          // true = entire event/series hidden from users
  hiddenDates?: string[];    // ISO dates of individually hidden occurrences
  hiddenFromDate?: string;   // hide all occurrences on or after this ISO date
}

export type EventColor = "indigo" | "rose" | "emerald" | "amber" | "sky" | "violet";

export interface CreateEventInput {
  experienceId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location?: string;
  meetingType?: MeetingType;
  meetingLink?: string;
  recurrence?: RecurrenceRule;
  imageUrl?: string;
  maxAttendees?: number | null;
  createdBy: string;
  color?: EventColor;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  meetingType?: MeetingType;
  meetingLink?: string;
  recurrence?: RecurrenceRule;
  imageUrl?: string;
  maxAttendees?: number | null;
  color?: EventColor;
  hidden?: boolean;
}

// Redis client

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const EVENTS_KEY = "whop:events";

async function readAllEvents(): Promise<CalendarEvent[]> {
  try {
    const data = await redis.get<CalendarEvent[]>(EVENTS_KEY);
    return data ?? [];
  } catch {
    return [];
  }
}

async function persistEvents(events: CalendarEvent[]): Promise<void> {
  await redis.set(EVENTS_KEY, events);
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Recurrence expansion

function expandRecurringEvent(base: CalendarEvent): CalendarEvent[] {
  if (!base.recurrence) return [base];

  const { frequency, interval, endDate, count } = base.recurrence;
  const occurrences: CalendarEvent[] = [];

  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - 1);
  windowStart.setDate(1);

  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + 12);

  const eventDuration =
    new Date(base.endDate).getTime() - new Date(base.startDate).getTime();

  let current = new Date(base.startDate);
  let idx = 0;
  const maxCount = count ?? 500;

  while (idx < maxCount) {
    const occEnd = new Date(current.getTime() + eventDuration);

    if (endDate && current > new Date(endDate)) break;
    if (current > windowEnd) break;

    const occStart = current.toISOString();
    const isExcluded = base.excludedDates?.some(
      (d) => new Date(d).toDateString() === current.toDateString()
    );

    // Determine per-occurrence hidden state
    const isHiddenByDate = base.hiddenDates?.some(
      (d) => new Date(d).toDateString() === current.toDateString()
    );
    const isHiddenFromDate = base.hiddenFromDate
      ? current >= new Date(base.hiddenFromDate)
      : false;
    const occHidden = base.hidden || isHiddenByDate || isHiddenFromDate;

    if (current >= windowStart && !isExcluded) {
      occurrences.push({
        ...base,
        id: idx === 0 ? base.id : `${base.id}_occ${idx}`,
        startDate: occStart,
        endDate: occEnd.toISOString(),
        recurringBaseId: base.id,
        hidden: occHidden,
      });
    }

    const next = new Date(current);
    switch (frequency) {
      case "daily":   next.setDate(next.getDate() + interval); break;
      case "weekly":  next.setDate(next.getDate() + 7 * interval); break;
      case "monthly": next.setMonth(next.getMonth() + interval); break;
      case "custom":  next.setDate(next.getDate() + interval); break;
    }

    if (next <= current) break;
    current = next;
    idx++;
  }

  return occurrences;
}

// Public API (all async)

export async function getEventsByExperience(
  experienceId: string,
  includeHidden = false
): Promise<CalendarEvent[]> {
  const base = (await readAllEvents()).filter((e) => e.experienceId === experienceId);
  const expanded: CalendarEvent[] = [];
  for (const event of base) expanded.push(...expandRecurringEvent(event));
  const visible = includeHidden ? expanded : expanded.filter((e) => !e.hidden);
  return visible.sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
}

export async function getEventById(eventId: string): Promise<CalendarEvent | null> {
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const events = await readAllEvents();
  return events.find((e) => e.id === baseId) ?? null;
}

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const events = await readAllEvents();
  const colors: EventColor[] = ["indigo", "rose", "emerald", "amber", "sky", "violet"];
  const newEvent: CalendarEvent = {
    id: generateId(),
    experienceId: input.experienceId,
    title: input.title,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    location: input.location,
    meetingType: input.meetingType,
    meetingLink: input.meetingLink,
    recurrence: input.recurrence,
    imageUrl: input.imageUrl,
    maxAttendees: input.maxAttendees ?? null,
    rsvps: [],
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    color: input.color ?? colors[events.length % colors.length],
  };
  events.push(newEvent);
  await persistEvents(events);
  return newEvent;
}

export async function updateEvent(eventId: string, updates: UpdateEventInput): Promise<CalendarEvent | null> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], ...updates };
  await persistEvents(events);
  return events[idx];
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const filtered = events.filter((e) => e.id !== baseId);
  if (filtered.length === events.length) return false;
  await persistEvents(filtered);
  return true;
}

// Edit a single occurrence: exclude the date from the series, create a standalone event
export async function updateEventOccurrence(
  eventId: string,
  occurrenceDate: string,
  updates: UpdateEventInput
): Promise<CalendarEvent | null> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  const base = events[idx];

  // Exclude this date from the recurring series
  const excluded = base.excludedDates ?? [];
  excluded.push(occurrenceDate);
  events[idx] = { ...base, excludedDates: excluded };

  // Create a standalone event for just this occurrence
  const duration = new Date(base.endDate).getTime() - new Date(base.startDate).getTime();
  const newStart = updates.startDate ?? occurrenceDate;
  const newEnd = updates.endDate ?? new Date(new Date(newStart).getTime() + duration).toISOString();

  const newEvent: CalendarEvent = {
    id: generateId(),
    experienceId: base.experienceId,
    title: updates.title ?? base.title,
    description: updates.description ?? base.description,
    startDate: newStart,
    endDate: newEnd,
    location: updates.location ?? base.location,
    meetingType: updates.meetingType ?? base.meetingType,
    meetingLink: updates.meetingLink ?? base.meetingLink,
    imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : base.imageUrl,
    maxAttendees: updates.maxAttendees !== undefined ? updates.maxAttendees : base.maxAttendees,
    rsvps: [],
    createdBy: base.createdBy,
    createdAt: new Date().toISOString(),
    color: updates.color ?? base.color,
  };

  events.push(newEvent);
  await persistEvents(events);
  return newEvent;
}

// Edit this and future occurrences: truncate the series, create a new series from fromDate
export async function updateEventFuture(
  eventId: string,
  fromDate: string,
  updates: UpdateEventInput
): Promise<CalendarEvent | null> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  const base = events[idx];

  // If editing from the very first occurrence, just update the whole event
  if (new Date(fromDate).toDateString() === new Date(base.startDate).toDateString()) {
    events[idx] = { ...base, ...updates };
    await persistEvents(events);
    return events[idx];
  }

  // Truncate the original series one day before fromDate
  const cutoff = new Date(fromDate);
  cutoff.setDate(cutoff.getDate() - 1);
  events[idx] = {
    ...base,
    recurrence: base.recurrence
      ? { ...base.recurrence, endDate: cutoff.toISOString() }
      : base.recurrence,
  };

  // Create a new event (with recurrence) starting from fromDate
  const duration = new Date(base.endDate).getTime() - new Date(base.startDate).getTime();
  const newStart = updates.startDate ?? fromDate;
  const newEnd = updates.endDate ?? new Date(new Date(newStart).getTime() + duration).toISOString();

  const newEvent: CalendarEvent = {
    id: generateId(),
    experienceId: base.experienceId,
    title: updates.title ?? base.title,
    description: updates.description ?? base.description,
    startDate: newStart,
    endDate: newEnd,
    location: updates.location ?? base.location,
    meetingType: updates.meetingType ?? base.meetingType,
    meetingLink: updates.meetingLink ?? base.meetingLink,
    recurrence: updates.recurrence ?? base.recurrence,
    imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : base.imageUrl,
    maxAttendees: updates.maxAttendees !== undefined ? updates.maxAttendees : base.maxAttendees,
    rsvps: [],
    createdBy: base.createdBy,
    createdAt: new Date().toISOString(),
    color: updates.color ?? base.color,
  };

  events.push(newEvent);
  await persistEvents(events);
  return newEvent;
}

// Delete a single occurrence by excluding its date
export async function deleteEventOccurrence(eventId: string, occurrenceDate: string): Promise<boolean> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return false;
  const excluded = events[idx].excludedDates ?? [];
  excluded.push(occurrenceDate);
  events[idx] = { ...events[idx], excludedDates: excluded };
  await persistEvents(events);
  return true;
}

// Delete this occurrence and all future ones by truncating the recurrence end date
export async function deleteEventFuture(eventId: string, fromDate: string): Promise<boolean> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return false;
  const base = events[idx];

  // If this is the very first occurrence, delete the whole event
  if (new Date(fromDate).toDateString() === new Date(base.startDate).toDateString()) {
    const filtered = events.filter((e) => e.id !== baseId);
    await persistEvents(filtered);
    return true;
  }

  // Otherwise set recurrence end to the day before fromDate
  const cutoff = new Date(fromDate);
  cutoff.setDate(cutoff.getDate() - 1);
  events[idx] = {
    ...base,
    recurrence: base.recurrence
      ? { ...base.recurrence, endDate: cutoff.toISOString() }
      : base.recurrence,
  };
  await persistEvents(events);
  return true;
}

// ── Hide / Unhide ─────────────────────────────────────────────────────────────

// Hide a single occurrence by adding its date to hiddenDates
export async function hideEventOccurrence(eventId: string, occurrenceDate: string): Promise<CalendarEvent | null> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  const hiddenDates = events[idx].hiddenDates ?? [];
  if (!hiddenDates.some((d) => new Date(d).toDateString() === new Date(occurrenceDate).toDateString())) {
    hiddenDates.push(occurrenceDate);
  }
  events[idx] = { ...events[idx], hiddenDates };
  await persistEvents(events);
  return events[idx];
}

// Hide this occurrence and all future ones
export async function hideEventFuture(eventId: string, fromDate: string): Promise<CalendarEvent | null> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], hiddenFromDate: fromDate };
  await persistEvents(events);
  return events[idx];
}

// Remove all hidden flags from an event/series, making it visible again
export async function unhideEvent(eventId: string): Promise<CalendarEvent | null> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  events[idx] = {
    ...events[idx],
    hidden: false,
    hiddenDates: [],
    hiddenFromDate: undefined,
  };
  await persistEvents(events);
  return events[idx];
}

export async function toggleRsvp(
  eventId: string,
  userId: string
): Promise<{ event: CalendarEvent; action: "added" | "removed" }> {
  const events = await readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) throw new Error("Event not found");

  const event = events[idx];
  const alreadyRsvpd = event.rsvps.includes(userId);

  if (alreadyRsvpd) {
    event.rsvps = event.rsvps.filter((id) => id !== userId);
    await persistEvents(events);
    return { event, action: "removed" };
  } else {
    if (event.maxAttendees !== null && event.rsvps.length >= event.maxAttendees) {
      throw new Error("This event is full");
    }
    event.rsvps.push(userId);
    await persistEvents(events);
    return { event, action: "added" };
  }
}
