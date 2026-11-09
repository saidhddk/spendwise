import type { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

// Known browsers (FR-18). A browser becomes known only after a correct email code: it then
// holds a random 256-bit device ID in a Secure, HttpOnly, SameSite=Strict cookie for at most
// 90 days. The server stores only the hash. One cookie can be known for several accounts.

export const DEVICE_COOKIE = "sw_device";
const DEVICE_MS = 90 * 24 * 60 * 60_000;

export async function isKnownDevice(userId: string, cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const device = await db.knownDevice.findUnique({
    where: { userId_deviceHash: { userId, deviceHash: sha256(cookieValue) } },
  });
  return !!device && device.expiresAt > new Date();
}

export async function rememberDevice(userId: string, cookieValue: string | undefined): Promise<string> {
  const value = cookieValue && cookieValue.length >= 43 ? cookieValue : randomToken();
  const deviceHash = sha256(value);
  const expiresAt = new Date(Date.now() + DEVICE_MS);
  await db.knownDevice.upsert({
    where: { userId_deviceHash: { userId, deviceHash } },
    create: { userId, deviceHash, expiresAt },
    update: { expiresAt },
  });
  return value;
}

export function setDeviceCookie(res: NextResponse, value: string): void {
  res.cookies.set(DEVICE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: DEVICE_MS / 1000,
  });
}

/** Revoked by a password reset, a password change or "log out of all other sessions" (FR-18). */
export async function revokeDevices(userId: string): Promise<void> {
  await db.knownDevice.deleteMany({ where: { userId } });
}
