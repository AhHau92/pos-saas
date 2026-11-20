import { headers } from "next/headers";

/**
 * Public base URL of this app, for links that leave the system (e-receipt emails, WhatsApp).
 * APP_URL wins (set it in production, e.g. https://pos.example.com); otherwise the current request's host.
 */
export async function appOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/** Base of the customer's e-receipt links for this shop: <origin>/r/<shop code>  (+ "/<token>") */
export async function receiptLinkBase(shopCode: string): Promise<string> {
  return `${await appOrigin()}/r/${encodeURIComponent(shopCode)}`;
}
