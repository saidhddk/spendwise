import { api, json } from "@/lib/http";
import { passwordBody } from "@/modules/auth/schemas";
import { requestAccountDeletion } from "@/modules/auth/service";
import { DEVICE_COOKIE } from "@/modules/auth/devices";
import { LOCKED_MESSAGE } from "@/modules/auth/throttle";

export const POST = api({ auth: true, body: passwordBody }, async ({ req, auth, body, ip }) => {
  const result = await requestAccountDeletion(auth, body.password, ip, req.cookies.get(DEVICE_COOKIE)?.value);
  if (result === "locked") return json({ error: LOCKED_MESSAGE }, 429);
  if (result === "wrong") return json({ error: "Invalid input.", fields: { password: "Your password is not correct." } }, 400);
  return json({ message: "We sent a confirmation link to your email address. It is valid for 30 minutes." });
});
