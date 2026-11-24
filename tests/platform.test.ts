import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { api, errorResponse, HttpError, json } from "@/lib/http";
import { appBaseUrl, serverSecret } from "@/lib/config";
import { proxy } from "@/proxy";
import * as txRoute from "@/app/api/me/transactions/route";
import * as loginRoute from "@/app/api/auth/login/route";
import { Browser, FOOD, ORIGIN, loggedIn } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

describe("NFR-02 CSRF", () => {
  it("refuses state-changing requests without our Origin, and logs them", async () => {
    const { user, browser } = await loggedIn();
    const body = { amount: "5", type: "expense", category: FOOD, date: "2026-10-01" };
    const none = await browser.call(txRoute.POST, "POST", "/api/me/transactions", body, { origin: null });
    const evil = await browser.call(txRoute.POST, "POST", "/api/me/transactions", body, { origin: "https://evil.example" });
    expect(none.status).toBe(403);
    expect(evil.status).toBe(403);
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.securityEvent.count({ where: { type: "CSRF_REJECTED", ip: browser.ip } })).toBe(2);
    const login = await new Browser().call(loginRoute.POST, "POST", "/api/auth/login", { email: user.email, password: "x" }, { origin: "https://evil.example" });
    expect(login.status).toBe(403); // login CSRF too
  });

  it("no GET route changes state: GET exists only on read-only routes", () => {
    const routes = listRoutes("app/api");
    const withGet = routes.filter((file) => /export const GET\b/.test(readFileSync(file, "utf8"))).map((f) => path.relative("app/api", f)).sort();
    expect(withGet).toEqual([
      "auth/status/route.ts",
      "me/categories/route.ts",
      "me/dashboard/route.ts",
      "me/route.ts",
      "me/transactions/[id]/route.ts",
      "me/transactions/route.ts",
    ]);
  });
});

describe("NFR-04 / NFR-10 / NFR-21 response headers (proxy.ts)", () => {
  const page = () => proxy(new NextRequest(new URL("/dashboard", ORIGIN)));

  it("sends a nonce-based CSP that allows scripts only from our origin, plus the security headers", () => {
    const res = page();
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'(;|$)/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    const hsts = res.headers.get("strict-transport-security")!;
    expect(Number(/max-age=(\d+)/.exec(hsts)![1])).toBeGreaterThanOrEqual(31536000);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("uses a new nonce for every request", () => {
    const nonce = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy")!)![1];
    expect(nonce(page())).not.toBe(nonce(page()));
  });

  it("redirects HTTP to HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest(new URL("/login", "http://spendwise.example"), { headers: { "x-forwarded-proto": "http" } });
    const res = proxy(req);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://spendwise.example/login");
  });

  it("API responses carry Cache-Control: no-store", async () => {
    const { browser } = await loggedIn();
    expect((await browser.call(txRoute.GET, "GET", "/api/me/transactions")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("NFR-24 generic errors", () => {
  it("never returns stack traces, Prisma/SQL text or file paths", async () => {
    const leaky = new Error("PrismaClientKnownRequestError: SQLITE_ERROR near SELECT at /Users/said/spendwise/lib/db.ts:12");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = api({}, async () => {
      throw leaky;
    });
    const res = await handler(new NextRequest(new URL("/api/x", ORIGIN)));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toBe('{"error":"Something went wrong. Please try again."}');
    expect(spy).toHaveBeenCalledWith("Unhandled API error:", leaky); // details stay in the server log
    expect(errorResponse(new HttpError(404, "Not found.")).status).toBe(404);
    expect(json({}).status).toBe(200);
  });
});

describe("NFR-23 secrets", () => {
  it("secrets come only from the environment; .env and database files are ignored by git", () => {
    vi.stubEnv("SERVER_SECRET", "");
    expect(() => serverSecret()).toThrow(/SERVER_SECRET/);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://spendwise.example");
    expect(() => appBaseUrl()).toThrow(/https/);
    for (const file of [".env", ".env.production", "prisma/dev.db", "prisma/test.db"]) {
      expect(() => execSync(`git check-ignore -q ${file}`)).not.toThrow();
    }
  });
});

describe("NFR-03 / NFR-04 lint rules", () => {
  it("the build fails on $queryRawUnsafe, $executeRawUnsafe and dangerouslySetInnerHTML", async () => {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint({ cwd: process.cwd() });
    const [raw] = await eslint.lintText(
      'import { db } from "@/lib/db";\nexport const f = (s: string) => db.$queryRawUnsafe(s);\nexport const g = (s: string) => db.$executeRawUnsafe(s);\n',
      { filePath: "lib/bad.ts" },
    );
    expect(raw.messages.filter((m) => m.ruleId === "no-restricted-properties")).toHaveLength(2);
    const [html] = await eslint.lintText(
      "export const Note = ({ text }: { text: string }) => <p dangerouslySetInnerHTML={{ __html: text }} />;\n",
      { filePath: "app/bad.tsx" },
    );
    expect(html.messages.some((m) => m.ruleId === "react/no-danger")).toBe(true);
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts.build).toMatch(/^eslint \. && /);
  }, 60_000);
});

describe("NFR-08 separate modules", () => {
  it("auth, transactions, categories and dashboard do not reach into each other (one allowed call)", () => {
    const allowed = new Set(["transactions->categories"]);
    for (const mod of readdirSync("modules")) {
      for (const file of listFiles(path.join("modules", mod))) {
        for (const [, other] of readFileSync(file, "utf8").matchAll(/from "@\/modules\/([a-z]+)\//g)) {
          if (other !== mod) expect(allowed.has(`${mod}->${other}`), `${file} imports modules/${other}`).toBe(true);
        }
      }
    }
  });
});

describe("NFR-11 contrast and text size", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const color = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(color(a)), luminance(color(b))].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("every text colour reaches WCAG 2.1 AA (4.5:1) on its background", () => {
    const pairs = [["fg", "bg"], ["muted", "bg"], ["fg", "card"], ["muted", "card"], ["brand", "bg"], ["on-brand", "brand"], ["danger", "bg"], ["income", "bg"], ["income", "card"], ["danger", "card"]];
    for (const [text, background] of pairs) expect(ratio(text, background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
  });

  it("body text is at least 16 px", () => {
    expect(css).toMatch(/html\s*{[^}]*font-size:\s*16px/);
    expect(css).not.toMatch(/font-size:\s*(1[0-5]|[0-9])px/);
  });
});

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function listRoutes(dir: string): string[] {
  return listFiles(dir).filter((f) => f.endsWith("route.ts"));
}
