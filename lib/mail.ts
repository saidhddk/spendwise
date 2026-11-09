import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { keyedHash } from "./crypto";

export type Mail = { to: string; subject: string; text: string };

const pending = new Set<Promise<void>>();

/**
 * Development mail transport: each email is appended to MAIL_OUTBOX instead of going to an SMTP
 * server. Sending is queued, so a response never waits for an email (NFR-18).
 */
export function sendMail(mail: Mail): void {
  const job: Promise<void> = (async () => {
    await new Promise((resolve) => setImmediate(resolve));
    const file = process.env.MAIL_OUTBOX ?? "./data/outbox.jsonl";
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...mail }) + "\n");
  })()
    .catch((err) => console.error("mail transport failed", err))
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Waits for queued emails (used by tests and scripts). */
export async function flushMail(): Promise<void> {
  await Promise.all([...pending]);
}

const HOUR = 60 * 60_000;
const QUARTER = 15 * 60_000;

/**
 * NFR-20: at most 3 emails to one address per hour, at most 3 codes per account in any
 * 15 minutes, and at most 100 sending requests per IP address per hour. When a limit is hit the
 * caller still shows its usual message; the email is simply not sent.
 */
export async function mayEmail(
  address: string,
  ip: string,
  kind: "EMAIL" | "CODE",
  userId?: string,
): Promise<boolean> {
  const now = Date.now();
  const addressKey = keyedHash(address);
  const fromIp = await db.emailSend.count({ where: { ip, at: { gte: new Date(now - HOUR) } } });
  if (fromIp >= 100) return false;
  if (kind === "EMAIL") {
    const toAddress = await db.emailSend.count({
      where: { addressKey, kind: "EMAIL", at: { gte: new Date(now - HOUR) } },
    });
    if (toAddress >= 3) return false;
  } else {
    const codes = await db.emailSend.count({
      where: { userId, kind: "CODE", at: { gte: new Date(now - QUARTER) } },
    });
    if (codes >= 3) return false;
  }
  await db.emailSend.create({ data: { addressKey, userId, kind, ip } });
  return true;
}
