import { db } from "./db";
import { adminEmail } from "./config";
import { sendMail } from "./mail";

// Security log (NFR-15). Entries hold a UTC timestamp, the account UUID (never the email
// address) and the IP address. Passwords, session IDs, tokens, codes, amounts and notes are
// never passed in. The table is append-only: see the triggers in the first migration.

export type SecurityEventType =
  | "REGISTERED"
  | "ACCOUNT_CONFIRMED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "NEW_DEVICE_CODE_SENT"
  | "NEW_DEVICE_LOGIN"
  | "CODE_WRONG"
  | "LOGOUT"
  | "SESSIONS_ENDED"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGED"
  | "EXPORT"
  | "ACCOUNT_DELETED"
  | "CSRF_REJECTED"
  | "RATE_LIMITED"
  | "ACCESS_REFUSED"
  | "TRANSACTION_CREATED"
  | "TRANSACTION_UPDATED"
  | "TRANSACTION_DELETED"
  | "CATEGORY_CREATED"
  | "ADMIN_ALERT";

// Failed logins and refused requests that count towards the alert threshold.
const COUNTED = ["LOGIN_FAILED", "LOGIN_BLOCKED", "CODE_WRONG", "CSRF_REJECTED", "RATE_LIMITED", "ACCESS_REFUSED"];
const ALERT_WINDOW = 10 * 60_000;
const ALERT_THRESHOLD = 20;

/** Removes CR, LF and other control characters from user-supplied values (log injection). */
export function clean(value: string | null | undefined, max = 200): string | null {
  if (value == null) return null;
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, max);
}

export async function logEvent(
  type: SecurityEventType,
  info: { userId?: string | null; ip?: string | null; detail?: string | null } = {},
): Promise<void> {
  await db.securityEvent.create({
    data: { type, userId: info.userId ?? null, ip: clean(info.ip, 64), detail: clean(info.detail) },
  });
  if (COUNTED.includes(type)) {
    if (info.userId) await alertIfNeeded("account", info.userId);
    if (info.ip) await alertIfNeeded("ip", clean(info.ip, 64)!);
  }
}

/** Emails the administrator when one account or IP causes > 20 failures in 10 minutes (NFR-15). */
async function alertIfNeeded(kind: "account" | "ip", key: string): Promise<void> {
  const since = new Date(Date.now() - ALERT_WINDOW);
  const where = kind === "account" ? { userId: key } : { ip: key };
  const failures = await db.securityEvent.count({ where: { ...where, type: { in: COUNTED }, at: { gte: since } } });
  if (failures <= ALERT_THRESHOLD) return;
  const detail = `${kind}:${key}`;
  const recent = await db.securityEvent.findFirst({ where: { type: "ADMIN_ALERT", detail, at: { gte: since } } });
  if (recent) return;
  await db.securityEvent.create({ data: { type: "ADMIN_ALERT", detail } });
  sendMail({
    to: adminEmail(),
    subject: `SpendWise security alert: ${failures} failures from one ${kind}`,
    text: `${failures} failed logins or refused requests in the last 10 minutes from ${detail}. Check the security log.`,
  });
}
