/**
 * events-store.ts - Simple file-based event store.
 * In production, replace with a real database.
 */

import fs from "fs";
import path from "path";

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
}

// Use /tmp on Vercel (serverless has read-only fs), otherwise local data/ dir
const DATA_DIR = process.env.VERCEL
  ? "/tmp/whop-calendar-data"
  : path.join(process.cwd(), "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAllEvents(): CalendarEvent[] {
  ensureDataDir();
  if (!fs.existsSync(EVENTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8")) as CalendarEvent[]; }
  catch { return []; }
}

function persistEvents(events: CalendarEvent[]) {
  ensureDataDir();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), "utf-8");
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function expandRecurringEvent(base: CalendarEvent): CalendarEvent[] {
  if (!base.recurrence) return [base];
  const { frequency, interval, endDate, count } = base.recurrence;
  const occurrences: CalendarEvent[] = [];
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - 1);
  windowStart.setDate(1);
  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + 12);
  const eventDuration = new Date(base.endDate).getTime() - new Date(base.startDate).getTime();
  let current = new Date(base.startDate);
  let idx = 0;
  const maxCount = count ?? 500;
  while (idx < maxCount) {
    const occEnd = new Date(current.getTime() + eventDuration);
    if (endDate && current > new Date(endDate)) break;
    if (current > windowEnd) break;
    if (current >= windowStart) {
      occurrences.push({ ...base, id: idx === 0 ? base.id : `${base.id}_occ${idx}`,
        startDate: current.toISOString(), endDate: occEnd.toISOString(), recurringBaseId: base.id });
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

export function getEventsByExperience(experienceId: string): CalendarEvent[] {
  const base = readAllEvents().filter((e) => e.experienceId === experienceId);
  const expanded: CalendarEvent[] = [];
  for (const event of base) expanded.push(...expandRecurringEvent(event));
  return expanded.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export function getEventById(eventId: string): CalendarEvent | null {
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  return readAllEvents().find((e) => e.id === baseId) ?? null;
}

export function createEvent(input: CreateEventInput): CalendarEvent {
  const events = readAllEvents();
  const colors: EventColor[] = ["indigo", "rose", "emerald", "amber", "sky", "violet"];
  const newEvent: CalendarEvent = {
    id: generateId(), experienceId: input.experienceId, title: input.title,
    description: input.description, startDate: input.startDate, endDate: input.endDate,
    location: input.location, meetingType: input.meetingType, meetingLink: input.meetingLink,
    recurrence: input.recurrence, imageUrl: input.imageUrl,
    maxAttendees: input.maxAttendees ?? null, rsvps: [], createdBy: input.createdBy,
    createdAt: new Date().toISOString(), color: input.color ?? colors[events.length % colors.length],
  };
  events.push(newEvent);
  persistEvents(events);
  return newEvent;
}

export function updateEvent(eventId: string, updates: UpdateEventInput): CalendarEvent | null {
  const events = readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], ...updates };
  persistEvents(events);
  return events[idx];
}

export function deleteEvent(eventId: string): boolean {
  const events = readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const filtered = events.filter((e) => e.id !== baseId);
  if (filtered.length === events.length) return false;
  persistEvents(filtered);
  return true;
}

export function toggleRsvp(eventId: string, userId: string): { event: CalendarEvent; action: "added" | "removed" } {
  const events = readAllEvents();
  const baseId = eventId.includes("_occ") ? eventId.split("_occ")[0] : eventId;
  const idx = events.findIndex((e) => e.id === baseId);
  if (idx === -1) throw new Error("Event not found");
  const event = events[idx];
  const alreadyRsvpd = event.rsvps.includes(userId);
  if (alreadyRsvpd) {
    event.rsvps = event.rsvps.filter((id) => id !== userId);
    persistEvents(events);
    return { event, action: "removed" };
  } else {
    if (event.maxAttendees !== null && event.rsvps.length >= event.maxAttendees) throw new Error("This event is full");
    event.rsvps.push(userId);
    persistEvents(events);
    return { event, action: "added" };
  }
}
