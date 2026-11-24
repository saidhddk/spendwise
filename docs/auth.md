# Authentication in SpendWise

Auth lab, Part C · Said Haddouk · 23 November 2026

## The five points

1. **Who authenticates?** Only people: each user logs in to see their own income and expenses. No scripts or services log in, and there is no public API.
2. **Where?** In a web browser (phone or laptop), talking to one Next.js server.
3. **How strong must it be?** Strong enough for private financial data. If an account is stolen, the attacker can read the user's whole money history, change or delete records, export them as CSV and delete the account (FR-17). No money moves through the app, so the thief can't take money directly.
4. **Who owns the identity?** SpendWise itself: email and password accounts in my own database. There's no Google or university login, because users shouldn't need one and I keep third parties out of the app (NFR-10).
5. **Chosen method and why.** Email and password login with a server-side session: the `sw_session` cookie holds a random 256-bit ID, and the database keeps only its SHA-256 hash. It fits one website with one server, and because the server holds the session, logout, "log out other devices" (FR-19) and a password change end it at once, which a JWT can't do before it expires.

## Evidence: two lab attacks fail against my code

**Station 2, sessions.** This station matters most, because every request is trusted because of the session cookie. `scripts/auth-lab-attacks.mjs` replays the lab's attacks against the running app. All 14 checks pass (`evidence/part-c/station2-sessions.txt`):

- **2a, guessing an ID:** IDs are 43 random characters (`randomBytes(32)`, `lib/crypto.ts:6`). The guesses `1`, `1000`, `1001`, `admin`, and a real ID with one character changed, all get 401.
- **2b, fixation:** logging in while carrying `sw_session=evil123` gives a new ID, and `evil123` gets 401. `createSession` (`modules/auth/session.ts:21`) always makes a new ID, and `app/api/auth/login/route.ts:31` deletes the old one.
- **Fake logout:** the same cookie, replayed after `POST /api/auth/logout`, gets 401 because the session row is deleted (`modules/auth/session.ts:59`).

**Station 1, secrets in Git history (Break 1b).** gitleaks finds no leaks in any commit or in the new files (`evidence/part-c/station1-gitleaks.txt`). `SERVER_SECRET` and `DATABASE_URL` are only in `.env`, which `.gitignore:8` excludes; Git holds only `.env.example`, with an empty secret.

To run the attacks again: `APP_BASE_URL=http://localhost:3100 npx next dev -H 127.0.0.1 -p 3100`, then `node scripts/auth-lab-attacks.mjs`.

## Residual risk I accept

There's no second factor, so someone who knows a user's password can log in. I accept this for now because the app holds expense records, not payments. The planned email code for a new browser (FR-18) needs a mail service that this course version doesn't have.

I don't accept these three; they're still open in this teaching copy and are my next fixes (from my Deliverable 7 worksheet): password reset without email (VULN-14), plain-text passwords (VULN-01), and a session cookie that isn't HttpOnly, is SameSite=None and never expires (VULN-04).

## Update after Secure Implementation II (24 November 2026)

All three are fixed: VULN-14 (edd1474), VULN-01 (fb2a97f), VULN-04 (5ac43a9), together with the other open
items (see `VULNERABILITIES.md`). The residual risk above is smaller now: a password alone no longer opens
the account from a new browser, because the emailed 6-digit code (FR-18) is back. Since then the Part C
script passes that code step once per run and still reports that all station 2 attacks fail.
