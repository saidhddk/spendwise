import { api, json } from "@/lib/http";
import { resetConfirmBody } from "@/modules/auth/schemas";
import { completeReset } from "@/modules/auth/service";
import { PASSWORD_MESSAGES } from "@/modules/auth/password";
import { clearSessionCookie } from "@/modules/auth/session";

export const POST = api({ body: resetConfirmBody }, async ({ body, ip }) => {
  const result = await completeReset(body.token, body.password, ip);
  if (result.kind === "problem") {
    return json({ error: "Invalid input.", fields: { password: PASSWORD_MESSAGES[result.problem] }, problem: result.problem }, 400);
  }
  if (result.kind === "invalid") return json({ error: "This link is not valid or has expired." }, 400);
  const res = json({ message: "Your password was changed. Please log in again." });
  clearSessionCookie(res);
  return res;
});
