"use client";

import { useState, useCallback } from "react";
import type { CalendarEvent } from "@/lib/events-store";
import Calendar from "@/components/Calendar";
import EventModal from "@/components/EventModal";
import CreateEventModal, { type CreateEventFormData } from "@/components/CreateEventModal";

interface CalendarViewProps {
  experienceId: string;
  userId: string;
  isAdmin: boolean;
  initialEvents: CalendarEvent[];
}

export default function CalendarView({
  experienceId,
  userId,
  isAdmin,
  initialEvents,
}: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [createDate, setCreateDate] = useState<Date | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ── Refresh events from API ───────────────────────────────────────────────
  const refreshEvents = useCallback(async () => {
    const res = await fetch(`/api/events?experienceId=${experienceId}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
    }
  }, [experienceId]);

  // ── RSVP ─────────────────────────────────────────────────────────────────
  async function handleRsvp(eventId: string) {
    const res = await fetch(`/api/events/${eventId}/rsvp`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "RSVP failed");

    // Update event in local state
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? data.event : e))
    );
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(data.event);
    }
  }

  // ── Delete event ──────────────────────────────────────────────────────────
  async function handleDelete(eventId: string) {
    const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed");
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  // ── Create event ──────────────────────────────────────────────────────────
  async function handleCreate(formData: CreateEventFormData) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, experienceId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create event");
    await refreshEvents(); // fetch expanded list so recurring occurrences appear
    setShowCreateModal(false);
    setCreateDate(undefined);
  }

  // ── Edit event ────────────────────────────────────────────────────────────
  async function handleEdit(formData: CreateEventFormData) {
    if (!editingEvent) return;
    const res = await fetch(`/api/events/${editingEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update event");
    await refreshEvents();
    setEditingEvent(null);
    setSelectedEvent(null);
  }

  const [copied, setCopied] = useState(false);
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://whop-calendar-mu.vercel.app";
  const appUrl = rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`;
  const feedUrl = `${appUrl}/api/calendar/${experienceId}/calendar.ics`;

  function handleCopy() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Events Calendar</h1>
            <p className="text-sm text-[#888] mt-0.5">
              {isAdmin ? "You're managing this calendar" : "Browse and RSVP to upcoming events"}
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              New Event
            </button>
          )}
        </div>

        {/* ── Upcoming Events Strip ── */}
        <UpcomingStrip events={events} onEventClick={setSelectedEvent} />

        {/* ── Calendar ── */}
        <Calendar
          events={events}
          onEventClick={setSelectedEvent}
          onDayClick={
            isAdmin
              ? (date) => {
                  setCreateDate(date);
                  setShowCreateModal(true);
                }
              : undefined
          }
          isAdmin={isAdmin}
        />
      </div>

      {/* ── Modals ── */}
      {selectedEvent && !editingEvent && (
        <EventModal
          event={selectedEvent}
          currentUserId={userId}
          isAdmin={isAdmin}
          onClose={() => setSelectedEvent(null)}
          onRsvp={handleRsvp}
          onDelete={isAdmin ? handleDelete : undefined}
          onEdit={
            isAdmin
              ? (event) => {
                  setEditingEvent(event);
                  setSelectedEvent(null);
                }
              : undefined
          }
        />
      )}

      {(showCreateModal || editingEvent) && (
        <CreateEventModal
          defaultDate={createDate}
          editEvent={editingEvent ?? undefined}
          onClose={() => {
            setShowCreateModal(false);
            setEditingEvent(null);
            setCreateDate(undefined);
          }}
          onSave={editingEvent ? handleEdit : handleCreate}
        />
      )}

      {/* ── Calendar Sync Footer ── */}
      <div className="border-t border-[#2a2a2a] mt-4 pt-8 pb-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl px-6 py-6">
            <p className="text-2xl font-bold text-rose-500 mb-1 text-center">Sync Your Calendar</p>
            <p className="text-sm text-[#888] mb-4 text-center">
              Copy this link, then paste it into the URL section of your calendar app to subscribe.
            </p>

            {/* URL display + copy */}
            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 mb-4 max-w-2xl mx-auto">
              <span className="text-xs text-[#888] truncate flex-1 font-mono select-all">{feedUrl}</span>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href="https://calendar.google.com/calendar/r/settings/addbyurl"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
                Sync Google Calendar
              </a>
              <a
                href={feedUrl.replace(/^https?:\/\//, "webcal://")}
                className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold bg-[#1e1e1e] border border-[#333] text-[#ccc] hover:text-white hover:border-[#555] hover:bg-[#252525] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
                Subscribe in Apple / iCal
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── This Week Strip ─────────────────────────────────────────────────────────

function UpcomingStrip({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const now = new Date();

  // End of week = coming Sunday at midnight
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(0, 0, 0, 0);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const todayEvents = events.filter((e) => {
    const s = new Date(e.startDate);
    return s >= todayStart && s <= todayEnd;
  });

  const weekEvents = events.filter((e) => {
    const s = new Date(e.startDate);
    return s > todayEnd && s < endOfWeek;
  });

  if (todayEvents.length === 0 && weekEvents.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">
        This Week
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
        {/* Today — vertical stack */}
        {todayEvents.length > 0 && (
          <div className="flex-shrink-0 flex gap-3">
            <div className="flex flex-col items-center">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">Today</span>
              <div className="w-px flex-1 bg-indigo-500/40 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              {todayEvents.map((event) => (
                <UpcomingCard key={event.id} event={event} onClick={() => onEventClick(event)} compact />
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {todayEvents.length > 0 && weekEvents.length > 0 && (
          <div className="flex-shrink-0 w-px bg-[#2a2a2a] self-stretch" />
        )}

        {/* Rest of week — horizontal cards */}
        {weekEvents.map((event) => (
          <div key={event.id} className="flex-shrink-0">
            <UpcomingCard event={event} onClick={() => onEventClick(event)} />
          </div>
        ))}
      </div>
    </div>
  );
}

const COLOR_BG: Record<CalendarEvent["color"], string> = {
  indigo: "bg-indigo-600",
  rose: "bg-rose-600",
  emerald: "bg-emerald-600",
  amber: "bg-amber-500",
  sky: "bg-sky-600",
  violet: "bg-violet-600",
};

const COLOR_BORDER: Record<CalendarEvent["color"], string> = {
  indigo: "border-indigo-500/40",
  rose: "border-rose-500/40",
  emerald: "border-emerald-500/40",
  amber: "border-amber-400/40",
  sky: "border-sky-500/40",
  violet: "border-violet-500/40",
};

function UpcomingCard({
  event,
  onClick,
  compact = false,
}: {
  event: CalendarEvent;
  onClick: () => void;
  compact?: boolean;
}) {
  const now = new Date();
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);

  const isLive = now >= start && now <= end;
  const isEnded = now > end;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`relative flex items-center gap-2.5 bg-[#1c1c1c] border ${COLOR_BORDER[event.color]} rounded-xl p-2.5 text-left hover:bg-[#222] transition-all w-56
          ${isEnded ? "opacity-40 scale-95 grayscale" : ""}`}
      >
        <div className="relative flex-shrink-0">
          {event.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.imageUrl} alt={event.title} className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className={`w-10 h-10 rounded-lg ${COLOR_BG[event.color]}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${isEnded ? "text-[#666]" : "text-white"}`}>{event.title}</p>
          <p className="text-xs text-[#888]">
            {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
          <p className="text-xs text-[#555]">
            {event.rsvps.length} going{event.maxAttendees !== null && ` / ${event.maxAttendees}`}
          </p>
        </div>
        {isLive && (
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse block" />
            <span className="text-red-500 text-[10px] font-bold uppercase tracking-widest leading-none">LIVE</span>
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-44 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl overflow-hidden text-left hover:border-[#444] hover:bg-[#222] transition-all
        ${isEnded ? "opacity-40 scale-95 grayscale" : ""}`}
    >
      {/* Photo or color bar */}
      <div className="relative">
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt={event.title} className="w-full h-24 object-cover" />
        ) : (
          <div className={`w-full h-24 ${COLOR_BG[event.color]}`} />
        )}
        {isLive && (
          <span className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
            LIVE
          </span>
        )}
      </div>
      <div className="p-3">
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mb-1.5 text-white ${COLOR_BG[event.color]}`}>
          {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </div>
        <p className={`text-sm font-semibold truncate ${isEnded ? "text-[#666]" : "text-white"}`}>{event.title}</p>
        <p className="text-xs text-[#888] mt-0.5">
          {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
        <p className="text-xs text-[#666] mt-1">
          {event.rsvps.length} going{event.maxAttendees !== null && ` / ${event.maxAttendees}`}
        </p>
      </div>
    </button>
  );
}
