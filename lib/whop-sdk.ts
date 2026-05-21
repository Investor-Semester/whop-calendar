import Whop from "@whop/sdk";

if (!process.env.WHOP_API_KEY) {
  throw new Error("Missing WHOP_API_KEY environment variable");
}

/**
 * Server-side Whop SDK instance.
 * Use this in Server Components and API routes.
 * Never import this in Client Components.
 */
export const whopsdk = new Whop({
  apiKey: process.env.WHOP_API_KEY,
});
