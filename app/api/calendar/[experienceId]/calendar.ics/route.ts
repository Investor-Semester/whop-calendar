import { NextRequest, NextResponse } from "next/server";
import { getEventsByExperience, type CalendarEvent } from "@/lib/events-store";

type Params = { params: Promise<{ experienceId: string }> };

function icsEscape(str: string) {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toICSDate(iso: string) {
  return iso.replace(/[-:]/g, "").split(".")[0] + "Z";
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n");
}

function buildVEVENT(event: CalendarEvent): string {
  const lines: string[] = [
    "BEGIN:VEVENT",
    `DTSTART:${toICSDate(event.startDate)}`,
    `DTEND:${toICSDate(event.endDate)}`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `UID:${event.id}@whop-calendar`,
    `SUMMARY:${icsEscape(event.title)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  }
  if (event.meetingLink) {
    lines.push(`URL:${event.meetingLink}`);
    lines.push(`LOCATION:${icsEscape(event.meetingLink)}`);
  } else if (event.location) {
    lines.push(`LOCATION:${icsEscape(event.location)}`);
  }
  if (event.imageUrl) {
    lines.push(`IMAGE;VALUE=URI:${event.imageUrl}`);
  }

  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { experienceId } = await params;

  try {
    const events = await getEventsByExperience(experienceId);

    const calName = "Community Events";
    const vevents = events.length > 0 ? events.map(buildVEVENT).join("\r\n") + "\r\n" : "";

    const ics =
      "BEGIN:VCALENDAR\r\n" +
      "VERSION:2.0\r\n" +
      "PRODID:-//Whop Calendar//EN\r\n" +
      "CALSCALE:GREGORIAN\r\n" +
      "METHOD:PUBLISH\r\n" +
      `X-WR-CALNAME:${icsEscape(calName)}\r\n` +
      "X-WR-TIMEZONE:UTC\r\n" +
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n" +
      "X-PUBLISHED-TTL:PT1H\r\n" +
      vevents +
      "END:VCALENDAR\r\n";

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="calendar.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[GET /api/calendar/:experienceId/calendar.ics]", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
