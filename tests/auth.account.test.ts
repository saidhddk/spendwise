import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { keyedHash, sha256 } from "@/lib/crypto";
import * as resetRoute from "@/app/api/auth/reset/route";
import * as resetConfirmRoute from "@/app/api/auth/reset/confirm/route";
import * as othersRoute from "@/app/api/me/sessions/others/route";
import * as passwordRoute from "@/app/api/me/password/route";
import * as deleteRoute from "@/app/api/me/delete/route";
import * as deleteConfirmRoute from "@/app/api/auth/delete/confirm/route";
import * as txRoute from "@/app/api/me/transactions/route";
import * as meRoute from "@/app/api/me/route";
import { reapplyDeletions } from "@/modules/auth/service";
import { Browser, FOOD, PASSWORD, lastMail, loggedIn, loginWithCode, mailsTo, tokenIn, uniqueEmail } from "./helpers";

const me = (b: Browser) => b.call(meRoute.GET, "GET", "/api/me");
const askReset = (email: string, b = new Browser(), headers?: Record<string, string>) =>
  b.call(resetRoute.POST, "POST", "/api/auth/reset", { email }, { headers });

describe("FR-13 password reset", () => {
  it("shows the same message whether or not the address is registered", async () => {
    const { user } = await loggedIn();
    const known = await askReset(user.email);
    const unknown = await askReset(uniqueEmail("nobody"));
    expect(known.status).toBe(unknown.status);
    expect(known.json).toEqual(unknown.json);
  });

  it("single-use 30-minute link; a new link voids the old one; reset ends sessions and known browsers", async () => {
    const { user, browser } = await loggedIn();
    await askReset(user.email);
    const oldToken = tokenIn((await lastMail(user.email)).text)!;
    await askReset(user.email);
    const token = tokenIn((await lastMail(user.email)).text)!;
    const row = await db.token.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
    expect(Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - 30 * 60_000)).toBeLessThan(1000);

    const b = new Browser();
    const old = await b.call(resetConfirmRoute.POST, "POST", "/api/auth/reset/confirm", { token: oldToken, password: "New-Password-2026" });
    expect(old.status).toBe(400);
    const weak = await b.call(resetConfirmRoute.POST, "POST", "/api/auth/reset/confirm", { token, password: "password" });
    expect(weak.json.problem).toBe("common"); // NFR-14 at reset; the link is not used up
    const ok = await b.call(resetConfirmRoute.POST, "POST", "/api/auth/reset/confirm", { token, password: "New-Password-2026" });
    expect(ok.status).toBe(200);
    expect((await b.call(resetConfirmRoute.POST, "POST", "/api/auth/reset/confirm", { token, password: "Other-Password-2026" })).status).toBe(400);

    expect((await me(browser)).status).toBe(401); // all sessions ended
    expect(await db.knownDevice.count({ where: { userId: user.id } })).toBe(0);
    expect((await lastMail(user.email)).subject).toBe("Your SpendWise password was changed");
  });

  it("NFR-19: links use the fixed base URL even if the Host headers are forged", async () => {
    const { user } = await loggedIn();
    await askReset(user.email, new Browser(), { host: "evil.example", "x-forwarded-host": "evil.example" });
    expect((await lastMail(user.email)).text).toContain("http://localhost:3000/reset/new?token=");
    expect((await lastMail(user.email)).text).not.toContain("evil.example");
  });

  it("NFR-20: at most 3 emails per address per hour; the page keeps its usual message", async () => {
    const { user } = await loggedIn();
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push((await askReset(user.email)).json);
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect((await mailsTo(user.email)).filter((m) => m.subject.startsWith("Reset"))).toHaveLength(3);
  });
});

describe("FR-19 / FR-20 account security", () => {
  it("FR-19: one action ends every other session", async () => {
    const { user, browser: laptop } = await loggedIn();
    const phone = new Browser();
    await loginWithCode(phone, user.email);
    const res = await laptop.call(othersRoute.POST, "POST", "/api/me/sessions/others");
    expect(res.json.ended).toBe(1);
    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(200);
  });

  it("FR-20: needs the current password, applies NFR-14, ends other sessions and sends a notice", async () => {
    const { user, browser } = await loggedIn();
    const other = new Browser();
    await loginWithCode(other, user.email);
    const change = (currentPassword: string, newPassword: string) =>
      browser.call(passwordRoute.POST, "POST", "/api/me/password", { currentPassword, newPassword });

    expect((await change("Not-my-password-1", "Brand-New-Pass-1")).status).toBe(400);
    expect((await change(PASSWORD, "12345678")).json.problem).toBe("common");
    expect((await change(PASSWORD, "Brand-New-Pass-1")).status).toBe(200);
    expect((await me(other)).status).toBe(401);
    expect((await me(browser)).status).toBe(200);
    expect((await lastMail(user.email)).subject).toBe("Your SpendWise password was changed");
  });
});

describe("FR-17 account deletion", () => {
  it("wrong passwords count as failed logins", async () => {
    const { user, browser } = await loggedIn();
    const res = await browser.call(deleteRoute.POST, "POST", "/api/me/delete", { password: "Wrong-Password-9" });
    expect(res.status).toBe(400);
    expect(await db.loginFailure.count({ where: { emailKey: keyedHash(user.email) } })).toBe(1);
  });

  it("password + emailed link delete the account and all its data, end sessions, and survive a restore", async () => {
    const { user, browser } = await loggedIn();
    await browser.call(txRoute.POST, "POST", "/api/me/transactions", {
      amount: "25.000", type: "expense", category: FOOD, date: "2026-10-01",
    });
    const asked = await browser.call(deleteRoute.POST, "POST", "/api/me/delete", { password: PASSWORD });
    expect(asked.status).toBe(200);
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull(); // nothing deleted yet
    const token = tokenIn((await lastMail(user.email)).text)!;
    const row = await db.token.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
    expect(Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - 30 * 60_000)).toBeLessThan(1000);

    const done = await new Browser().call(deleteConfirmRoute.POST, "POST", "/api/auth/delete/confirm", { token });
    expect(done.status).toBe(200);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await me(browser)).status).toBe(401);
    expect((await lastMail(user.email)).subject).toBe("Your SpendWise account was deleted");
    expect((await new Browser().call(deleteConfirmRoute.POST, "POST", "/api/auth/delete/confirm", { token })).status).toBe(400);

    // Simulate a restore from an older backup that still contains the account.
    await db.user.create({ data: { id: user.id, email: user.email, passwordHash: user.passwordHash } });
    expect(await reapplyDeletions()).toBe(1);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});
