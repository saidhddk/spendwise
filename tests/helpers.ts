import { NextRequest } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { flushMail } from "@/lib/mail";
import { hashPassword } from "@/modules/auth/password";
import * as loginRoute from "@/app/api/auth/login/route";
import * as codeRoute from "@/app/api/auth/login/code/route";

export const ORIGIN = "http://localhost:3000";
export const PASSWORD = "Jasmin-Tunis-2026";

type Handler = (req: NextRequest, segment?: { params: Promise<Record<string, string>> }) => Promise<Response>;
type CallOptions = {
  params?: Record<string, string>;
  origin?: string | null; // null = no Origin header
  headers?: Record<string, string>;
  rawBody?: string;
};

export type Result = {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  text: string;
  headers: Headers;
  setCookies: string[];
};

/** A simulated browser: keeps its cookies and always comes from the same IP address. */
export class Browser {
  cookies = new Map<string, string>();
  constructor(
    public ip = `10.${rand()}.${rand()}.${rand()}`,
    public userAgent = "Mozilla/5.0 (Vitest) Chrome/130",
  ) {}

  async call(handler: Handler, method: string, path: string, body?: unknown, options: CallOptions = {}): Promise<Result> {
    const headers = new Headers({ "x-forwarded-for": this.ip, "user-agent": this.userAgent, ...options.headers });
    if (method !== "GET" && options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    let payload: string | undefined;
    if (options.rawBody !== undefined) payload = options.rawBody;
    else if (body !== undefined) payload = JSON.stringify(body);
    if (payload !== undefined) headers.set("content-type", "application/json");
    const req = new NextRequest(new URL(path, ORIGIN), { method, headers, body: method === "GET" ? undefined : payload });
    const res = await handler(req, options.params ? { params: Promise.resolve(options.params) } : undefined);
    const setCookies = res.headers.getSetCookie();
    for (const cookie of setCookies) {
      const [pair, ...attributes] = cookie.split(";");
      const name = pair.slice(0, pair.indexOf("=")).trim();
      const value = pair.slice(pair.indexOf("=") + 1).trim();
      if (!value || attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, headers: res.headers, setCookies };
  }
}

function rand() {
  return Math.floor(Math.random() * 250) + 1;
}

export function uniqueEmail(name = "user"): string {
  return `${name}.${randomUUID().slice(0, 8)}@example.tn`;
}

export async function outbox(): Promise<{ to: string; subject: string; text: string }[]> {
  await flushMail();
  const file = process.env.MAIL_OUTBOX!;
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export async function mailsTo(to: string) {
  return (await outbox()).filter((m) => m.to === to);
}

export async function lastMail(to: string) {
  const mails = await mailsTo(to);
  return mails[mails.length - 1];
}

export const tokenIn = (text: string) => /token=([A-Za-z0-9_-]{43})/.exec(text)?.[1];
export const codeIn = (text: string) => /code is (\d{6})/.exec(text)?.[1];

/** A confirmed account, created directly in the database (the registration flow has its own tests). */
export async function createUser(email = uniqueEmail(), password = PASSWORD) {
  return db.user.create({ data: { email, passwordHash: await hashPassword(password), confirmedAt: new Date() } });
}

/** Full login from a new browser: password, then the emailed code (FR-18). */
export async function loggedIn(email?: string, password = PASSWORD, browser = new Browser()) {
  const user = await createUser(email, password);
  await loginWithCode(browser, user.email, password);
  return { user, browser };
}

export async function loginWithCode(browser: Browser, email: string, password = PASSWORD) {
  const first = await browser.call(loginRoute.POST, "POST", "/api/auth/login", { email, password });
  if (first.json?.status === "ok") return first;
  if (first.json?.status !== "code_sent") throw new Error(`login failed: ${first.status} ${first.text}`);
  const code = codeIn((await lastMail(email)).text)!;
  const second = await browser.call(codeRoute.POST, "POST", "/api/auth/login/code", { code });
  if (second.status !== 200) throw new Error(`code failed: ${second.text}`);
  return second;
}

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const FOOD = "8efe86ad-ee19-4f65-af6d-293de97d4af8"; // predefined category
export const SALARY = "9cd41fef-60b0-4e17-b658-d1948751fd87";
