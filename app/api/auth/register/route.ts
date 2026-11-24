import { api, json } from "@/lib/http";
import { registerBody } from "@/modules/auth/schemas";
import { register } from "@/modules/auth/service";
import { PASSWORD_MESSAGES } from "@/modules/auth/password";

export const POST = api({ body: registerBody }, async ({ body, ip }) => {
  const { problem } = await register(body.email, body.password, ip);
  if (problem) {
    return json({ error: "Invalid input.", fields: { password: PASSWORD_MESSAGES[problem] }, problem }, 400);
  }
  // FR-01: the same answer whether or not the address is already registered.
  return json({ message: "Check your inbox: we sent you an email to finish creating your account." });
});
