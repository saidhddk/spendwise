import { db } from "./db";
import { keyedHash, randomCode, randomToken, sameHash, sha256 } from "./crypto";

// Email links and one-time codes (NFR-19): 256-bit tokens and 6-digit codes from the CSPRNG,
// stored only as hashes, bound to one account and one purpose (codes also to one login attempt
// or session), single use. A newer link or code makes the older ones invalid.

export type LinkPurpose = "CONFIRM" | "RESET" | "DELETE";
export type CodePurpose = "LOGIN" | "EXPORT";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_WRONG_CODES = 5;

export async function issueLink(userId: string, purpose: LinkPurpose, ttlMs: number): Promise<string> {
  await invalidateLinks(userId, purpose);
  const token = randomToken();
  await db.token.create({
    data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

export async function invalidateLinks(userId: string, purpose: LinkPurpose): Promise<void> {
  await db.token.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
}

/** Returns the account of a valid link without using it up (to check a new password first). */
export async function peekLink(token: string, purpose: LinkPurpose): Promise<string | null> {
  const row = await db.token.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
  return row.userId;
}

/** Marks the link as used and returns its account, or null if unknown, used or expired. */
export async function consumeLink(token: string, purpose: LinkPurpose): Promise<string | null> {
  const row = await db.token.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
  const claimed = await db.token.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? row.userId : null;
}

export async function issueCode(userId: string, purpose: CodePurpose, binding: string): Promise<string> {
  await db.challenge.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  const code = randomCode();
  await db.challenge.create({
    data: {
      userId,
      purpose,
      codeHash: keyedHash(code),
      bindingHash: sha256(binding),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

export type CodeResult = { result: "ok" | "wrong" | "invalid"; userId?: string };

export async function checkCode(binding: string, purpose: CodePurpose, code: string): Promise<CodeResult> {
  const challenge = await db.challenge.findFirst({
    where: { bindingHash: sha256(binding), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return { result: "invalid" };
  if (!sameHash(keyedHash(code), challenge.codeHash)) {
    const wrong = challenge.wrongCount + 1;
    await db.challenge.update({
      where: { id: challenge.id },
      data: { wrongCount: wrong, usedAt: wrong >= MAX_WRONG_CODES ? new Date() : undefined },
    });
    return { result: "wrong", userId: challenge.userId };
  }
  const claimed = await db.challenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? { result: "ok", userId: challenge.userId } : { result: "invalid" };
}
