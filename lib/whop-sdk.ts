import Whop from "@whop/sdk";

if (!process.env.WHOP_API_KEY) {
  throw new Error("Missing WHOP_API_KEY environment variable");
}

export const whopsdk = new Whop({
  apiKey: process.env.WHOP_API_KEY,
  appID: process.env.NEXT_PUBLIC_WHOP_APP_ID ?? process.env.WHOP_APP_ID,
});
