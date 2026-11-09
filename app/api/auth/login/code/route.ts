import { api, json } from "@/lib/http";
import { sha256 } from "@/lib/crypto";
import { codeBody } from "@/modules/auth/schemas";
import { loginWithCode } from "@/modules/auth/service";
import { DEVICE_COOKIE, setDeviceCookie } from "@/modules/auth/devices";
import { PENDING_COOKIE, SESSION_COOKIE, deleteSession, setSessionCookie } from "@/modules/auth/session";

export const POST = api({ body: codeBody }, async ({ req, body, ip }) => {
  const pending = req.cookies.get(PENDING_COOKIE)?.value;
  const result = pending
    ? await loginWithCode(pending, body.code, ip, req.cookies.get(DEVICE_COOKIE)?.value)
    : ({ kind: "invalid" } as const);
  if (result.kind === "wrong") return json({ error: "This code is not correct." }, 400);
  if (result.kind === "invalid") return json({ error: "This code has expired. Please log in again." }, 400);
  const old = req.cookies.get(SESSION_COOKIE)?.value;
  if (old) await deleteSession(sha256(old));
  const res = json({ status: "ok" });
  setSessionCookie(res, result.session); // FR-02: new session identifier after the code step
  setDeviceCookie(res, result.device); // FR-18: this browser is now known
  res.cookies.set(PENDING_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return res;
});
