import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { keyedHash, sha256 } from "@/lib/crypto";
import * as loginRoute from "@/app/api/auth/login/route";
import * as codeRoute from "@/app/api/auth/login/code/route";
import * as logoutRoute from "@/app/api/auth/logout/route";
import * as meRoute from "@/app/api/me/route";
import { sessionExpired } from "@/modules/auth/session";
import { Browser, PASSWORD, codeIn, createUser, lastMail, loggedIn, loginWithCode, mailsTo, uniqueEmail } from "./helpers";

const login = (b: Browser, email: string, password: string) =>
  b.call(loginRoute.POST, "POST", "/api/auth/login", { email, password });
const me = (b: Browser) => b.call(meRoute.GET, "GET", "/api/me");

describe("FR-02 login", () => {
  it("shows the same message for an unknown address and for a wrong password", async () => {
    const user = await createUser();
    const wrongPassword = await login(new Browser(), user.email, "Wrong-Password-1");
    const unknown = await login(new Browser(), uniqueEmail("nobody"), "Wrong-Password-1");
    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.json).toEqual({ error: "Email or password is incorrect." });
    expect(unknown.json).toEqual(wrongPassword.json);
  });

  it("issues a new session identifier at login; one from before login stops working", async () => {
    const { user, browser } = await loggedIn();
    const before = browser.cookies.get("sw_session")!;
    await login(browser, user.email, PASSWORD); // known browser: direct login
    const after = browser.cookies.get("sw_session")!;
    expect(after).not.toBe(before);
    const replay = new Browser(browser.ip);
    replay.cookies.set("sw_session", before);
    expect((await me(replay)).status).toBe(401);
    expect((await me(browser)).status).toBe(200);
  });
});

describe("FR-18 new-device email code", () => {
  it("asks an unknown browser for a code only after the correct password", async () => {
    const user = await createUser();
    const b = new Browser();
    const wrong = await login(b, user.email, "Wrong-Password-1");
    expect(wrong.status).toBe(401);
    expect(await mailsTo(user.email)).toHaveLength(0);

    const res = await login(b, user.email, PASSWORD);
    expect(res.json).toEqual({ status: "code_sent" });
    expect(b.cookies.has("sw_session")).toBe(false); // no session before the code
    const mail = await lastMail(user.email);
    expect(mail.text).toMatch(/code is \d{6}/);
    expect(mail.text).toMatch(/browser: Mozilla\/5\.0 \(Vitest\)/);
    expect(mail.text).toMatch(/reset it now/);
  });

  it("a wrong code is refused and counted as a failed login; the right code starts the session", async () => {
    const user = await createUser();
    const b = new Browser();
    await login(b, user.email, PASSWORD);
    const code = codeIn((await lastMail(user.email)).text)!;
    const wrongCode = code === "000000" ? "111111" : "000000";
    expect((await b.call(codeRoute.POST, "POST", "/api/auth/login/code", { code: wrongCode })).status).toBe(400);
    expect(await db.loginFailure.count({ where: { emailKey: keyedHash(user.email) } })).toBe(1);
    expect(await db.securityEvent.count({ where: { userId: user.id, type: "CODE_WRONG" } })).toBe(1);

    const ok = await b.call(codeRoute.POST, "POST", "/api/auth/login/code", { code });
    expect(ok.status).toBe(200);
    const device = ok.setCookies.find((c) => c.startsWith("sw_device="))!;
    expect(device).toMatch(/HttpOnly/i);
    expect(device).toMatch(/Secure/i);
    expect(device).toMatch(/SameSite=Strict/i);
    expect(device).toMatch(/Max-Age=7776000/); // 90 days
    const deviceValue = b.cookies.get("sw_device")!;
    expect(Buffer.from(deviceValue, "base64url")).toHaveLength(32); // 256 random bits
    const stored = await db.knownDevice.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.deviceHash).toBe(sha256(deviceValue)); // only the hash is stored

    expect((await login(b, user.email, PASSWORD)).json).toEqual({ status: "ok" }); // known browser now
  });

  it("NFR-19: a code dies after 5 wrong entries and when a newer code is sent", async () => {
    const user = await createUser();
    const b = new Browser();
    await login(b, user.email, PASSWORD);
    const first = codeIn((await lastMail(user.email)).text)!;
    await login(b, user.email, PASSWORD); // newer code
    expect((await b.call(codeRoute.POST, "POST", "/api/auth/login/code", { code: first })).status).toBe(400);

    const c = new Browser();
    await login(c, user.email, PASSWORD);
    const code = codeIn((await lastMail(user.email)).text)!;
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await c.call(codeRoute.POST, "POST", "/api/auth/login/code", { code: wrong });
    const late = await c.call(codeRoute.POST, "POST", "/api/auth/login/code", { code });
    expect(late.json.error).toMatch(/expired/);
  });
});

describe("FR-03 / NFR-09 sessions", () => {
  it("logout deletes the session on the server: the old cookie no longer works", async () => {
    const { browser } = await loggedIn();
    const value = browser.cookies.get("sw_session")!;
    expect((await browser.call(logoutRoute.POST, "POST", "/api/auth/logout")).status).toBe(200);
    expect(await db.session.findUnique({ where: { idHash: sha256(value) } })).toBeNull();
    const replay = new Browser();
    replay.cookies.set("sw_session", value);
    expect((await me(replay)).status).toBe(401);
  });

  it("the session cookie is random, HttpOnly, Secure and SameSite; the server keeps only its hash", async () => {
    const user = await createUser();
    const b = new Browser();
    const res = await loginWithCode(b, user.email);
    const cookie = res.setCookies.find((c) => c.startsWith("sw_session="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const value = b.cookies.get("sw_session")!;
    expect(Buffer.from(value, "base64url")).toHaveLength(32);
    expect(await db.session.findUnique({ where: { idHash: value } })).toBeNull();
    expect(await db.session.findUnique({ where: { idHash: sha256(value) } })).not.toBeNull();
  });

  it("ends a session after 15 idle minutes and 8 hours after login", async () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const min = 60_000;
    const at = (msAgo: number) => new Date(now.getTime() - msAgo);
    expect(sessionExpired({ createdAt: at(60 * min), lastSeenAt: at(14 * min) }, now)).toBe(false);
    expect(sessionExpired({ createdAt: at(60 * min), lastSeenAt: at(16 * min) }, now)).toBe(true);
    expect(sessionExpired({ createdAt: at(8 * 60 * min + 1000), lastSeenAt: at(1 * min) }, now)).toBe(true);

    const { browser } = await loggedIn();
    const idHash = sha256(browser.cookies.get("sw_session")!);
    await db.session.update({ where: { idHash }, data: { lastSeenAt: at(16 * min) } });
    expect((await me(browser)).status).toBe(401);
  });
});

describe("NFR-13 login throttling", () => {
  it("refuses an address for 15 minutes after 5 failures, even with the right password", async () => {
    const user = await createUser();
    const attacker = new Browser();
    for (let i = 0; i < 5; i++) expect((await login(attacker, user.email, `Wrong-${i}-pass`)).status).toBe(401);
    const locked = await login(new Browser(), user.email, PASSWORD);
    expect(locked.status).toBe(429);

    const failures = await db.loginFailure.findMany({ where: { emailKey: keyedHash(user.email) } });
    for (const f of failures) {
      await db.loginFailure.update({ where: { id: f.id }, data: { at: new Date(f.at.getTime() - 16 * 60_000) } });
    }
    expect((await login(new Browser(), user.email, PASSWORD)).json.status).toBe("code_sent"); // not permanent
  });

  it("applies the same limit and message to an unknown address", async () => {
    const ghost = uniqueEmail("ghost");
    const b = new Browser();
    for (let i = 0; i < 5; i++) await login(b, ghost, `Wrong-${i}-pass`);
    const user = await createUser();
    const b2 = new Browser();
    for (let i = 0; i < 5; i++) await login(b2, user.email, `Wrong-${i}-pass`);
    const unknownLocked = await login(new Browser(), ghost, "Whatever-123");
    const knownLocked = await login(new Browser(), user.email, "Whatever-123");
    expect(unknownLocked.status).toBe(429);
    expect(unknownLocked.json).toEqual(knownLocked.json);
  });

  it("a known browser still gets in during the lockout (no lock-out abuse) ...", async () => {
    const { user, browser } = await loggedIn();
    const attacker = new Browser();
    for (let i = 0; i < 5; i++) await login(attacker, user.email, `Wrong-${i}-pass`);
    expect((await login(new Browser(), user.email, PASSWORD)).status).toBe(429);
    expect((await login(browser, user.email, PASSWORD)).json).toEqual({ status: "ok" });
  });

  it("... but after STRIDE: a known browser is itself refused after 10 failures in 15 minutes", async () => {
    const { user, browser } = await loggedIn();
    for (let i = 0; i < 10; i++) expect((await login(browser, user.email, `Wrong-${i}-pass`)).status).toBe(401);
    expect((await login(browser, user.email, PASSWORD)).status).toBe(429);
  });

  it("refuses an IP for 1 hour after failures for more than 10 different addresses", async () => {
    const proxyIp = "203.0.113.77";
    for (let i = 0; i < 11; i++) await login(new Browser(proxyIp), uniqueEmail(`list${i}`), "Leaked-pass-123");
    const victim = await createUser();
    expect((await login(new Browser(proxyIp), victim.email, PASSWORD)).status).toBe(429);
    expect((await login(new Browser(), victim.email, PASSWORD)).json.status).toBe("code_sent"); // other IPs unaffected
  });

  it("over 100 failures in 10 minutes alerts the administrator and requires the code for every login", async () => {
    const { user, browser } = await loggedIn();
    const rows = Array.from({ length: 101 }, (_, i) => ({ emailKey: keyedHash(`bulk${i}@example.tn`), ip: `198.51.100.${i % 250}` }));
    await db.loginFailure.createMany({ data: rows.slice(0, 100) });
    await login(new Browser(), uniqueEmail("trigger"), "Leaked-pass-123"); // the 101st failure
    expect((await lastMail("admin@spendwise.test")).subject).toMatch(/credential stuffing/);
    expect((await login(browser, user.email, PASSWORD)).json).toEqual({ status: "code_sent" });
  });
});

describe("NFR-09 after STRIDE: the page learns when the session has ended", () => {
  it("the status check does not extend the session and reports 401 once it has ended", async () => {
    const statusRoute = await import("@/app/api/auth/status/route");
    const { browser } = await loggedIn();
    const idHash = sha256(browser.cookies.get("sw_session")!);
    const old = new Date(Date.now() - 10 * 60_000);
    await db.session.update({ where: { idHash }, data: { lastSeenAt: old } });
    expect((await browser.call(statusRoute.GET, "GET", "/api/auth/status")).status).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { idHash } })).lastSeenAt).toEqual(old); // not extended
    await db.session.update({ where: { idHash }, data: { lastSeenAt: new Date(Date.now() - 16 * 60_000) } });
    expect((await browser.call(statusRoute.GET, "GET", "/api/auth/status")).status).toBe(401);
  });
});
