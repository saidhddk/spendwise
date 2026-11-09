import { api, json } from "@/lib/http";
import { passwordBody } from "@/modules/auth/schemas";
import { deleteAccountNow } from "@/modules/auth/service";
import { clearSessionCookie } from "@/modules/auth/session";

// No email link: the account is deleted at once after the password.
export const POST = api({ auth: true, body: passwordBody }, async ({ auth, body, ip }) => {
  if (!(await deleteAccountNow(auth, body.password, ip))) {
    return json({ error: "Invalid input.", fields: { password: "Your password is not correct." } }, 400);
  }
  const res = json({ message: "Your account and all your data were deleted." });
  clearSessionCookie(res);
  return res;
});
