import { api, json } from "@/lib/http";
import { registerBody } from "@/modules/auth/schemas";
import { register } from "@/modules/auth/service";
import { PASSWORD_MESSAGES } from "@/modules/auth/password";

export const POST = api({ body: registerBody }, async ({ body, ip }) => {
  const { problem, exists } = await register(body.email, body.password, ip);
  if (exists) return json({ error: "This email address is already registered." }, 409);
  if (problem) {
    return json({ error: "Invalid input.", fields: { password: PASSWORD_MESSAGES[problem] }, problem }, 400);
  }
  return json({ message: "Account created. You can log in now." });
});
