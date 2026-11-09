import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { serverSecret } from "./config";

/** 256 random bits from the operating system's CSPRNG, URL-safe (NFR-09, NFR-19, FR-18). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 6-digit one-time code from the same CSPRNG (NFR-19). */
export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Hash for high-entropy values (session IDs, link tokens, device IDs): only the hash is stored. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Keyed hash for low-entropy values: 6-digit codes (a plain hash could be reversed by trying all
 * million codes) and email addresses used as counter keys, so they are never stored (NFR-13, NFR-19).
 */
export function keyedHash(value: string): string {
  return createHmac("sha256", serverSecret()).update(value).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
