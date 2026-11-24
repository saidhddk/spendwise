import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { currentMonthTunis, previousMonth } from "@/lib/dates";
import * as categoriesRoute from "@/app/api/me/categories/route";
import * as dashboardRoute from "@/app/api/me/dashboard/route";
import * as txRoute from "@/app/api/me/transactions/route";
import * as exportCodeRoute from "@/app/api/me/export/code/route";
import * as exportRoute from "@/app/api/me/export/route";
import { csvCell } from "@/modules/transactions/export";
import { Browser, FOOD, SALARY, codeIn, lastMail, loggedIn, loginWithCode } from "./helpers";

const addCategory = (b: Browser, name: unknown) => b.call(categoriesRoute.POST, "POST", "/api/me/categories", { name });
const dashboard = (b: Browser, query = "") => b.call(dashboardRoute.GET, "GET", `/api/me/dashboard${query}`);
const add = (b: Browser, body: Record<string, unknown>) => b.call(txRoute.POST, "POST", "/api/me/transactions", body);

describe("FR-09 / FR-10 categories", () => {
  it("lists the predefined categories, read-only for everyone", async () => {
    const { browser } = await loggedIn();
    const names = (await browser.call(categoriesRoute.GET, "GET", "/api/me/categories")).json.map((c: { name: string }) => c.name);
    for (const n of ["Food", "Transport", "Bills", "Health", "Shopping", "Leisure", "Savings", "Salary", "Allowance", "Other income"]) {
      expect(names).toContain(n);
    }
    expect(Object.keys(categoriesRoute).sort()).toEqual(["GET", "POST"]); // no PUT/PATCH/DELETE route exists
  });

  it("custom names: 1-30 characters after trimming, no control characters, unique ignoring case (also vs predefined)", async () => {
    const { browser } = await loggedIn();
    expect((await addCategory(browser, "  Café  ")).json.name).toBe("Café");
    expect((await addCategory(browser, "café")).status).toBe(400);
    expect((await addCategory(browser, "FOOD")).status).toBe(400);
    expect((await addCategory(browser, "   ")).status).toBe(400);
    expect((await addCategory(browser, "x".repeat(31))).status).toBe(400);
    expect((await addCategory(browser, "tab\there")).status).toBe(400);
    expect((await addCategory(browser, "ق".repeat(30))).status).toBe(201);
  });

  it("at most 50 custom categories per user", async () => {
    const { user, browser } = await loggedIn();
    await db.category.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ userId: user.id, name: `c${i}`, nameKey: `c${i}` })) });
    expect((await addCategory(browser, "one more")).status).toBe(409);
  });
});

describe("FR-08 / FR-14 dashboard", () => {
  it("shows this month's income, expenses, balance and spending per category - for the user's own data only", async () => {
    const { browser } = await loggedIn();
    const { browser: other } = await loggedIn();
    const month = currentMonthTunis();
    await add(browser, { amount: "1200", type: "income", category: SALARY, date: `${month}-01` });
    await add(browser, { amount: "45.250", type: "expense", category: FOOD, date: `${month}-01` });
    await add(browser, { amount: "4.750", type: "expense", category: FOOD, date: `${month}-01` });
    await add(other, { amount: "999", type: "expense", category: FOOD, date: `${month}-01` });
    const res = await dashboard(browser);
    expect(res.json).toMatchObject({ month, income: "1200.000", expenses: "50.000", balance: "1150.000" });
    expect(res.json.categories).toEqual([{ id: FOOD, name: "Food", spent: "50.000" }]);
  });

  it("shows any previous month; months outside 2000-01..now are refused", async () => {
    const { browser } = await loggedIn();
    const last = previousMonth(currentMonthTunis());
    await add(browser, { amount: "10", type: "expense", category: FOOD, date: `${last}-15` });
    expect((await dashboard(browser, `?month=${last}`)).json.expenses).toBe("10.000");
    expect((await dashboard(browser)).json.expenses).toBe("0.000");
    expect((await dashboard(browser, "?month=1999-12")).status).toBe(400);
    expect((await dashboard(browser, "?month=2999-01")).status).toBe(400);
  });

  it("NFR-05: the dashboard for a user with 1,000 transactions is computed in well under 2 seconds", async () => {
    const { user, browser } = await loggedIn();
    const month = currentMonthTunis();
    await db.transaction.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        userId: user.id, type: i % 10 ? "expense" : "income", amountMillimes: BigInt(1000 + i), categoryId: i % 10 ? FOOD : SALARY, date: `${month}-01`,
      })),
    });
    const started = performance.now();
    const res = await dashboard(browser);
    const ms = performance.now() - started;
    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(2000);
    console.log(`NFR-05 dashboard with 1,000 transactions: ${ms.toFixed(0)} ms`);
  });
});

describe("FR-16 CSV export", () => {
  it("escapes formula cells and quotes every field (RFC 4180)", () => {
    expect(csvCell('=HYPERLINK("http://evil.example","x")')).toBe(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    for (const start of ["+", "-", "@", "\t", "\r"]) expect(csvCell(`${start}1`).startsWith(`"'${start}`)).toBe(true);
    expect(csvCell("Lablabi")).toBe('"Lablabi"');
  });

  it("needs the emailed 6-digit code, bound to this session; sends a no-store attachment", async () => {
    const { user, browser } = await loggedIn();
    await add(browser, { amount: "8.500", type: "expense", category: FOOD, date: "2026-10-02", note: "=1+1" });
    const exportWith = (b: Browser, code: string) => b.call(exportRoute.POST, "POST", "/api/me/export", { code });

    expect((await exportWith(browser, "123456")).status).toBe(400); // no code requested yet
    await browser.call(exportCodeRoute.POST, "POST", "/api/me/export/code");
    const code = codeIn((await lastMail(user.email)).text)!;

    const otherSession = new Browser();
    await loginWithCode(otherSession, user.email);
    expect((await exportWith(otherSession, code)).status).toBe(400); // code bound to the session that asked

    const res = await exportWith(browser, code);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="spendwise-export-/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.text).toContain(`"2026-10-02","expense","Food","8.500","'=1+1"`);
    expect((await exportWith(browser, code)).status).toBe(400); // single use
    expect(await db.securityEvent.count({ where: { userId: user.id, type: "EXPORT" } })).toBe(1);
  });
});
