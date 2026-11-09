# SpendWise – intentionally vulnerable version (answer key)

This copy of SpendWise has security holes on purpose, for pentesting practice in CS424.
It only listens on 127.0.0.1. Never deploy it or expose it to a network.
The secure version is archived in `~/spendwise_SECURE_backup_2026-10-27.tar.gz`.

Run: `npm run dev`, then open http://localhost:3000 (use `localhost`, the session cookie is `Secure`).
Database: `prisma/vuln.db`. Demo accounts: `mariem@test.tn` / `123`, `amine@test.tn` / `amine`.

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

Account deletion and CSV export also have no email step any more (export needs only the session).

## Fixed in D6 (Secure Implementation I: input and output)

| ID | Fix | Commit |
|---|---|---|
| VULN-05, VULN-09, VULN-15 | Prisma with bound parameters for the login and the note search, lint rule against raw SQL, generic error message | 97762b6 |
| VULN-12 | Strict schemas on every route, owner always from the session, own/predefined category only | 4f8dae0 |
| VULN-13 | Note rendered as React text, lint rule against `dangerouslySetInnerHTML` | e88587d |
| VULN-07 | Origin check on every POST, PUT, PATCH and DELETE (403 + `CSRF_REJECTED` log) | e18a1c2 |

Still open on purpose (later deliverables): VULN-01, 02, 03, 04, 06, 08, 10, 11, 14.
Screenshots of each attack before and after its fix: `evidence/d6/`.
