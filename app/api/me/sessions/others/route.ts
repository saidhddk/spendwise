import { api, json } from "@/lib/http";
import { endOtherSessions } from "@/modules/auth/service";

// FR-19: one action ends every other session of the account.
export const POST = api({ auth: true }, async ({ auth, ip }) => {
  const ended = await endOtherSessions(auth, ip);
  return json({ message: `Done. ${ended} other session(s) ended.`, ended });
});
