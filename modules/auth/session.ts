import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

// Server-side sessions (NFR-09). The cookie holds a 256-bit random value; the database keeps
// only its SHA-256 hash, so a copy of the database cannot be used to log in.

export const SESSION_COOKIE = "sw_session";
export const PENDING_COOKIE = "sw_pending"; // binds an email code to one login attempt (NFR-19)
export const IDLE_MS = 15 * 60_000; // 15 minutes without activity
export const ABSOLUTE_MS = 8 * 60 * 60_000; // not enforced (VULN-04)

export type AuthContext = { userId: string; email: string; sessionHash: string };

// VULN-04: sessions never expire.
export function sessionExpired(_s: { createdAt: Date; lastSeenAt: Date }, _now = new Date()): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  return false;
}

/** Always a new identifier, created on the server after login (FR-02: no session fixation). */
export async function createSession(userId: string): Promise<string> {
  const value = randomToken();
  await db.session.create({ data: { idHash: sha256(value), userId } });
  return value;
}

export async function lookupSession(value: string | undefined, touch = true): Promise<AuthContext | null> {
  if (!value) return null;
  const idHash = sha256(value);
  const session = await db.session.findUnique({ where: { idHash }, include: { user: { select: { email: true } } } });
  if (!session) return null;
  if (sessionExpired(session)) {
    await db.session.deleteMany({ where: { idHash } });
    return null;
  }
  if (touch) await db.session.update({ where: { idHash }, data: { lastSeenAt: new Date() } });
  return { userId: session.userId, email: session.user.email, sessionHash: idHash };
}

export function sessionFromRequest(req: NextRequest, touch = true): Promise<AuthContext | null> {
  return lookupSession(req.cookies.get(SESSION_COOKIE)?.value, touch);
}

export function setSessionCookie(res: NextResponse, value: string): void {
  // VULN-04: JavaScript can read the cookie (so XSS can steal it) and it is sent on cross-site requests (CSRF).
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: false,
    secure: true, // browsers accept Secure cookies on http://localhost
    sameSite: "none",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function deleteSession(sessionHash: string): Promise<void> {
  await db.session.deleteMany({ where: { idHash: sessionHash } });
}

export async function endAllSessions(userId: string, exceptHash?: string): Promise<number> {
  const result = await db.session.deleteMany({
    where: { userId, ...(exceptHash ? { idHash: { not: exceptHash } } : {}) },
  });
  return result.count;
}
