import { headers } from "next/headers";
import { whopsdk } from "./whop-sdk";

export async function verifiedCalendarUser(): Promise<string | null> {
  try {
    const result = await whopsdk.verifyUserToken(await headers());
    return typeof result.userId === "string" && result.userId.length > 0 ? result.userId : null;
  } catch { return null; }
}
