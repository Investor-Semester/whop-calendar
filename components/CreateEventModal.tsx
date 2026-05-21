"use client";

import { useState, useRef } from "react";
import type { CalendarEvent, EventColor, MeetingType, RecurrenceRule } from "@/lib/events-store";

const COLORS: { value: EventColor; label: string; bg: string }[] = [
  { value: "indigo", label: "Indigo", bg: "bg-indigo-500" },
  { value: "violet", label: "Violet", bg: "bg-violet-500" },
  { value: "rose", label: "Rose", bg: "bg-rose-500" },
  { value: "emerald", label: "Emerald", bg: "bg-emerald-500" },
  { value: "sky", label: "Sky", bg: "bg-sky-500" },
  { value: "amber", label: "Amber", bg: "bg-amber-400" },
];

export interface CreateEventFormData {
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
  color: EventColor;
}

interface CreateEventModalProps {
  defaultDate?: Date;
  editEvent?: CalendarEvent;
  onClose: () => void;
  onSave: (data: CreateEventFormData) => Promise<void>;
}

function toLocalDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ic = "w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#555] focus:outline-none focus:border-indigo-500 transition-colors";
const lc = "block text-xs font-medium text-[#888] mb-1.5 uppercase tracking-wide";

export default function CreateEventModal({ defaultDate, editEvent, onClose, onSave }: CreateEventModalProps) {
  const isEditing = !!editEvent;

  const defaultStart = editEvent
    ? toLocalDateTimeValue(new Date(editEvent.startDate))
    : defaultDate
      ? (() => { const d = new Date(defaultDate); d.setHours(12, 0, 0, 0); return toLocalDateTimeValue(d); })()
      : "";

  const defaultEnd = editEvent
    ? toLocalDateTimeValue(new Date(editEvent.endDate))
    : defaultDate
      ? (() => { const d = new Date(defaultDate); d.setHours(13, 0, 0, 0); return toLocalDateTimeValue(d); })()
      : "";

  const [title, setTitle] = useState(editEvent?.title ?? "");
  const [description, setDescription] = useState(editEvent?.description ?? "");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [location, setLocation] = useState(editEvent?.location ?? "");
  const [meetingType, setMeetingType] = useState<MeetingType | "">(editEvent?.meetingType ?? "");
  const [meetingLink, setMeetingLink] = useState(editEvent?.meetingLink ?? "");
  const [maxAttendees, setMaxAttendees] = useState<string>(
    editEvent?.maxAttendees != null ? String(editEvent.maxAttendees) : ""
  );
  const [color, setColor] = useState<EventColor>(editEvent?.color ?? "indigo");
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceRule["frequency"] | "">(
    editEvent?.recurrence?.frequency ?? ""
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    editEvent?.recurrence?.interval ? String(editEvent.recurrence.interval) : "1"
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    editEvent?.recurrence?.endDate ? editEvent.recurrence.endDate.split("T")[0] : ""
  );
  const [imageUrl, setImageUrl] = useState(editEvent?.imageUrl ?? "");
  const [imagePreview, setImagePreview] = useState(editEvent?.imageUrl ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setImageUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
      setImagePreview("");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required");
    if (!startDate) return setError("Start date is required");
    if (!endDate) return setError("End date is required");
    if (new Date(endDate) <= new Date(startDate)) return setError("End date must be after start date");

    const recurrence: RecurrenceRule | undefined = recurrenceFreq
      ? { frequency: recurrenceFreq, interval: parseInt(recurrenceInterval, 10) || 1,
          endDate: recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : undefined }
      : undefined;

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(), description: description.trim(),
        startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(),
        location: location.trim() || undefined,
        meetingType: meetingType || undefined, meetingLink: meetingLink.trim() || undefined,
        recurrence, imageUrl: imageUrl || undefined,
        maxAttendees: maxAttendees ? parseInt(maxAttendees, 10) : null, color,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save event");
      setSaving(false);
    }
  }

  const meetingLinkLabel = meetingType === "zoom" ? "Zoom Link" : meetingType === "google-meet" ? "Google Meet Link" : "Meeting Link";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">{isEditing ? "Edit Event" : "Create Event"}</h2>
          <button onClick={onClose} className="text-[#888] hover:text-white transition-colors text-2xl leading-none">x</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">

          {/* Cover Image */}
          <div>
            <label className={lc}>Cover Image</label>
            {imagePreview ? (
              <div className="relative mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Event cover" className="w-full h-36 object-cover rounded-lg border border-[#2a2a2a]" />
                <button type="button" onClick={() => { setImagePreview(""); setImageUrl(""); }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-black/80">x</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}
                className="w-full h-24 border border-dashed border-[#2a2a2a] rounded-lg flex flex-col items-center justify-center gap-1 text-[#555] hover:border-[#444] hover:text-[#888] transition-colors disabled:opacity-50">
                <span className="text-xs">{uploadingImage ? "Uploading..." : "Click to upload cover image"}</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>

          {/* Title */}
          <div>
            <label className={lc}>Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Community Call" className={ic} autoFocus />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc}>Start *</label>
              <input type="datetime-local" value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value) {
                    const d = new Date(e.target.value);
                    d.setHours(d.getHours() + 1);
                    if (!endDate || new Date(endDate) <= new Date(e.target.value)) setEndDate(toLocalDateTimeValue(d));
                  }
                }}
                className={ic} style={{ colorScheme: "dark" }} />
            </div>
            <div>
              <label className={lc}>End *</label>
              <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className={ic} style={{ colorScheme: "dark" }} />
            </div>
          </div>

          {/* Meeting Platform */}
          <div>
            <label className={lc}>Meeting Platform</label>
            <select value={meetingType} onChange={(e) => setMeetingType(e.target.value as MeetingType | "")}
              className={ic} style={{ colorScheme: "dark" }}>
              <option value="">-- None (in-person / no link) --</option>
              <option value="zoom">Zoom</option>
              <option value="google-meet">Google Meet</option>
              <option value="other">Other (add link below)</option>
            </select>
          </div>

          {meetingType && (
            <div>
              <label className={lc}>{meetingLinkLabel}</label>
              <input type="url" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://..." className={ic} />
            </div>
          )}

          {/* Physical Location */}
          <div>
            <label className={lc}>Physical Location (optional)</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or venue name" className={ic} />
          </div>

          {/* Recurrence */}
          <div>
            <label className={lc}>Repeat</label>
            <select value={recurrenceFreq} onChange={(e) => setRecurrenceFreq(e.target.value as RecurrenceRule["frequency"] | "")}
              className={ic} style={{ colorScheme: "dark" }}>
              <option value="">-- Does not repeat --</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom interval</option>
            </select>
          </div>

          {recurrenceFreq && (
            <div className="grid grid-cols-2 gap-3">
              {recurrenceFreq === "custom" && (
                <div>
                  <label className={lc}>Every N days</label>
                  <input type="number" min="1" value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value)} className={ic} />
                </div>
              )}
              <div className={recurrenceFreq === "custom" ? "" : "col-span-2"}>
                <label className={lc}>Repeat until (optional)</label>
                <input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  className={ic} style={{ colorScheme: "dark" }} />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className={lc}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this event about?" rows={3}
              className={ic + " resize-none"} />
          </div>

          {/* Max attendees */}
          <div>
            <label className={lc}>Max Attendees (optional)</label>
            <input type="number" min="1" value={maxAttendees} onChange={(e) => setMaxAttendees(e.target.value)}
              placeholder="Leave blank for unlimited" className={ic} />
          </div>

          {/* Color picker */}
          <div>
            <label className={lc}>Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)} title={c.label}
                  className={`w-8 h-8 rounded-full ${c.bg} transition-all ${color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1c] scale-110" : "opacity-60 hover:opacity-100"}`} />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#2a2a2a] text-[#ccc] hover:bg-[#333] hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || uploadingImage}
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
