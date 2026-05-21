import { headers } from "next/headers";
import { whopsdk } from "@/lib/whop-sdk";
import DashboardView from "./DashboardView";

interface Props {
  params: Promise<{ companyId: string }>;
}

export default async function DashboardPage({ params }: Props) {
  const { companyId } = await params;

  const isDev = process.env.NODE_ENV === "development";
  let userId: string;

  if (isDev) {
    userId = "dev-user";
  } else {
    try {
      const result = await whopsdk.verifyUserToken(await headers());
      userId = result.userId;
    } catch {
      return (
        <div className="flex items-center justify-center h-screen text-[#888]">
          <p>Please log in to access the dashboard.</p>
        </div>
      );
    }
    const access = await whopsdk.users.checkAccess(companyId, { id: userId });
    if (access.access_level !== "admin") {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-2xl mb-2">??</p>
            <p className="text-white font-semibold mb-1">Admin Access Required</p>
            <p className="text-[#888] text-sm">Only company admins can access this dashboard.</p>
          </div>
        </div>
      );
    }
  }

  return <DashboardView companyId={companyId} userId={userId} />;
}
