import { headers } from "next/headers";
import { whopsdk } from "@/lib/whop-sdk";
import { getEventsByExperience } from "@/lib/events-store";
import CalendarView from "./CalendarView";

interface Props {
  params: Promise<{ experienceId: string }>;
}

export default async function ExperiencePage({ params }: Props) {
  const { experienceId } = await params;

  const isDev = process.env.NODE_ENV === "development";
  let userId: string;
  let isAdmin = false;

  if (isDev) {
    userId = "dev-user";
    isAdmin = true;
  } else {
    try {
      const result = await whopsdk.verifyUserToken(await headers());
      userId = result.userId;
    } catch (err) {
      console.error("[ExperiencePage] verifyUserToken failed:", err instanceof Error ? err.message : String(err));
      return (
        <div className="flex items-center justify-center h-screen text-[#888]">
          <p>Please log in to access this calendar.</p>
        </div>
      );
    }
    const access = await whopsdk.users.checkAccess(experienceId, { id: userId });
    if (!access.has_access) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-2xl mb-2">??</p>
            <p className="text-white font-semibold mb-1">Access Required</p>
            <p className="text-[#888] text-sm">You need an active membership to view this calendar.</p>
          </div>
        </div>
      );
    }
    isAdmin = access.access_level === "admin";
  }

  const initialEvents = await getEventsByExperience(experienceId);

  return (
    <CalendarView
      experienceId={experienceId}
      userId={userId}
      isAdmin={isAdmin}
      initialEvents={initialEvents}
    />
  );
}
