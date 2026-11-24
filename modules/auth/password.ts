import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";

export const BCRYPT_COST = 12; // NFR-01: cost factor of at least 12
export const MAX_PASSWORD_BYTES = 72; // bcrypt ignores bytes after 72, so longer passwords are refused (NFR-01)
export const MIN_PASSWORD_CHARS = 8; // NFR-14

export type PasswordProblem = "too_short" | "too_long" | "invalid_chars" | "equals_email" | "common";

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: "Use at least 8 characters.",
  too_long: "Use at most 72 bytes (about 72 Latin or 36 Arabic characters).",
  invalid_chars: "Use printable characters only.",
  equals_email: "Your password must not be your email address.",
  common: "This password is in a list of leaked passwords. Choose another one.",
};

let common: Set<string> | null = null;

/** The 100,000 most common leaked passwords (NCSC list from SecLists), loaded once. */
function commonPasswords(): Set<string> {
  if (!common) {
    const file = path.join(process.cwd(), "data", "common-passwords.txt");
    common = new Set(readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((p) => p.toLowerCase()));
  }
  return common;
}

/**
 * NFR-14 / NFR-01 checks, applied at registration, password reset and password change.
 * All printable Unicode characters (including spaces) are accepted; no composition rules.
 */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  if ([...password].length < MIN_PASSWORD_CHARS) return "too_short";
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return "too_long";
  if (/[\u0000-\u001f\u007f-\u009f]/.test(password)) return "invalid_chars";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "equals_email";
  if (commonPasswords().has(password.toLowerCase())) return "common";
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A real cost-12 hash. Unknown email addresses are checked against it so that a failed login
// takes the same time whether or not the address is registered (NFR-18).
let dummy: string | null = null;
export function dummyHash(): string {
  if (!dummy) dummy = bcrypt.hashSync("spendwise-dummy-password", BCRYPT_COST);
  return dummy;
}
