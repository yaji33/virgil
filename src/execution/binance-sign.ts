import { createHmac } from "node:crypto";

export function queryString(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

export function signQuery(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
