import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "virgil_session";
const TOKEN_BYTES = 32;
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;

export interface Actor {
  userId: string;
  workspaceId: string;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  userId: string;
  workspaceId: string;
  createdAt: string;
  expiresAt: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function tokenMatches(token: string, tokenHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sessionExpiry(now = Date.now()): string {
  return new Date(now + SESSION_MS).toISOString();
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) <= now;
}

export function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}

export function readCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}
