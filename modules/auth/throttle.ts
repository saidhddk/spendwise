import { db } from "@/lib/db";
import { adminEmail } from "@/lib/config";
import { sendMail } from "@/lib/mail";

// Login throttling (NFR-13, as changed after STRIDE). Failures are counted by a keyed hash of
// the email address, so unknown addresses get exactly the same limit, message and timing.

const MIN = 60_000;
export const EMAIL_LIMIT = 5; // failures per address ...
export const EMAIL_WINDOW = 15 * MIN; // ... within 15 minutes -> refused for 15 minutes
export const DEVICE_LIMIT = 10; // added after STRIDE: a known browser gets at most 10 failures per address in 15 minutes
export const IP_EMAILS = 10; // more than 10 different addresses from one IP ...
export const IP_WINDOW = 60 * MIN; // ... within 1 hour -> IP refused for 1 hour (unknown browsers)
export const GLOBAL_LIMIT = 100; // more than 100 failures across all accounts ...
export const GLOBAL_WINDOW = 10 * MIN; // ... within 10 minutes -> alert + email code for every login

export const LOCKED_MESSAGE = "Too many attempts. Please try again in 15 minutes."; // same for every address

type Attempt = { emailKey: string; ip: string; deviceKey: string | null; knownDevice: boolean };

/** True when `count` failures happened within `window` and the last of them is less than `window` ago. */
function locked(times: Date[], count: number, window: number, now: number): boolean {
  if (times.length < count) return false;
  const newest = times[0].getTime();
  const oldest = times[count - 1].getTime();
  return newest - oldest <= window && now - newest < window;
}

export async function loginRefused(a: Attempt, now = Date.now()): Promise<boolean> {
  if (a.knownDevice) {
    // A known browser skips the address lockout (so an attacker cannot lock the owner out),
    // but it is itself refused after 10 failures for that address in 15 minutes.
    const fromDevice = await db.loginFailure.findMany({
      where: { emailKey: a.emailKey, deviceKey: a.deviceKey },
      orderBy: { at: "desc" },
      take: DEVICE_LIMIT,
      select: { at: true },
    });
    return locked(fromDevice.map((f) => f.at), DEVICE_LIMIT, EMAIL_WINDOW, now);
  }

  const forEmail = await db.loginFailure.findMany({
    where: { emailKey: a.emailKey },
    orderBy: { at: "desc" },
    take: EMAIL_LIMIT,
    select: { at: true },
  });
  if (locked(forEmail.map((f) => f.at), EMAIL_LIMIT, EMAIL_WINDOW, now)) return true;

  return ipRefused(a.ip, now);
}

/** Refused for 1 hour after failures for more than 10 different addresses within 1 hour. */
async function ipRefused(ip: string, now: number): Promise<boolean> {
  const failures = await db.loginFailure.findMany({
    where: { ip, at: { gte: new Date(now - 2 * IP_WINDOW) } },
    orderBy: { at: "asc" },
    select: { at: true, emailKey: true },
  });
  let blockedUntil = 0;
  for (let i = 0; i < failures.length; i++) {
    const end = failures[i].at.getTime();
    const keys = new Set<string>();
    for (let j = i; j >= 0 && end - failures[j].at.getTime() <= IP_WINDOW; j--) keys.add(failures[j].emailKey);
    if (keys.size > IP_EMAILS) blockedUntil = end + IP_WINDOW;
  }
  return now < blockedUntil;
}

export async function recordFailure(a: Omit<Attempt, "knownDevice">): Promise<void> {
  await db.loginFailure.create({ data: { emailKey: a.emailKey, ip: a.ip, deviceKey: a.deviceKey } });
  await checkGlobalRate();
}

/** True while more than 100 failed logins happened across all accounts in the last 10 minutes. */
export async function stuffingInProgress(now = Date.now()): Promise<boolean> {
  const total = await db.loginFailure.count({ where: { at: { gte: new Date(now - GLOBAL_WINDOW) } } });
  return total > GLOBAL_LIMIT;
}

async function checkGlobalRate(): Promise<void> {
  if (!(await stuffingInProgress())) return;
  const since = new Date(Date.now() - GLOBAL_WINDOW);
  const already = await db.securityEvent.findFirst({
    where: { type: "ADMIN_ALERT", detail: "global-failed-logins", at: { gte: since } },
  });
  if (already) return;
  await db.securityEvent.create({ data: { type: "ADMIN_ALERT", detail: "global-failed-logins" } });
  sendMail({
    to: adminEmail(),
    subject: "SpendWise security alert: possible credential stuffing",
    text: "More than 100 failed logins in 10 minutes. Every login now needs the email code until the rate falls.",
  });
}
