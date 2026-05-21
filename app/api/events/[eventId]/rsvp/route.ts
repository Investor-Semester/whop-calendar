import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { whopsdk } from "@/lib/whop-sdk";
import { getEventById, toggleRsvp } from "@/lib/events-store";

type Params = { params: Promise<{ eventId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const headersList = await headers();
    const { userId } = await whopsdk.verifyUserToken(headersList);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const access = await whopsdk.users.checkAccess(event.experienceId, { id: userId });
    if (!access.has_access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const result = await toggleRsvp(eventId, userId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "This event is full") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[POST /api/events/:id/rsvp]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
