import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("Calendar subscriptions are no longer available. View current events in Whop.", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
