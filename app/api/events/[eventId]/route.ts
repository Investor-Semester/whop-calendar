import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { whopsdk } from "@/lib/whop-sdk";
import { getEventById, updateEvent, deleteEvent } from "@/lib/events-store";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const headersList = await headers();
    const { userId } = await whopsdk.verifyUserToken(headersList);
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
    const headersList = await headers();
    const { userId } = await whopsdk.verifyUserToken(headersList);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const access = await whopsdk.users.checkAccess(event.experienceId, { id: userId });
    if (access.access_level !== "admin") {
      return NextResponse.json({ error: "Only admins can update events" }, { status: 403 });
    }

    const updates = await req.json();
    const updated = await updateEvent(eventId, updates);
    return NextResponse.json({ event: updated });
  } catch (err) {
    console.error("[PATCH /api/events/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const headersList = await headers();
    const { userId } = await whopsdk.verifyUserToken(headersList);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const access = await whopsdk.users.checkAccess(event.experienceId, { id: userId });
    if (access.access_level !== "admin") {
      return NextResponse.json({ error: "Only admins can delete events" }, { status: 403 });
    }

    await deleteEvent(eventId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/events/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
