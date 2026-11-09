import { api, json } from "@/lib/http";
import { tokenBody } from "@/modules/auth/schemas";
import { confirmAccount } from "@/modules/auth/service";

export const POST = api({ body: tokenBody }, async ({ body, ip }) => {
  if (!(await confirmAccount(body.token, ip))) return json({ error: "This link is not valid or has expired." }, 400);
  return json({ message: "Your account is confirmed. You can now log in." });
});
