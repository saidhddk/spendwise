import { api, json } from "@/lib/http";
import { logout } from "@/modules/auth/service";
import { clearSessionCookie } from "@/modules/auth/session";

// FR-03: POST only; the session is deleted on the server, not just the cookie.
export const POST = api({}, async ({ auth, ip }) => {
  if (auth) await logout(auth, ip);
  const res = json({ status: "ok" });
  clearSessionCookie(res);
  return res;
});
