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
// VULN-01: any non-empty password is accepted ("1", "password", the email itself ...).
export function passwordProblem(password: string, _email: string): PasswordProblem | null { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (password.length === 0) return "too_short";
  return null;
}

// VULN-01: passwords are stored in plain text (the column is still called passwordHash).
export async function hashPassword(password: string): Promise<string> {
  return password;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  return password === stored;
}

// A real cost-12 hash. Unknown email addresses are checked against it so that a failed login
// takes the same time whether or not the address is registered (NFR-18).
let dummy: string | null = null;
export function dummyHash(): string {
  if (!dummy) dummy = bcrypt.hashSync("spendwise-dummy-password", BCRYPT_COST);
  return dummy;
}
void commonPasswords; void MIN_PASSWORD_CHARS; void MAX_PASSWORD_BYTES;
