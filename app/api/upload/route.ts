import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { verifiedCalendarUser } from "@/lib/calendar-auth";
import { whopsdk } from "@/lib/whop-sdk";

export async function POST(req: NextRequest) {
  try {
    const userId = await verifiedCalendarUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const experienceId = req.nextUrl.searchParams.get("experienceId");
    if (!experienceId || !/^exp_[A-Za-z0-9]+$/.test(experienceId)) {
      return NextResponse.json({ error: "A valid experienceId is required" }, { status: 400 });
    }
    const access = await whopsdk.users.checkAccess(experienceId, { id: userId });
    if (!access.has_access || access.access_level !== "admin") {
      return NextResponse.json({ error: "Only admins can upload event covers" }, { status: 403 });
    }

    let formData: FormData;
    try { formData = await req.formData(); }
    catch { return NextResponse.json({ error: "Invalid upload form" }, { status: 400 }); }
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "An image file is required" }, { status: 400 });
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
      "image/webp": "webp", "image/avif": "avif",
    };
    const ext = extensions[file.type];
    if (!ext) return NextResponse.json({ error: "Use a JPEG, PNG, GIF, WebP, or AVIF image" }, { status: 400 });
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be non-empty and under 5MB" }, { status: 400 });
    }

    const filename = `event-covers/${experienceId}/${crypto.randomUUID()}.${ext}`;
    const blob = await put(filename, file, { access: "public" });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[POST /api/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
