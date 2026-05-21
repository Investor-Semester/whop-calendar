"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/lib/events-store";
import CreateEventModal from "@/components/CreateEventModal";
import { colorClasses } from "@/components/Calendar";

interface DashboardViewProps {
  companyId: string;
  userId: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DashboardView({ companyId, userId }: DashboardViewProps) {
  const [experienceId, setExperienceId] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");

  async function loadEvents() {
    if (!experienceId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events?experienceId=${experienceId.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load events");
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(formData: {
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    location?: string;
    maxAttendees?: number | null;
    color: CalendarEvent["color"];
  }) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, experienceId: experienceId.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create event");
    setEvents((prev) => [...prev, data.event]);
    setShowCreateModal(false);
  }

  async function handleEdit(formData: {
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    location?: string;
    maxAttendees?: number | null;
    color: CalendarEvent["color"];
  }) {
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
  }

  async function handleDelete(eventId: string) {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete event");
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  const now = new Date();
  const filteredEvents = events.filter((e) => {
    const start = new Date(e.startDate);
    if (filter === "upcoming") return start >= now;
    if (filter === "past") return start < now;
    return true;
  });

  // Stats
  const totalRsvps = events.reduce((sum, e) => sum + e.rsvps.length, 0);
  const upcomingCount = events.filter((e) => new Date(e.startDate) >= now).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ── Header ── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Calendar Dashboard</h1>
          <p className="text-sm text-[#888] mt-1">
            Manage events for your community experiences
          </p>
        </div>

        {/* ── Experience ID Input ── */}
        <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
          <label className="block text-xs font-medium text-[#888] uppercase tracking-wide mb-2">
            Experience ID
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={experienceId}
              onChange={(e) => setExperienceId(e.target.value)}
              placeholder="exp_xxxxxxxxxxxxxxxx"
              className="flex-1 bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              onKeyDown={(e) => e.key === "Enter" && loadEvents()}
            />
            <button
              onClick={loadEvents}
              disabled={loading || !experienceId.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Load"}
            </button>
          </div>
          <p className="text-xs text-[#666] mt-2">
            Find the Experience ID in your Whop dashboard under the experience settings.
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {events.length > 0 && (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="Total Events" value={events.length} />
              <StatCard label="Upcoming" value={upcomingCount} accent />
              <StatCard label="Total RSVPs" value={totalRsvps} />
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-[#1c1c1c] rounded-lg p-1 border border-[#2a2a2a]">
                {(["upcoming", "all", "past"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                      filter === f
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#888] hover:text-white"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                + New Event
              </button>
            </div>

            {/* ── Event List ── */}
            <div className="space-y-3">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-[#888]">
                  No {filter !== "all" ? filter : ""} events found.
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEdit={() => setEditingEvent(event)}
                    onDelete={() => handleDelete(event.id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {!loading && events.length === 0 && experienceId && !error && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-white font-semibold mb-1">No events yet</p>
            <p className="text-[#888] text-sm mb-4">
              Create your first event to get started
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Create First Event
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {(showCreateModal || editingEvent) && (
        <CreateEventModal
          editEvent={editingEvent ?? undefined}
          onClose={() => {
            setShowCreateModal(false);
            setEditingEvent(null);
          }}
          onSave={editingEvent ? handleEdit : handleCreate}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4">
      <p className="text-xs text-[#888] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-indigo-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function EventRow({
  event,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = colorClasses(event.color);
  const now = new Date();
  const isPast = new Date(event.startDate) < now;
  const isFull =
    event.maxAttendees !== null && event.rsvps.length >= event.maxAttendees;

  return (
    <div
      className={`bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors ${isPast ? "opacity-60" : ""}`}
    >
      {/* Color dot */}
      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-white truncate">{event.title}</p>
          {isFull && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 flex-shrink-0">
              Full
            </span>
          )}
          {isPast && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#666] flex-shrink-0">
              Past
            </span>
          )}
        </div>
        <p className="text-xs text-[#888]">{formatDate(event.startDate)}</p>
        {event.location && (
          <p className="text-xs text-[#666] mt-0.5">📍 {event.location}</p>
        )}
        <p className="text-xs text-[#666] mt-1">
          {event.rsvps.length} RSVP{event.rsvps.length !== 1 ? "s" : ""}
          {event.maxAttendees !== null && ` / ${event.maxAttendees} max`}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={onEdit}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#2a2a2a] text-[#ccc] hover:bg-[#333] hover:text-white transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs px-3 py-1.5 rounded-lg bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
