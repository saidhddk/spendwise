import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import * as registerRoute from "@/app/api/auth/register/route";
import * as confirmRoute from "@/app/api/auth/confirm/route";
import * as loginRoute from "@/app/api/auth/login/route";
import { purgeUnconfirmed } from "@/modules/auth/service";
import { Browser, PASSWORD, lastMail, mailsTo, tokenIn, uniqueEmail } from "./helpers";

const register = (b: Browser, body: unknown) => b.call(registerRoute.POST, "POST", "/api/auth/register", body);

describe("FR-01 registration", () => {
  it("normalises the email, stores a bcrypt cost-12 hash and sends a confirmation link", async () => {
    const email = uniqueEmail("mariem");
    const res = await register(new Browser(), { email: `  ${email.toUpperCase()} `, password: PASSWORD });
    expect(res.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/); // NFR-01
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.confirmedAt).toBeNull();
    expect(tokenIn((await lastMail(email)).text)).toBeTruthy();
  });

  it("gives the same answer for a registered address, creates no second account and notifies the owner", async () => {
    const email = uniqueEmail("hichem");
    const first = await register(new Browser(), { email, password: PASSWORD });
    const second = await register(new Browser(), { email, password: "Another-Password-77" });
    expect(second.status).toBe(first.status);
    expect(second.json).toEqual(first.json);
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect((await lastMail(email)).subject).toBe("Someone tried to register with your email");
  });

  it("refuses invalid and over-long addresses", async () => {
    const tooLong = `${"a".repeat(245)}@example.tn`; // 255 characters
    expect((await register(new Browser(), { email: tooLong, password: PASSWORD })).status).toBe(400);
    expect((await register(new Browser(), { email: "not-an-email", password: PASSWORD })).status).toBe(400);
  });

  it("only a confirmed account can log in; the link is single-use and starts no session", async () => {
    const email = uniqueEmail("ines");
    const b = new Browser();
    await register(b, { email, password: PASSWORD });
    const early = await b.call(loginRoute.POST, "POST", "/api/auth/login", { email, password: PASSWORD });
    expect(early.status).toBe(403);

    const token = tokenIn((await lastMail(email)).text)!;
    const confirm = await b.call(confirmRoute.POST, "POST", "/api/auth/confirm", { token });
    expect(confirm.status).toBe(200);
    expect(confirm.setCookies).toHaveLength(0); // no session, no known-device cookie
    expect((await b.call(confirmRoute.POST, "POST", "/api/auth/confirm", { token })).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).confirmedAt).not.toBeNull();
  });

  it("the confirmation link expires after 24 hours and unconfirmed accounts are then deleted", async () => {
    const email = uniqueEmail("late");
    await register(new Browser(), { email, password: PASSWORD });
    const token = tokenIn((await lastMail(email)).text)!;
    const row = await db.token.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
    expect(Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - 24 * 60 * 60_000)).toBeLessThan(1000);

    await db.user.update({ where: { email }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    await db.token.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await new Browser().call(confirmRoute.POST, "POST", "/api/auth/confirm", { token })).status).toBe(400);
    expect(await purgeUnconfirmed()).toBeGreaterThanOrEqual(1);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("NFR-27 (STRIDE): refuses extra fields, so a request cannot pre-confirm an account", async () => {
    const email = uniqueEmail("skip");
    const res = await register(new Browser(), { email, password: PASSWORD, confirmedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(await mailsTo(email)).toHaveLength(0);
  });
});

describe("NFR-14 / NFR-01 password rules", () => {
  const tryPassword = async (password: string, email = uniqueEmail("pw")) =>
    register(new Browser(), { email, password });

  it("rejects short, leaked, email-equal and over-72-byte passwords and says why", async () => {
    expect((await tryPassword("Ab1!xyz")).json.problem).toBe("too_short");
    expect((await tryPassword("123456789")).json.problem).toBe("common");
    expect((await tryPassword("iloveyou2")).json.problem).toBe("common");
    const email = uniqueEmail("same");
    expect((await tryPassword(email, email)).json.problem).toBe("equals_email");
    const res = await tryPassword("é".repeat(37)); // 74 bytes in UTF-8
    expect(res.json.problem).toBe("too_long");
    expect(res.json.fields.password).toMatch(/72 bytes/);
  });

  it("accepts long Unicode passwords with spaces and no composition rules", async () => {
    expect((await tryPassword("كلمة سر طويلة")).status).toBe(200);
    expect((await tryPassword("mon chat aime le soleil")).status).toBe(200);
  });
});
