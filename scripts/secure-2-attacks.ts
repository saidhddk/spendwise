// Secure Implementation II: replay the attack for each vulnerability fixed in this round
// (VULN-01, 02, 03, 04, 06, 08, 10, 11, 14) against the running app. Each check prints PASS when the
// attack FAILS. Two fresh accounts are made through the real flow (email link, email code); the
// development "emails" are read from MAIL_OUTBOX. Cookie values and links are shortened.
// usage: npx tsx --env-file=.env scripts/secure-2-attacks.ts [base URL, default http://localhost:3100]
// The app must run with APP_BASE_URL set to that base URL. Re-running within an hour may hit the
// per-IP login limit (NFR-13) on purpose; wait an hour or use another IP.
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import { sha256 } from "../lib/crypto";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUTBOX = process.env.MAIL_OUTBOX ?? "./data/outbox.jsonl";
const START = new Date().toISOString();
const STAMP = Date.now().toString(36);
const A = { email: `sw2-a-${STAMP}@test.tn`, password: "Medina-Lantern-2026" };
const B = { email: `sw2-b-${STAMP}@test.tn`, password: "Sidi-Bou-Blue-2026" };

let failures = 0;
function check(ok: boolean, text: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${text}`);
}
const short = (v?: string | null) => (!v ? "(none)" : v.length <= 16 ? `"${v}"` : `${v.slice(0, 6)}… (${v.length} chars)`);

type Jar = Record<string, string>;
const cookieHeader = (jar: Jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function keep(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i), value = pair.slice(i + 1);
    if (value) jar[name] = value;
    else delete jar[name];
  }
}

async function call(method: string, path: string, jar: Jar = {}, body?: unknown) {
  const headers: Record<string, string> = { Cookie: cookieHeader(jar) };
  if (method !== "GET") headers.Origin = new URL(BASE).origin; // NFR-02 refuses other origins
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  keep(jar, res);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, res };
}

/** Newest development email to `to` since the script started whose text matches `re`. */
async function mail(to: string, re: RegExp): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const lines = (await readFile(OUTBOX, "utf8").catch(() => "")).split("\n").filter(Boolean);
    for (const line of lines.reverse()) {
      const m = JSON.parse(line);
      const found = m.to === to && m.at >= START ? String(m.text).match(re) : null;
      if (found) return found[1];
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function createAccount(u: { email: string; password: string }) {
  await call("POST", "/api/auth/register", {}, u);
  const token = await mail(u.email, /confirm\?token=([A-Za-z0-9_-]{43})/);
  const confirmed = token ? await call("POST", "/api/auth/confirm", {}, { token }) : null;
  return confirmed?.status === 200;
}

/** Full login from a new browser: password, then the emailed 6-digit code. */
async function loginNewBrowser(u: { email: string; password: string }, jar: Jar) {
  const first = await call("POST", "/api/auth/login", jar, u);
  const code = await mail(u.email, /login code is (\d{6})/);
  const second = code ? await call("POST", "/api/auth/login/code", jar, { code }) : null;
  return { first, second, code };
}

async function main() {
  console.log(`SpendWise ${BASE}, ${START}\n`);

  console.log("VULN-11: security headers");
  const home = await call("GET", "/login");
  const csp = home.res.headers.get("content-security-policy") ?? "";
  check(/script-src 'self' 'nonce-[^']+'/.test(csp), "Content-Security-Policy with a per-request nonce for scripts");
  check(csp.includes("frame-ancestors 'none'") && home.res.headers.get("x-frame-options") === "DENY", "page cannot be framed (frame-ancestors 'none' + X-Frame-Options: DENY)");
  check(!!home.res.headers.get("strict-transport-security") && home.res.headers.get("x-content-type-options") === "nosniff", "HSTS and X-Content-Type-Options: nosniff are sent");
  check(home.res.headers.get("cache-control") === "no-store", "Cache-Control: no-store");

  console.log("\nVULN-01: weak and plain-text passwords");
  for (const [pw, why] of [["1", "too_short"], ["password", "common"], [`weak-${STAMP}@test.tn`, "equals_email"]]) {
    const r = await call("POST", "/api/auth/register", {}, { email: `weak-${STAMP}@test.tn`, password: pw });
    check(r.status === 400 && r.json.problem === why, `register with password "${pw}" -> ${r.status} ${r.json.problem ?? ""}`);
  }
  check((await createAccount(A)) && (await createAccount(B)), "two new accounts created and confirmed through the emailed link");
  const stored = await db.user.findUnique({ where: { email: A.email }, select: { passwordHash: true } });
  check(/^\$2b\$12\$/.test(stored?.passwordHash ?? ""), `password stored as a bcrypt cost-12 hash (${stored?.passwordHash.slice(0, 7)}…), not as text`);
  const plain = await db.user.count({ where: { NOT: { passwordHash: { startsWith: "$2" } } } });
  check(plain === 0, `accounts with a plain-text password in the database: ${plain}`);

  console.log("\nVULN-02: user enumeration");
  const regNew = await call("POST", "/api/auth/register", {}, { email: `new-${STAMP}@test.tn`, password: "Carthage-Port-2026" });
  const regOld = await call("POST", "/api/auth/register", {}, { email: B.email, password: "Carthage-Port-2026" });
  check(regNew.status === regOld.status && regNew.text === regOld.text, `register: new and existing address get the same answer (${regNew.status} "${regNew.json.message}")`);
  // A wrong password for A (B is kept clean for the guessing test). The first call also warms up
  // the server, so the timing compares the next two pairs.
  const nobody = { email: `nobody-${STAMP}@test.tn`, password: "Whatever-2026" };
  const wrongA = { email: A.email, password: "Wrong-Password-2026" };
  await call("POST", "/api/auth/login", {}, nobody);
  const unknown = await call("POST", "/api/auth/login", {}, nobody);
  const wrong = await call("POST", "/api/auth/login", {}, wrongA);
  check(unknown.status === wrong.status && unknown.text === wrong.text, `login: unknown address and wrong password get the same answer (${wrong.status} "${wrong.json.error}")`);
  const timed = async (u: typeof nobody) => { const t = Date.now(); await call("POST", "/api/auth/login", {}, u); return Date.now() - t; };
  const tu = await timed(nobody), tw = await timed(wrongA);
  check(Math.abs(tu - tw) < 100, `similar time: unknown address ${tu} ms, wrong password ${tw} ms (both run bcrypt)`);

  console.log("\nVULN-03 (part 1) + VULN-04: login from a new browser, session cookie");
  const jarA: Jar = {}, jarB: Jar = {};
  const la = await loginNewBrowser(A, jarA);
  const firstCookies = la.first.res.headers.getSetCookie();
  check(la.first.status === 200 && la.first.json.status === "code_sent" && !firstCookies.some((c) => c.startsWith("sw_session=")), "correct password from a new browser gives NO session, only an emailed code");
  check(la.second?.status === 200 && !!jarA.sw_session, `after the 6-digit code: session ${short(jarA.sw_session)}`);
  const setCookie = la.second?.res.headers.getSetCookie().find((c) => c.startsWith("sw_session=")) ?? "";
  check(/HttpOnly/i.test(setCookie), "session cookie is HttpOnly (JavaScript and XSS cannot read it)");
  check(/SameSite=lax/i.test(setCookie) && /Secure/i.test(setCookie), "session cookie is SameSite=Lax and Secure");
  check(/Max-Age=28800/i.test(setCookie), "session cookie lives 8 hours (Max-Age=28800), not 1 year");
  await loginNewBrowser(B, jarB);

  console.log("\nVULN-06: IDOR on transactions");
  const cats = await call("GET", "/api/me/categories", jarA);
  const category = (cats.json as unknown as { id: string }[])[0]?.id;
  const made = await call("POST", "/api/me/transactions", jarA, { amount: "42.500", type: "expense", category, date: "2026-11-20", note: "A's private note" });
  const id = String(made.json.id ?? "");
  check(made.status === 201 && !!id, `A creates transaction ${id.slice(0, 8)}…`);
  for (const [method, body] of [["GET", undefined], ["PUT", { amount: "1.000", type: "expense", category, date: "2026-11-20" }], ["DELETE", undefined]] as const) {
    const r = await call(method, `/api/me/transactions/${id}`, jarB, body);
    check(r.status === 404, `B: ${method} A's transaction -> ${r.status}`);
  }
  const still = await call("GET", `/api/me/transactions/${id}`, jarA);
  check(still.status === 200 && still.json.amount === "42.500", "A's transaction is unchanged and still there");
  const refused = await db.securityEvent.count({ where: { type: "ACCESS_REFUSED", detail: `transaction ${id}`, at: { gte: new Date(START) } } });
  check(refused === 3, `the 3 refused attempts are in the security log (ACCESS_REFUSED: ${refused})`);

  console.log("\nVULN-04: sessions expire");
  const jarA2: Jar = { sw_device: jarA.sw_device };
  const known = await call("POST", "/api/auth/login", jarA2, A);
  check(known.json.status === "ok" && !!jarA2.sw_session, "known browser (device cookie) logs in without a code");
  await db.session.update({ where: { idHash: sha256(jarA2.sw_session) }, data: { lastSeenAt: new Date(Date.now() - 16 * 60_000) } });
  check((await call("GET", "/api/me", jarA2)).status === 401, "session idle for 16 minutes -> 401");
  check((await db.session.count({ where: { idHash: sha256(jarA2.sw_session) } })) === 0, "the expired session row is deleted");

  console.log("\nVULN-08: password change needs the current password");
  const noCurrent = await call("POST", "/api/me/password", jarA, { newPassword: "Hijacked-Account-2026" });
  check(noCurrent.status === 400, `without the current password -> ${noCurrent.status}`);
  const badCurrent = await call("POST", "/api/me/password", jarA, { currentPassword: "Not-My-Password-1", newPassword: "Hijacked-Account-2026" });
  check(badCurrent.status === 400 && !!(badCurrent.json.fields as Record<string, string>)?.currentPassword, `with a wrong current password -> ${badCurrent.status} "${(badCurrent.json.fields as Record<string, string>)?.currentPassword}"`);
  const good = await call("POST", "/api/me/password", jarA, { currentPassword: A.password, newPassword: "Medina-Lantern-2027" });
  check(good.status === 200, "with the right current password -> 200 (the owner can still change it)");

  console.log("\nVULN-10: API rate limit");
  let ok = 0, limitedAt = 0;
  for (let i = 1; i <= 70 && !limitedAt; i++) {
    const r = await call("GET", "/api/me/transactions", jarA);
    if (r.status === 200) ok++;
    else if (r.status === 429) limitedAt = i;
  }
  check(limitedAt > 0 && ok <= 60, `burst of requests: ${ok} accepted, then 429 at request ${limitedAt} (limit 60 per minute)`);

  console.log("\nVULN-14: password reset");
  const direct = await call("POST", "/api/auth/reset", {}, { email: B.email, password: "Attacker-Choice-2026" });
  check(direct.status === 400, `setting a new password straight from the reset form -> ${direct.status}`);
  const rKnown = await call("POST", "/api/auth/reset", {}, { email: B.email });
  const rUnknown = await call("POST", "/api/auth/reset", {}, { email: `nobody-${STAMP}@test.tn` });
  check(rKnown.text === rUnknown.text, `same answer for a registered and an unknown address ("${rKnown.json.message}")`);
  const token = await mail(B.email, /reset\/new\?token=([A-Za-z0-9_-]{43})/) ?? await mail(B.email, /token=([A-Za-z0-9_-]{43})/);
  check(!!token, `the reset link went only to the owner's inbox (token ${short(token)})`);
  const newB = "Sidi-Bou-Blue-2027";
  const done = await call("POST", "/api/auth/reset/confirm", {}, { token, password: newB });
  check(done.status === 200, "the owner sets a new password with the link -> 200");
  const reuse = await call("POST", "/api/auth/reset/confirm", {}, { token, password: "Attacker-Choice-2026" });
  check(reuse.status === 400, `the same link used again -> ${reuse.status} (single use)`);
  check((await call("GET", "/api/me", jarB)).status === 401, "B's old session ended with the reset");

  console.log("\nVULN-03 (part 2): password guessing");
  const tries: number[] = [];
  for (let i = 0; i < 5; i++) tries.push((await call("POST", "/api/auth/login", {}, { email: B.email, password: `Guess-${i}-2026` })).status);
  const right = await call("POST", "/api/auth/login", {}, { email: B.email, password: newB });
  check(tries.every((s) => s === 401) && right.status === 429, `5 wrong guesses (${tries.join(", ")}), then even the RIGHT password -> ${right.status} "${right.json.error}"`);
  for (let i = 0; i < 5; i++) await call("POST", "/api/auth/login", {}, { email: `ghost-${STAMP}@test.tn`, password: `Guess-${i}-2026` });
  const ghost = await call("POST", "/api/auth/login", {}, { email: `ghost-${STAMP}@test.tn`, password: "Guess-9-2026" });
  check(ghost.status === 429 && ghost.text === right.text, "an unknown address is locked the same way (no hint that it does not exist)");

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL ATTACKS FAILED against SpendWise (good)");
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => db.$disconnect());
