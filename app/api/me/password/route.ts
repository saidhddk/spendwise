import { api, json } from "@/lib/http";
import { changePasswordBody } from "@/modules/auth/schemas";
import { changePassword } from "@/modules/auth/service";
import { PASSWORD_MESSAGES } from "@/modules/auth/password";
import { DEVICE_COOKIE } from "@/modules/auth/devices";
import { LOCKED_MESSAGE } from "@/modules/auth/throttle";

export const POST = api({ auth: true, body: changePasswordBody }, async ({ req, auth, body, ip }) => {
  const device = req.cookies.get(DEVICE_COOKIE)?.value;
  const result = await changePassword(auth, body.currentPassword ?? "", body.newPassword, ip, device);
  if (result.kind === "locked") return json({ error: LOCKED_MESSAGE }, 429);
  if (result.kind === "wrong") return json({ error: "Invalid input.", fields: { currentPassword: "Your current password is not correct." } }, 400);
  if (result.kind === "problem") {
    return json({ error: "Invalid input.", fields: { newPassword: PASSWORD_MESSAGES[result.problem] }, problem: result.problem }, 400);
  }
  return json({ message: "Your password was changed. Your other devices were logged out." });
});
