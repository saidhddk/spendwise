import { api, json } from "@/lib/http";
import { resetRequestBody } from "@/modules/auth/schemas";
import { resetWithoutEmail } from "@/modules/auth/service";

export const POST = api({ body: resetRequestBody }, async ({ body, ip }) => {
  const result = await resetWithoutEmail(body.email, body.password, ip);
  if (result === "no_account") return json({ error: "No account uses this email address." }, 404);
  return json({ message: "Your password was changed. You can log in now." });
});
