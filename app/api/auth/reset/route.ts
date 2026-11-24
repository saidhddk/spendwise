import { api, json } from "@/lib/http";
import { resetRequestBody } from "@/modules/auth/schemas";
import { requestReset } from "@/modules/auth/service";

export const POST = api({ body: resetRequestBody }, async ({ body, ip }) => {
  await requestReset(body.email, ip);
  // FR-13: same message whether or not the address is registered.
  return json({ message: "If this address has an account, we sent it a link to reset the password." });
});
