# SpendWise – vulnerabilities and fixes (answer key)

For pentesting practice in CS424, SpendWise was given 15 security holes on purpose (27 Oct 2026).
They were fixed in two rounds: D6 (input and output) and Secure Implementation II (authentication,
sessions, access control, platform). **All 15 are fixed.** The table below is the original list;
the two tables after it give the fix and the commit for each one.
A fully vulnerable copy for pentest demos stays outside the repository (`~/Desktop/SpendWise/unsecure`).

Run: `npm run dev`, then open http://localhost:3000 (use `localhost`, the session cookie is `Secure`).
Database: `prisma/vuln.db` (name kept from the vulnerable phase). Demo accounts: `mariem@test.tn` / `123`,
`amine@test.tn` / `amine` (now stored as bcrypt hashes; new passwords must follow NFR-14).
Development emails (confirmation links, login codes, reset links) are written to `data/outbox.jsonl`.

| ID | Vulnerability | Where | How to show it |
|---|---|---|---|
| VULN-01 | Passwords stored in plain text; any password accepted | `modules/auth/password.ts` | Register with password `1`; `sqlite3 prisma/vuln.db "select email, passwordHash from User"` |
| VULN-02 | User enumeration; no email confirmation | `modules/auth/service.ts`, login + register routes | Login with an unknown email ("No account uses this email address") vs a wrong password ("Wrong password for this account") |
| VULN-03 | No brute-force protection (no lockout, no rate limit, no email code) | `modules/auth/service.ts` | Burp Intruder / Hydra on `POST /api/auth/login` |
| VULN-04 | Weak session cookie: not HttpOnly, SameSite=None, never expires | `modules/auth/session.ts` | `document.cookie` in the console shows `sw_session` |
| VULN-05 | SQL injection in the transaction search | `modules/transactions/service.ts` (`searchTransactions`) | Search: `zz' UNION SELECT id, 'expense', 'pw:' \|\| passwordHash, '2026-01-01', email, 'x', 'LEAK' FROM User --` |
| VULN-06 | IDOR on transactions | `modules/transactions/service.ts` (`ownTransaction`) | As Amine: `GET/PUT/DELETE /api/me/transactions/<Mariem's id>` |
| VULN-07 | CSRF: no Origin check, text/plain bodies are parsed as JSON | `lib/http.ts` | HTML form on another site, `enctype="text/plain"`, posting `{"newPassword":"hacked"}` to `/api/me/password` |
| VULN-08 | Password change does not ask for the current password | `modules/auth/service.ts` (`changePassword`) | Combine with VULN-07 or a stolen cookie |
| VULN-09 | Verbose errors (SQL text and stack trace) | `lib/http.ts` (`errorResponse`) | Search for `'` |
| VULN-10 | No API rate limit | `lib/http.ts` | Thousands of requests per minute are accepted |
| VULN-11 | No security headers (no CSP, X-Frame-Options, HSTS) | `proxy.ts` | Page can be framed (clickjacking); inline scripts run |
| VULN-12 | No input validation + mass assignment of `userId` | `modules/transactions/validation.ts`, `service.ts` | Amount `-45`, date `1900-01-01`; add `"userId":"<Mariem's id>"` to a new transaction |
| VULN-13 | Stored XSS in transaction notes | `app/transactions/TransactionsView.tsx` | Note: `<img src=x onerror=alert(document.cookie)>` |
| VULN-14 | Password reset without any email step | `modules/auth/service.ts` (`resetWithoutEmail`), `/reset` page | Set a new password for any known address |
| VULN-15 | SQL injection in the login (email and password pasted into the SQL string; email format not checked) | `modules/auth/service.ts` (`login`), `modules/auth/schemas.ts` (`loginBody`) | Type a single quote `'` in the email field: the login answers with an SQL error |

In the vulnerable phase, account deletion and CSV export had no email step either (fixed in edd1474).

## Fixed in D6 (Secure Implementation I: input and output)

| ID | Fix | Commit |
|---|---|---|
| VULN-05, VULN-09, VULN-15 | Prisma with bound parameters for the login and the note search, lint rule against raw SQL, generic error message | 97762b6 |
| VULN-12 | Strict schemas on every route, owner always from the session, own/predefined category only | 4f8dae0 |
| VULN-13 | Note rendered as React text, lint rule against `dangerouslySetInnerHTML` | e88587d |
| VULN-07 | Origin check on every POST, PUT, PATCH and DELETE (403 + `CSRF_REJECTED` log) | e18a1c2 |

Screenshots of each attack before and after its fix: `evidence/d6/`.

## Fixed in Secure Implementation II (authentication, sessions, access control, platform)

| ID | Fix | Commit |
|---|---|---|
| VULN-01 | bcrypt cost 12 and NFR-14 password rules; `scripts/hash-plaintext-passwords.ts` hashed the stored plain-text passwords | fb2a97f |
| VULN-04 | Session cookie HttpOnly, SameSite=Lax, 8-hour Max-Age; session ends after 15 min idle or 8 h | 5ac43a9 |
| VULN-02, VULN-03 | Same answer for known and unknown addresses (and the same bcrypt time); confirmation link for new accounts; throttling per address, known browser and IP; emailed code for a new browser | 39d62ec |
| VULN-08 | Password change needs the current password | c123030 |
| VULN-14 | Reset only through a single-use 30-minute emailed link; deletion and export need their emailed link/code again | edd1474 |
| VULN-06 | Transactions looked up by ID and owner; another user's record gets 404 and is logged | 34e05b5 |
| VULN-10 | 60 requests per minute per user on the data endpoints, then 429 | 0374ee3 |
| VULN-11 | CSP with a per-request nonce, X-Frame-Options DENY, HSTS, nosniff, no-referrer, no-store | 3bc121f |

Proof: `npx tsx --env-file=.env scripts/secure-2-attacks.ts` replays each attack (39 checks, all PASS:
`evidence/secure-2/attacks.txt`), and `npm test` runs 69 automated tests (all pass: `evidence/secure-2/tests.txt`).
