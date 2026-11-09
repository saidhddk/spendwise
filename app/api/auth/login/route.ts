import { api, json } from "@/lib/http";
import { sha256 } from "@/lib/crypto";
import { loginBody } from "@/modules/auth/schemas";
import { login } from "@/modules/auth/service";
import { LOCKED_MESSAGE } from "@/modules/auth/throttle";
import { DEVICE_COOKIE } from "@/modules/auth/devices";
import { PENDING_COOKIE, SESSION_COOKIE, deleteSession, setSessionCookie } from "@/modules/auth/session";

export const POST = api({ body: loginBody }, async ({ req, body, ip }) => {
  const device = req.cookies.get(DEVICE_COOKIE)?.value;
  const result = await login(body.email, body.password, ip, device, req.headers.get("user-agent") ?? "");
  if (result.kind === "locked") return json({ error: LOCKED_MESSAGE }, 429);
  // FR-02: one message for an unknown address and for a wrong password.
  if (result.kind === "no_account") return json({ error: "No account uses this email address." }, 404);
  if (result.kind === "failed") return json({ error: "Wrong password for this account." }, 401);
  if (result.kind === "unconfirmed") {
    return json({ error: "Please confirm your email address first: open the link we sent you." }, 403);
  }
  if (result.kind === "code") {
    const res = json({ status: "code_sent" });
    res.cookies.set(PENDING_COOKIE, result.pending, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 600,
    });
    return res;
  }
  const old = req.cookies.get(SESSION_COOKIE)?.value;
  if (old) await deleteSession(sha256(old)); // FR-02: identifiers from before login stop working
  const res = json({ status: "ok" });
  setSessionCookie(res, result.session);
  return res;
});
