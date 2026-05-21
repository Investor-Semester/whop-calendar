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
    setEvents((prev) => [...prev, data.event]);
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
    setEvents((prev) =>
      prev.map((e) => (e.id === editingEvent.id ? data.event : e))
    );
    setEditingEvent(null);
    setSelectedEvent(null);
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
    </div>
  );
}

// ─── Upcoming Events Strip ────────────────────────────────────────────────────

function UpcomingStrip({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const now = new Date();
  const upcoming = events
    .filter((e) => new Date(e.startDate) >= now)
    .slice(0, 4);

  if (upcoming.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs font-medium text-[#888] uppercase tracking-wide mb-3">
        Coming Up
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {upcoming.map((event) => (
          <UpcomingCard
            key={event.id}
            event={event}
            onClick={() => onEventClick(event)}
          />
        ))}
      </div>
    </div>
  );
}

function UpcomingCard({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const start = new Date(event.startDate);
  const COLOR_BG: Record<CalendarEvent["color"], string> = {
    indigo: "bg-indigo-600",
    rose: "bg-rose-600",
    emerald: "bg-emerald-600",
    amber: "bg-amber-500",
    sky: "bg-sky-600",
    violet: "bg-violet-600",
  };

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-44 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-3 text-left hover:border-[#444] hover:bg-[#222] transition-colors"
    >
      <div
        className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mb-2 text-white ${COLOR_BG[event.color]}`}
      >
        {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </div>
      <p className="text-sm font-semibold text-white truncate">{event.title}</p>
      <p className="text-xs text-[#888] mt-0.5">
        {start.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
      <p className="text-xs text-[#666] mt-1">
        {event.rsvps.length} going
        {event.maxAttendees !== null && ` / ${event.maxAttendees}`}
      </p>
    </button>
  );
}
