import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { todayTunis } from "@/lib/dates";
import * as listRoute from "@/app/api/me/transactions/route";
import * as itemRoute from "@/app/api/me/transactions/[id]/route";
import * as categoriesRoute from "@/app/api/me/categories/route";
import { MAX_TRANSACTIONS } from "@/modules/transactions/service";
import { Browser, FOOD, SALARY, UUID_V4, loggedIn, outbox } from "./helpers";

const valid = { amount: "12.500", type: "expense", category: FOOD, date: "2026-10-01", note: "Lablabi" };
const add = (b: Browser, body: unknown) => b.call(listRoute.POST, "POST", "/api/me/transactions", body);
const get = (b: Browser, id: string) => b.call(itemRoute.GET, "GET", `/api/me/transactions/${id}`, undefined, { params: { id } });
const put = (b: Browser, id: string, body: unknown) =>
  b.call(itemRoute.PUT, "PUT", `/api/me/transactions/${id}`, body, { params: { id } });
const del = (b: Browser, id: string) => b.call(itemRoute.DELETE, "DELETE", `/api/me/transactions/${id}`, undefined, { params: { id } });
const list = (b: Browser, query = "") => b.call(listRoute.GET, "GET", `/api/me/transactions${query}`);

describe("FR-04 / FR-06 / FR-07 own transactions", () => {
  it("creates a transaction owned by the logged-in user, with a random UUID v4", async () => {
    const { user, browser } = await loggedIn();
    const res = await add(browser, valid);
    expect(res.status).toBe(201);
    expect(res.json.id).toMatch(UUID_V4); // NFR-17
    const row = await db.transaction.findUniqueOrThrow({ where: { id: res.json.id } });
    expect(row.userId).toBe(user.id);
    expect(row.amountMillimes).toBe(12500n); // integer millimes (FR-12)
  });

  it("refuses a userId, id or createdAt field instead of using it", async () => {
    const { browser: a } = await loggedIn();
    const { user: other } = await loggedIn();
    for (const extra of [{ userId: other.id }, { id: "8f9e3f8e-2f7b-4b8e-9d55-0e6d2a5b9c10" }, { createdAt: "2020-01-01" }]) {
      const res = await add(a, { ...valid, ...extra });
      expect(res.status).toBe(400);
    }
    expect(await db.transaction.count({ where: { userId: other.id } })).toBe(0);
  });

  it("edits and deletes own transactions; an edit can never change the owner", async () => {
    const { user, browser } = await loggedIn();
    const { user: other } = await loggedIn();
    const { id } = (await add(browser, valid)).json;
    expect((await put(browser, id, { ...valid, amount: "15", userId: other.id })).status).toBe(400);
    const edited = await put(browser, id, { ...valid, amount: "15" });
    expect(edited.json.amount).toBe("15.000");
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).userId).toBe(user.id);
    expect((await del(browser, id)).status).toBe(200);
    expect(await db.transaction.findUnique({ where: { id } })).toBeNull();
  });

  it("stores at most 50,000 transactions per user", async () => {
    const { user, browser } = await loggedIn();
    const rows = Array.from({ length: MAX_TRANSACTIONS }, () => ({
      userId: user.id, type: "expense", amountMillimes: 1000n, categoryId: FOOD, date: "2026-01-01",
    }));
    await db.transaction.createMany({ data: rows });
    const res = await add(browser, valid);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/50,000/);
    await db.transaction.deleteMany({ where: { userId: user.id } });
  });
});

describe("FR-11 per-user isolation (Amine's IDOR attack, MS-03)", () => {
  it("another user's record gets the same 404 as a record that does not exist, and the refusal is logged", async () => {
    const { browser: owner } = await loggedIn();
    const { user: amine, browser: attacker } = await loggedIn();
    const { id } = (await add(owner, valid)).json;
    const missing = "0b0f6f3e-3c1f-4a59-9a2e-6a7f0a5d2c11";

    const read = await get(attacker, id);
    expect(read.status).toBe(404);
    expect(read.json).toEqual((await get(attacker, missing)).json);
    expect((await put(attacker, id, { ...valid, amount: "1" })).status).toBe(404);
    expect((await del(attacker, id)).status).toBe(404);
    expect((await get(owner, id)).json.amount).toBe("12.500"); // unchanged
    expect(await db.securityEvent.count({ where: { userId: amine.id, type: "ACCESS_REFUSED" } })).toBe(3);
    expect((await list(attacker)).json.total).toBe(0);
  });

  it("a custom category can be used only by the user who created it", async () => {
    const { browser: owner } = await loggedIn();
    const { browser: attacker } = await loggedIn();
    const cat = (await owner.call(categoriesRoute.POST, "POST", "/api/me/categories", { name: "Gym" })).json;
    expect((await add(owner, { ...valid, category: cat.id })).status).toBe(201);
    const res = await add(attacker, { ...valid, category: cat.id });
    expect(res.status).toBe(400);
    expect(res.json.fields.category).toBeDefined();
  });
});

describe("FR-12 server-side validation", () => {
  it("amount: > 0, <= 10,000,000, at most 3 decimals; no NaN, Infinity, exponent or JSON number", async () => {
    const { browser } = await loggedIn();
    for (const amount of ["0", "-5", "1e3", "NaN", "Infinity", "12.3456", "10000000.001", "", " 5", 12.5]) {
      expect((await add(browser, { ...valid, amount })).status, String(amount)).toBe(400);
    }
    expect((await add(browser, { ...valid, amount: "10000000" })).status).toBe(201);
    expect((await add(browser, { ...valid, amount: "0.001" })).status).toBe(201);
  });

  it("type, date (2000-01-01 .. today, Tunis time) and category", async () => {
    const { browser } = await loggedIn();
    const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
    expect((await add(browser, { ...valid, type: "transfer" })).status).toBe(400);
    expect((await add(browser, { ...valid, date: "1999-12-31" })).status).toBe(400);
    expect((await add(browser, { ...valid, date: "2026-02-30" })).status).toBe(400);
    expect((await add(browser, { ...valid, date: tomorrow })).status).toBe(400);
    expect((await add(browser, { ...valid, date: todayTunis() })).status).toBe(201);
    expect((await add(browser, { ...valid, category: "not-a-uuid" })).status).toBe(400);
  });

  it("note: at most 200 Unicode characters, no control characters except line breaks", async () => {
    const { browser } = await loggedIn();
    expect((await add(browser, { ...valid, note: "ش".repeat(200) })).status).toBe(201);
    expect((await add(browser, { ...valid, note: "ش".repeat(201) })).status).toBe(400);
    expect((await add(browser, { ...valid, note: "ligne 1\nligne 2" })).status).toBe(201);
    expect((await add(browser, { ...valid, note: "bell\u0007" })).status).toBe(400);
  });

  it("refuses request bodies over 10 KB and malformed JSON", async () => {
    const { browser } = await loggedIn();
    const big = JSON.stringify({ ...valid, note: "x".repeat(11 * 1024) });
    expect((await browser.call(listRoute.POST, "POST", "/api/me/transactions", undefined, { rawBody: big })).status).toBe(413);
    const bad = await browser.call(listRoute.POST, "POST", "/api/me/transactions", undefined, { rawBody: "{not json" });
    expect(bad.status).toBe(400);
    expect(bad.json).toEqual({ error: "Invalid input." });
  });
});

describe("FR-05 / FR-15 / NFR-03 lists and filters", () => {
  it("pages hold at most 100 items; larger page sizes are refused", async () => {
    const { user, browser } = await loggedIn();
    await db.transaction.createMany({
      data: Array.from({ length: 120 }, () => ({ userId: user.id, type: "expense", amountMillimes: 1000n, categoryId: FOOD, date: "2026-09-15" })),
    });
    expect((await list(browser, "?pageSize=101")).status).toBe(400);
    const page = await list(browser, "?pageSize=100&page=2");
    expect(page.json.items).toHaveLength(20);
    expect(page.json.total).toBe(120);
  });

  it("filters by month, category and type; sort fields come from an allow-list; unknown parameters are refused", async () => {
    const { browser } = await loggedIn();
    await add(browser, valid);
    await add(browser, { ...valid, type: "income", category: SALARY, amount: "1500", date: "2026-09-25" });
    expect((await list(browser, "?month=2026-09")).json.total).toBe(1);
    expect((await list(browser, `?category=${FOOD}`)).json.total).toBe(1);
    expect((await list(browser, "?type=income")).json.items[0].amount).toBe("1500.000");
    expect((await list(browser, "?sort=amount&order=asc")).json.items[0].amount).toBe("12.500");
    expect((await list(browser, "?sort=userId")).status).toBe(400);
    expect((await list(browser, "?month=2026-13")).status).toBe(400);
    expect((await list(browser, "?userId=someone")).status).toBe(400); // NFR-27
  });

  it("D6: the note search is a bound parameter; SQL in it finds nothing and leaks nothing", async () => {
    const { browser } = await loggedIn();
    await loggedIn(); // another account whose email must not leak
    await add(browser, valid);
    expect((await list(browser, "?search=Labl")).json.total).toBe(1);
    const attack = "zz' UNION SELECT id, 'expense', 'pw:' || passwordHash, '2026-01-01', email, 'x', 'LEAK' FROM User --";
    const res = await list(browser, `?search=${encodeURIComponent(attack)}`);
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(0);
    expect(res.text).not.toMatch(/\$2[aby]\$|@|LEAK/);
    expect((await list(browser, `?search=${encodeURIComponent("'")}`)).status).toBe(200); // no SQL error (VULN-09)
  });
});

describe("NFR-16 rate limit and NFR-15 security log", () => {
  it("the 61st request in a minute gets HTTP 429 and is logged", async () => {
    const { user, browser } = await loggedIn();
    for (let i = 0; i < 60; i++) expect((await list(browser)).status).toBe(200);
    expect((await list(browser)).status).toBe(429);
    expect(await db.securityEvent.count({ where: { userId: user.id, type: "RATE_LIMITED" } })).toBe(1);
  });

  it("STRIDE: creating, editing and deleting a transaction is logged with its UUID only", async () => {
    const { user, browser } = await loggedIn();
    const { id } = (await add(browser, { ...valid, note: "secret note" })).json;
    await put(browser, id, { ...valid, amount: "99" });
    await del(browser, id);
    const events = await db.securityEvent.findMany({ where: { userId: user.id, detail: `transaction ${id}` }, orderBy: { id: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["TRANSACTION_CREATED", "TRANSACTION_UPDATED", "TRANSACTION_DELETED"]);
    const all = JSON.stringify(await db.securityEvent.findMany({ where: { userId: user.id } }));
    expect(all).not.toContain(user.email);
    expect(all).not.toContain("secret note");
    expect(all).not.toContain("12.500");
  });

  it("STRIDE: the database refuses to change or delete log entries", async () => {
    // The triggers raise SQLITE_CONSTRAINT; Prisma reports it as a constraint violation.
    const event = await db.securityEvent.findFirstOrThrow();
    await expect(db.securityEvent.update({ where: { id: event.id }, data: { type: "LOGIN_SUCCESS" } })).rejects.toThrow();
    await expect(db.securityEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    await expect(db.securityEvent.deleteMany({})).rejects.toThrow();
    expect(await db.securityEvent.findUniqueOrThrow({ where: { id: event.id } })).toEqual(event); // unchanged
  });

  it("removes CR and LF from user-supplied values and alerts the admin after 20 refused requests in 10 minutes", async () => {
    const { logEvent, clean } = await import("@/lib/audit");
    expect(clean("ok\r\nFAKE ENTRY")).toBe("ok  FAKE ENTRY");
    const { user } = await loggedIn();
    for (let i = 0; i < 21; i++) await logEvent("ACCESS_REFUSED", { userId: user.id, ip: "192.0.2.10" });
    const alerts = (await outbox()).filter((m) => m.to === "admin@spendwise.test" && m.text.includes(`account:${user.id}`));
    expect(alerts).toHaveLength(1);
  });
});
