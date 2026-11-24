// Auth lab, Part C: replay the Station 2 (sessions) attacks from the lab against SpendWise.
// Each check prints PASS when the attack FAILS against our code. Cookie values are shortened.
// usage: node scripts/auth-lab-attacks.mjs [base URL, default http://localhost:3100] [email] [password]
// Since Secure Implementation II a new browser needs the emailed code (FR-18): the script passes it
// once, reading the development email from MAIL_OUTBOX, and then logs in as that known browser.
import { readFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:3100";
const EMAIL = process.argv[3] ?? "mariem@test.tn";
const PASSWORD = process.argv[4] ?? "123";
const COOKIE = "sw_session";
const OUTBOX = process.env.MAIL_OUTBOX ?? "./data/outbox.jsonl";
let device = null; // sw_device of this script's browser once it passed the email code

let failures = 0;
const short = (v) => (!v ? "(none)" : v.length <= 16 ? `"${v}"` : `${v.slice(0, 6)}… (${v.length} chars)`);
function check(ok, text) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${text}`);
}

/** POST from our own page (the Origin check of NFR-02 refuses anything else). */
async function post(path, body, cookie, extra) {
  const headers = { Origin: new URL(BASE).origin, "Content-Type": "application/json" };
  const jar = [cookie && `${COOKIE}=${cookie}`, device && `sw_device=${device}`, extra].filter(Boolean).join("; ");
  if (jar) headers.Cookie = jar;
  return fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
}

function cookieFrom(res, name) {
  for (const c of res.headers.getSetCookie()) {
    const m = c.match(new RegExp(`^${name}=([^;]*)`));
    if (m) return m[1];
  }
  return null;
}
const sessionFrom = (res) => cookieFrom(res, COOKIE);

/** Once per run: password, then the emailed 6-digit code, so this browser becomes known. */
async function knownBrowser() {
  const since = new Date().toISOString();
  const pending = cookieFrom(await post("/api/auth/login", { email: EMAIL, password: PASSWORD }), "sw_pending");
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const mails = (await readFile(OUTBOX, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    code = mails.filter((m) => m.to === EMAIL && m.at >= since).map((m) => m.text.match(/login code is (\d{6})/)?.[1]).findLast(Boolean);
  }
  const done = await post("/api/auth/login/code", { code }, null, `sw_pending=${pending}`);
  device = cookieFrom(done, "sw_device");
  await post("/api/auth/logout", {}, sessionFrom(done));
}

async function me(cookie) {
  const res = await fetch(BASE + "/api/me", { headers: { Cookie: `${COOKIE}=${cookie}` } });
  return res.status;
}

async function login(cookie) {
  const res = await post("/api/auth/login", { email: EMAIL, password: PASSWORD }, cookie);
  if (res.status !== 200) throw new Error(`login as ${EMAIL} gave ${res.status}: ${await res.text()}`);
  return sessionFrom(res);
}

console.log(`SpendWise ${BASE}, user ${EMAIL}, ${new Date().toISOString()}\n`);
await knownBrowser();

console.log("Break 2a: guess another user's session ID (lab: the IDs were a counter, admin = 1000)");
const a = await login();
const b = await login();
console.log(`      login 1 -> ${COOKIE}=${short(a)}`);
console.log(`      login 2 -> ${COOKIE}=${short(b)}`);
check(a.length === 43 && b.length === 43 && /^[A-Za-z0-9_-]+$/.test(a), "IDs are 43 base64url chars = 256 random bits");
check(a !== b && !/^\d+$/.test(a), "two logins give unrelated values, not a counter");
for (const guess of ["1", "1000", "1001", "admin", a.slice(0, -1) + (a.at(-1) === "A" ? "B" : "A")]) {
  const status = await me(guess);
  check(status === 401, `guessed ID ${guess.length === 43 ? "(login 1 with its last character changed)" : short(guess)} on GET /api/me -> ${status}`);
}

console.log("\nBreak 2b: session fixation (lab: attacker picks session=evil123, victim logs in with it)");
const fixed = "evil123";
const victim = await login(fixed);
check(victim && victim !== fixed, `victim logs in carrying ${COOKIE}=${fixed}; server sets a NEW value ${short(victim)}`);
check((await me(fixed)) === 401, `attacker uses ${fixed} on GET /api/me -> ${await me(fixed)}`);
check((await me(victim)) === 200, `victim's new cookie on GET /api/me -> ${await me(victim)}`);
const before = await login();
const after = await login(before);
check((await me(before)) === 401 && (await me(after)) === 200,
  `logging in again with a real old session: old ${short(before)} -> 401, new ${short(after)} -> 200`);

console.log("\nBreak 2c: fake logout (lab: the server only asked the browser to forget the cookie)");
const s = await login();
check((await me(s)) === 200, `before logout GET /api/me -> 200`);
const out = await post("/api/auth/logout", {}, s);
check(out.status === 200, `POST /api/auth/logout -> ${out.status}`);
const replay = await me(s);
check(replay === 401, `same cookie replayed after logout on GET /api/me -> ${replay}`);

// leave no test sessions behind
for (const v of [a, b, victim, after]) await post("/api/auth/logout", {}, v);

console.log(`\n${failures === 0 ? "ALL ATTACKS FAILED against SpendWise (good)" : `${failures} check(s) did not hold`}`);
process.exit(failures === 0 ? 0 : 1);
