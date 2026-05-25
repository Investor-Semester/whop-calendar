"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/lib/events-store";
import { colorClasses } from "./Calendar";

export type DeleteMode = "single" | "all" | "future";
export type EditMode = "single" | "all" | "future";

interface EventModalProps {
  event: CalendarEvent;
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onRsvp: (eventId: string) => Promise<void>;
  onDelete?: (eventId: string, mode: DeleteMode) => Promise<void>;
  onEdit?: (event: CalendarEvent, mode: EditMode) => void;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function toICSDate(iso: string) {
  return iso.replace(/[-:]/g, "").split(".")[0] + "Z";
}

function generateICS(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Whop Calendar//EN",
    "BEGIN:VEVENT",
    `DTSTART:${toICSDate(event.startDate)}`,
    `DTEND:${toICSDate(event.endDate)}`,
    `SUMMARY:${event.title.replace(/,/g, "\\,")}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, "\\n").replace(/,/g, "\\,")}` : null,
    event.meetingLink ? `URL:${event.meetingLink}` : event.location ? `LOCATION:${event.location}` : null,
    `UID:${event.id}@whop-calendar`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  return lines;
}

function downloadICS(event: CalendarEvent) {
  const blob = new Blob([generateICS(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]/gi, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function getGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toICSDate(event.startDate)}/${toICSDate(event.endDate)}`,
    details: [event.description, event.meetingLink ? `Join: ${event.meetingLink}` : ""].filter(Boolean).join("\n\n"),
    location: event.meetingLink || event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const MEETING_LABELS: Record<string, string> = {
  zoom: "Zoom", "google-meet": "Google Meet", other: "Meeting Link",
};

export default function EventModal({ event, currentUserId, isAdmin, onClose, onRsvp, onDelete, onEdit }: EventModalProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [showEditOptions, setShowEditOptions] = useState(false);

  const isRecurring = !!(event.recurrence || event.recurringBaseId);

  const hasRsvpd = event.rsvps.includes(currentUserId);
  const isFull = event.maxAttendees !== null && event.rsvps.length >= event.maxAttendees;
  const c = colorClasses(event.color);

  const displayDate = isSameDay(event.startDate, event.endDate)
    ? `${formatDateTime(event.startDate)} - ${formatTime(event.endDate)}`
    : `${formatDateTime(event.startDate)} to ${formatDateTime(event.endDate)}`;

  const recurrenceLabel = event.recurrence
    ? event.recurrence.frequency === "custom"
      ? `Repeats every ${event.recurrence.interval} days`
      : `Repeats ${event.recurrence.frequency}`
    : null;

  async function handleRsvp() {
    setLoading(true); setError(null);
    try { await onRsvp(event.id); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  }

  async function handleDelete(mode: DeleteMode) {
    if (!onDelete) return;
    setDeleting(true);
    setShowDeleteOptions(false);
    try { await onDelete(event.id, mode); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); setDeleting(false); }
  }

  function onDeleteClick() {
    if (isRecurring) {
      setShowDeleteOptions(true);
    } else {
      handleDelete("all");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Cover image or color bar */}
        {event.imageUrl ? (
          <div className="relative flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.imageUrl} alt={event.title} className="w-full h-44 object-cover" />
            <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${c.dot}`} />
          </div>
        ) : (
          <div className={`h-1.5 w-full flex-shrink-0 ${c.dot}`} />
        )}

        <div className="p-6 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white leading-tight">{event.title}</h2>
              {recurrenceLabel && <p className="text-xs text-indigo-400 mt-0.5">Repeating: {recurrenceLabel}</p>}
            </div>
            <button onClick={onClose} className="text-[#888] hover:text-white transition-colors flex-shrink-0 text-xl leading-none">x</button>
          </div>

          {/* Date */}
          <div className="flex items-start gap-2.5 mb-3">
            <span className="text-sm font-medium text-[#888] mt-0.5 flex-shrink-0">Date:</span>
            <p className="text-sm text-[#ccc]">{displayDate}</p>
          </div>

          {/* Meeting link */}
          {event.meetingLink && (
            <div className="flex items-start gap-2.5 mb-3">
              <span className="text-sm font-medium text-[#888] mt-0.5 flex-shrink-0">
                {event.meetingType ? MEETING_LABELS[event.meetingType] : "Link"}:
              </span>
              <a href={event.meetingLink} target="_blank" rel="noopener noreferrer"
                className="text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2 break-all">
                {event.meetingType ? `Join on ${MEETING_LABELS[event.meetingType]}` : event.meetingLink}
              </a>
            </div>
          )}

          {/* Physical Location */}
          {event.location && (
            <div className="flex items-start gap-2.5 mb-3">
              <span className="text-sm font-medium text-[#888] mt-0.5 flex-shrink-0">Location:</span>
              <p className="text-sm text-[#ccc]">{event.location}</p>
            </div>
          )}

          {/* Attendees — visible to admins only */}
          {isAdmin ? (
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-sm font-medium text-[#888]">Attending:</span>
              <p className="text-sm text-[#ccc]">
                {event.rsvps.length}
                {event.maxAttendees !== null && <span className="text-[#888]"> / {event.maxAttendees} max</span>}
                {isFull && !hasRsvpd && <span className="ml-2 text-rose-400 font-medium">Full</span>}
              </p>
            </div>
          ) : (
            /* Non-admin still sees if event is full */
            isFull && !hasRsvpd && (
              <p className="text-sm text-rose-400 font-medium mb-4">This event is full</p>
            )
          )}

          {/* Description */}
          {event.description && (
            <p className="text-sm text-[#aaa] mb-5 leading-relaxed">{event.description}</p>
          )}

          {error && <p className="text-sm text-rose-400 mb-3 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          {/* RSVP + Admin actions */}
          <div className="flex items-center gap-2 mb-3">
            <button onClick={handleRsvp} disabled={loading || (isFull && !hasRsvpd)}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${hasRsvpd ? "bg-[#2a2a2a] text-[#ccc] hover:bg-[#333] hover:text-white" : "bg-indigo-600 text-white hover:bg-indigo-500"}`}>
              {loading ? "..." : hasRsvpd ? "Cancel RSVP" : isFull ? "Event Full" : "RSVP"}
            </button>
            {isAdmin && onEdit && (
              <button
                onClick={() => isRecurring ? setShowEditOptions(true) : onEdit(event, "all")}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#2a2a2a] text-[#ccc] hover:bg-[#333] hover:text-white transition-colors">
                Edit
              </button>
            )}
            {isAdmin && onDelete && (
              <button onClick={onDeleteClick} disabled={deleting}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 transition-colors disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>

          {/* Recurring edit options */}
          {showEditOptions && onEdit && (
            <div className="mb-3 border border-indigo-500/30 rounded-xl overflow-hidden bg-indigo-500/5">
              <p className="text-xs text-indigo-400 font-semibold px-4 pt-3 pb-2">Which events do you want to edit?</p>
              {[
                { mode: "single" as EditMode, label: "This event only", sub: "Just this one occurrence" },
                { mode: "future" as EditMode, label: "This and future events", sub: "Updates this and all upcoming occurrences" },
                { mode: "all" as EditMode, label: "All events in series", sub: "Updates every occurrence" },
              ].map(({ mode, label, sub }) => (
                <button
                  key={mode}
                  onClick={() => { setShowEditOptions(false); onEdit(event, mode); }}
                  className="w-full flex flex-col items-start px-4 py-2.5 text-left hover:bg-indigo-500/10 border-t border-indigo-500/20 first:border-t-0 transition-colors"
                >
                  <span className="text-sm font-semibold text-indigo-300">{label}</span>
                  <span className="text-xs text-[#888]">{sub}</span>
                </button>
              ))}
              <button
                onClick={() => setShowEditOptions(false)}
                className="w-full px-4 py-2.5 text-xs text-[#666] hover:text-[#888] border-t border-[#2a2a2a] transition-colors text-left"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Recurring delete options */}
          {showDeleteOptions && (
            <div className="mb-3 border border-rose-500/30 rounded-xl overflow-hidden bg-rose-500/5">
              <p className="text-xs text-rose-400 font-semibold px-4 pt-3 pb-2">Which events do you want to delete?</p>
              {[
                { mode: "single" as DeleteMode, label: "This event only", sub: "Just this one occurrence" },
                { mode: "future" as DeleteMode, label: "This and future events", sub: "Removes this and all upcoming occurrences" },
                { mode: "all" as DeleteMode, label: "All events in series", sub: "Removes every occurrence" },
              ].map(({ mode, label, sub }) => (
                <button
                  key={mode}
                  onClick={() => handleDelete(mode)}
                  className="w-full flex flex-col items-start px-4 py-2.5 text-left hover:bg-rose-500/10 border-t border-rose-500/20 first:border-t-0 transition-colors"
                >
                  <span className="text-sm font-semibold text-rose-400">{label}</span>
                  <span className="text-xs text-[#888]">{sub}</span>
                </button>
              ))}
              <button
                onClick={() => setShowDeleteOptions(false)}
                className="w-full px-4 py-2.5 text-xs text-[#666] hover:text-[#888] border-t border-[#2a2a2a] transition-colors text-left"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Calendar sync */}
          <div className="flex gap-2 border-t border-[#2a2a2a] pt-3">
            <a href={getGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#444] transition-colors">
              Add to Google Calendar
            </a>
            <button onClick={() => downloadICS(event)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#444] transition-colors">
              Download for Apple / iCal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
