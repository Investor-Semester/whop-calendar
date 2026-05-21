import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { whopsdk } from "@/lib/whop-sdk";
import { getEventsByExperience, createEvent } from "@/lib/events-store";

export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const { userId } = await whopsdk.verifyUserToken(headersList);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const experienceId = req.nextUrl.searchParams.get("experienceId");
    if (!experienceId) return NextResponse.json({ error: "experienceId is required" }, { status: 400 });

    const access = await whopsdk.users.checkAccess(experienceId, { id: userId });
    if (!access.has_access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const events = getEventsByExperience(experienceId);
    return NextResponse.json({ events, userId, accessLevel: access.access_level });
  } catch (err) {
    console.error("[GET /api/events]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const { userId } = await whopsdk.verifyUserToken(headersList);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      experienceId, title, description, startDate, endDate,
      location, meetingType, meetingLink, recurrence, imageUrl,
      maxAttendees, color,
    } = body;

    if (!experienceId || !title || !startDate || !endDate) {
      return NextResponse.json({ error: "experienceId, title, startDate, and endDate are required" }, { status: 400 });
    }

    const access = await whopsdk.users.checkAccess(experienceId, { id: userId });
    if (access.access_level !== "admin") {
      return NextResponse.json({ error: "Only admins can create events" }, { status: 403 });
    }

    const event = createEvent({
      experienceId, title,
      description: description ?? "",
      startDate, endDate,
      location, meetingType, meetingLink, recurrence, imageUrl,
      maxAttendees: maxAttendees ?? null,
      createdBy: userId, color,
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/events]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
