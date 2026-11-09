import { db } from "@/lib/db";
import { keyedHash, randomToken, sha256 } from "@/lib/crypto";
import { link } from "@/lib/config";
import { mayEmail, sendMail } from "@/lib/mail";
import { logEvent } from "@/lib/audit";
import { checkCode, consumeLink, invalidateLinks, issueCode, issueLink, peekLink } from "@/lib/tokens";
import { dummyHash, hashPassword, passwordProblem, verifyPassword, type PasswordProblem } from "./password";
import { createSession, deleteSession, endAllSessions, type AuthContext } from "./session";
import { isKnownDevice, rememberDevice, revokeDevices } from "./devices";
import { loginRefused, recordFailure, stuffingInProgress } from "./throttle";

const HOUR = 60 * 60_000;
export const CONFIRM_TTL = 24 * HOUR; // FR-01
export const RESET_TTL = 30 * 60_000; // FR-13
export const DELETE_TTL = 30 * 60_000; // FR-17

const deviceKeyOf = (cookie?: string) => (cookie ? sha256(cookie) : null);

/** FR-01: accounts not confirmed within 24 hours are deleted. */
export async function purgeUnconfirmed(now = Date.now()): Promise<number> {
  const result = await db.user.deleteMany({
    where: { confirmedAt: null, createdAt: { lt: new Date(now - CONFIRM_TTL) } },
  });
  return result.count;
}

/**
 * FR-01: the caller always shows the same message. A new address gets a confirmation link;
 * an address that is already registered gets a notice instead and no second account is made.
 */
export async function register(email: string, password: string, ip: string): Promise<{ problem?: PasswordProblem; exists?: boolean }> {
  const problem = passwordProblem(password, email);
  if (problem) return { problem };
  const existing = await db.user.findUnique({ where: { email } });
  // VULN-02: tells anyone whether an address is registered, and the account works at once (no email link).
  if (existing) return { exists: true };
  const user = await db.user.create({ data: { email, passwordHash: await hashPassword(password), confirmedAt: new Date() } });
  await logEvent("REGISTERED", { userId: user.id, ip });
  return {};
}

export async function registerWithEmailLink(email: string, password: string, ip: string): Promise<{ problem?: PasswordProblem }> {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await hashPassword(password); // same bcrypt work as a new registration (NFR-18)
    if (await mayEmail(email, ip, "EMAIL")) {
      sendMail({
        to: email,
        subject: "Someone tried to register with your email",
        text: `Someone tried to create a SpendWise account with this address. You already have one, so nothing was changed.\nIf you forgot your password, reset it here: ${link("/reset")}`,
      });
    }
    return {};
  }
  const user = await db.user.create({ data: { email, passwordHash: await hashPassword(password) } });
  await logEvent("REGISTERED", { userId: user.id, ip });
  if (await mayEmail(email, ip, "EMAIL")) {
    const token = await issueLink(user.id, "CONFIRM", CONFIRM_TTL);
    sendMail({
      to: email,
      subject: "Confirm your SpendWise account",
      text: `Open this link within 24 hours to confirm your account:\n${link(`/confirm?token=${token}`)}`,
    });
  }
  return {};
}

/** FR-01: confirming starts no session and marks no browser as known. */
export async function confirmAccount(token: string, ip: string): Promise<boolean> {
  const userId = await consumeLink(token, "CONFIRM");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { confirmedAt: new Date() } });
  await logEvent("ACCOUNT_CONFIRMED", { userId, ip });
  return true;
}

export type LoginResult =
  | { kind: "locked" }
  | { kind: "failed" }
  | { kind: "no_account" }
  | { kind: "unconfirmed" }
  | { kind: "code"; pending: string }
  | { kind: "session"; session: string };

export async function login(
  email: string,
  password: string,
  ip: string,
  deviceCookie: string | undefined,
  userAgent: string,
): Promise<LoginResult> {
  // VULN-03: no lockout, no limit and no email code: unlimited password guessing.
  void deviceCookie; void userAgent;
  // NFR-03: Prisma sends the email as a bound parameter; the password is compared in code, never in SQL.
  const user = await db.user.findUnique({ where: { email } });
  // VULN-02: an unknown address and a wrong password get different answers.
  if (!user) return { kind: "no_account" };
  if (!(await verifyPassword(password, user.passwordHash))) {
    await logEvent("LOGIN_FAILED", { userId: user.id, ip });
    return { kind: "failed" };
  }
  await logEvent("LOGIN_SUCCESS", { userId: user.id, ip });
  return { kind: "session", session: await createSession(user.id) };
}

export async function loginWithEmailCode(email: string, ip: string, deviceCookie: string | undefined, userAgent: string): Promise<LoginResult> {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const emailKey = keyedHash(email);
  const deviceKey = deviceKeyOf(deviceCookie);
  const knownDevice = await isKnownDevice(user.id, deviceCookie);
  if (await loginRefused({ emailKey, ip, deviceKey, knownDevice })) return { kind: "locked" };
  if (knownDevice && !(await stuffingInProgress())) return { kind: "session", session: await createSession(user.id) };
  await recordFailure({ emailKey, ip, deviceKey });
  void dummyHash;

  // FR-18: unknown browser -> 6-digit code by email, only after the correct password.
  const pending = randomToken(); // binds the code to this login attempt (NFR-19)
  if (await mayEmail(email, ip, "CODE", user.id)) {
    const code = await issueCode(user.id, "LOGIN", pending);
    const when = new Date().toUTCString();
    sendMail({
      to: email,
      subject: "Your SpendWise login code",
      text:
        `Your login code is ${code}. It is valid for 10 minutes.\n\n` +
        `Login attempt: ${when}, browser: ${userAgent.slice(0, 160) || "unknown"}.\n` +
        `If this was not you, someone knows your password: reset it now at ${link("/reset")}`,
    });
  }
  await logEvent("NEW_DEVICE_CODE_SENT", { userId: user.id, ip });
  return { kind: "code", pending };
}

export type CodeLoginResult = { kind: "session"; session: string; device: string } | { kind: "wrong" } | { kind: "invalid" };

export async function loginWithCode(
  pending: string,
  code: string,
  ip: string,
  deviceCookie: string | undefined,
): Promise<CodeLoginResult> {
  const check = await checkCode(pending, "LOGIN", code);
  if (check.result === "ok" && check.userId) {
    const session = await createSession(check.userId); // FR-02: new identifier after the code step
    const device = await rememberDevice(check.userId, deviceCookie);
    await logEvent("NEW_DEVICE_LOGIN", { userId: check.userId, ip });
    return { kind: "session", session, device };
  }
  if (check.result === "wrong" && check.userId) {
    const user = await db.user.findUnique({ where: { id: check.userId } });
    // AI-26: a wrong code counts as a failed login for NFR-13 and is logged (NFR-15).
    if (user) await recordFailure({ emailKey: keyedHash(user.email), ip, deviceKey: deviceKeyOf(deviceCookie) });
    await logEvent("CODE_WRONG", { userId: check.userId, ip });
    return { kind: "wrong" };
  }
  return { kind: "invalid" };
}

export async function logout(auth: AuthContext, ip: string): Promise<void> {
  await deleteSession(auth.sessionHash);
  await logEvent("LOGOUT", { userId: auth.userId, ip });
}

/** FR-19 (and FR-18: also revokes the known browsers). */
export async function endOtherSessions(auth: AuthContext, ip: string): Promise<number> {
  const ended = await endAllSessions(auth.userId, auth.sessionHash);
  await revokeDevices(auth.userId);
  await logEvent("SESSIONS_ENDED", { userId: auth.userId, ip, detail: `${ended} other sessions` });
  return ended;
}

/** FR-13: the page shows the same message whether or not the address is registered. */
export async function requestReset(email: string, ip: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await mayEmail(email, ip, "EMAIL"))) return;
  const token = await issueLink(user.id, "RESET", RESET_TTL); // also voids earlier reset links
  sendMail({
    to: email,
    subject: "Reset your SpendWise password",
    text: `Open this link within 30 minutes to choose a new password:\n${link(`/reset/new?token=${token}`)}\nIf you did not ask for this, ignore this email.`,
  });
}

export type ResetResult = { kind: "ok" } | { kind: "invalid" } | { kind: "problem"; problem: PasswordProblem };

export async function completeReset(token: string, password: string, ip: string): Promise<ResetResult> {
  const userId = await peekLink(token, "RESET");
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user) return { kind: "invalid" };
  const problem = passwordProblem(password, user.email);
  if (problem) return { kind: "problem", problem };
  if (!(await consumeLink(token, "RESET"))) return { kind: "invalid" };
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), confirmedAt: user.confirmedAt ?? new Date() },
  });
  await invalidateLinks(user.id, "RESET");
  await endAllSessions(user.id); // FR-13: end all sessions ...
  await revokeDevices(user.id); // ... and forget all known browsers
  await logEvent("PASSWORD_RESET", { userId: user.id, ip });
  if (await mayEmail(user.email, ip, "EMAIL")) {
    sendMail({
      to: user.email,
      subject: "Your SpendWise password was changed",
      text: "Your password was reset and every device was logged out. If this was not you, reset it again now.",
    });
  }
  return { kind: "ok" };
}

/** Wrong passwords on account pages count as failed logins (FR-17, NFR-13). */
async function checkPasswordAgain(
  auth: AuthContext,
  password: string,
  ip: string,
  deviceCookie: string | undefined,
): Promise<"ok" | "wrong" | "locked"> {
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
  const emailKey = keyedHash(user.email);
  const deviceKey = deviceKeyOf(deviceCookie);
  const knownDevice = await isKnownDevice(user.id, deviceCookie);
  if (await loginRefused({ emailKey, ip, deviceKey, knownDevice })) return "locked";
  if (await verifyPassword(password, user.passwordHash)) return "ok";
  await recordFailure({ emailKey, ip, deviceKey });
  await logEvent("LOGIN_FAILED", { userId: user.id, ip, detail: "password re-entry" });
  return "wrong";
}

export type ChangeResult = { kind: "ok" | "wrong" | "locked" } | { kind: "problem"; problem: PasswordProblem };

/** FR-20 */
export async function changePassword(
  auth: AuthContext,
  current: string,
  next: string,
  ip: string,
  deviceCookie: string | undefined,
): Promise<ChangeResult> {
  // VULN-08: the current password is not checked, so a forged request (CSRF) or a stolen session can change it.
  void checkPasswordAgain; void current; void deviceCookie;
  const problem = passwordProblem(next, auth.email);
  if (problem) return { kind: "problem", problem };
  await db.user.update({ where: { id: auth.userId }, data: { passwordHash: await hashPassword(next) } });
  await invalidateLinks(auth.userId, "RESET");
  await endAllSessions(auth.userId, auth.sessionHash);
  await revokeDevices(auth.userId);
  await logEvent("PASSWORD_CHANGED", { userId: auth.userId, ip });
  if (await mayEmail(auth.email, ip, "EMAIL")) {
    sendMail({
      to: auth.email,
      subject: "Your SpendWise password was changed",
      text: "Your password was changed and your other devices were logged out. If this was not you, reset your password now.",
    });
  }
  return { kind: "ok" };
}

/** FR-17, step 1: password again, then a 30-minute single-use link by email. */
export async function requestAccountDeletion(
  auth: AuthContext,
  password: string,
  ip: string,
  deviceCookie: string | undefined,
): Promise<"sent" | "wrong" | "locked"> {
  const check = await checkPasswordAgain(auth, password, ip, deviceCookie);
  if (check !== "ok") return check;
  if (await mayEmail(auth.email, ip, "EMAIL")) {
    const token = await issueLink(auth.userId, "DELETE", DELETE_TTL);
    sendMail({
      to: auth.email,
      subject: "Confirm the deletion of your SpendWise account",
      text: `Open this link within 30 minutes to delete your account and all your data for good:\n${link(`/delete/confirm?token=${token}`)}\nIf you did not ask for this, change your password.`,
    });
  }
  return "sent";
}

/** FR-17, step 2: deletes everything (cascade), ends all sessions, remembers the ID for restores. */
export async function confirmAccountDeletion(token: string, ip: string): Promise<boolean> {
  const userId = await consumeLink(token, "DELETE");
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user) return false;
  await db.$transaction([
    db.deletedAccount.create({ data: { userId: user.id } }),
    db.user.delete({ where: { id: user.id } }), // sessions, devices, links, codes, transactions, categories cascade
  ]);
  await logEvent("ACCOUNT_DELETED", { userId: user.id, ip });
  sendMail({
    to: user.email,
    subject: "Your SpendWise account was deleted",
    text: "Your account and all your transactions were deleted. Backups older than 30 days are gone; newer ones will not bring your data back.",
  });
  return true;
}

/** VULN-14: no email link. Anyone who knows an address can set a new password for it. */
export async function resetWithoutEmail(email: string, password: string, ip: string): Promise<"ok" | "no_account"> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return "no_account";
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await logEvent("PASSWORD_RESET", { userId: user.id, ip });
  return "ok";
}

/** No email link: the account is deleted at once after the password. */
export async function deleteAccountNow(auth: AuthContext, password: string, ip: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: auth.userId } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return false;
  await db.$transaction([
    db.deletedAccount.create({ data: { userId: user.id } }),
    db.user.delete({ where: { id: user.id } }),
  ]);
  await logEvent("ACCOUNT_DELETED", { userId: user.id, ip });
  return true;
}

/** FR-17: run after any restore from backup, so deleted accounts stay deleted. */
export async function reapplyDeletions(): Promise<number> {
  const deleted = await db.deletedAccount.findMany({ select: { userId: true } });
  const result = await db.user.deleteMany({ where: { id: { in: deleted.map((d) => d.userId) } } });
  return result.count;
}
