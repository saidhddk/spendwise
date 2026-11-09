import { api, json } from "@/lib/http";
import { tokenBody } from "@/modules/auth/schemas";
import { confirmAccountDeletion } from "@/modules/auth/service";
import { clearSessionCookie } from "@/modules/auth/session";

export const POST = api({ body: tokenBody }, async ({ body, ip }) => {
  if (!(await confirmAccountDeletion(body.token, ip))) {
    return json({ error: "This link is not valid or has expired." }, 400);
  }
  const res = json({ message: "Your account and all your data were deleted." });
  clearSessionCookie(res);
  return res;
});
