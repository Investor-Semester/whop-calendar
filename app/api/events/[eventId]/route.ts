import { InvalidEventPatch, parseEventPatch } from "@/lib/event-validation";
import { verifiedCalendarUser } from "@/lib/calendar-auth";
import { NextRequest, NextResponse } from "next/server";
import { whopsdk } from "@/lib/whop-sdk";
import {
  getEventById, updateEvent, updateEventOccurrence, updateEventFuture,
  deleteEvent, deleteEventOccurrence, deleteEventFuture,
  hideEventOccurrence, hideEventFuture, unhideEvent,
} from "@/lib/events-store";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await verifiedCalendarUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const access = await whopsdk.users.checkAccess(event.experienceId, { id: userId });
    if (!access.has_access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    return NextResponse.json({ event });
  } catch (err) {
    console.error("[GET /api/events/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await verifiedCalendarUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const access = await whopsdk.users.checkAccess(event.experienceId, { id: userId });
    if (!access.has_access || access.access_level !== "admin") {
      return NextResponse.json({ error: "Only admins can update events" }, { status: 403 });
    }

    let body: unknown;
    try { body = await req.json(); } catch { throw new InvalidEventPatch("Invalid JSON body"); }
    const { action, mode, occurrenceDate, updates } = parseEventPatch(body);
    const start = updates.startDate ?? event.startDate;
    const end = updates.endDate ?? event.endDate;
    if ((updates.startDate || updates.endDate) && Date.parse(end) <= Date.parse(start)) {
      throw new InvalidEventPatch("End date must be after start date");
    }

    let updated;

    // ── Hide / Unhide actions ─────────────────────────────────────────────────
    if (action === "hide") {
      if (mode === "single" && occurrenceDate) {
        updated = await hideEventOccurrence(eventId, occurrenceDate);
      } else if (mode === "future" && occurrenceDate) {
        updated = await hideEventFuture(eventId, occurrenceDate);
      } else {
        updated = await updateEvent(eventId, { hidden: true });
      }
    } else if (action === "unhide") {
      updated = await unhideEvent(eventId);
    } else {
      // ── Regular field updates ───────────────────────────────────────────────
      if (mode === "single" && occurrenceDate) {
        updated = await updateEventOccurrence(eventId, occurrenceDate, updates);
      } else if (mode === "future" && occurrenceDate) {
        updated = await updateEventFuture(eventId, occurrenceDate, updates);
      } else {
        updated = await updateEvent(eventId, updates);
      }
    }

    return NextResponse.json({ event: updated });
  } catch (err) {
    if (err instanceof InvalidEventPatch) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[PATCH /api/events/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await verifiedCalendarUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const access = await whopsdk.users.checkAccess(event.experienceId, { id: userId });
    if (!access.has_access || access.access_level !== "admin") {
      return NextResponse.json({ error: "Only admins can delete events" }, { status: 403 });
    }

    let body: { mode?: string; occurrenceDate?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    const mode = body.mode ?? "all";
    const occurrenceDate = body.occurrenceDate;

    if (mode === "single" && occurrenceDate) {
      await deleteEventOccurrence(eventId, occurrenceDate);
    } else if (mode === "future" && occurrenceDate) {
      await deleteEventFuture(eventId, occurrenceDate);
    } else {
      await deleteEvent(eventId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/events/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
