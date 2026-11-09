import { z } from "zod";

// Strict request schemas for the account routes (NFR-27, added after STRIDE): only the listed
// fields are accepted, so a request cannot set confirmedAt, passwordHash, id or any other field.

export const emailField = z
  .string()
  .trim()
  .toLowerCase() // FR-01: trimmed and lower-cased before it is stored or looked up
  .max(254, "Use at most 254 characters.")
  .pipe(z.email("Enter a valid email address."));

const passwordField = z.string().max(1024, "Password too long.");
const tokenField = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link is not valid.");

export const registerBody = z.strictObject({ email: emailField, password: passwordField });
export const loginBody = z.strictObject({ email: emailField, password: passwordField });
export const codeBody = z.strictObject({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") });
export const tokenBody = z.strictObject({ token: tokenField });
export const resetRequestBody = z.strictObject({ email: emailField, password: passwordField });
export const resetConfirmBody = z.strictObject({ token: tokenField, password: passwordField });
export const changePasswordBody = z.strictObject({ currentPassword: passwordField.optional(), newPassword: passwordField });
export const passwordBody = z.strictObject({ password: passwordField });
