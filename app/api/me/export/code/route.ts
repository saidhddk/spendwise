import { api, json } from "@/lib/http";
import { sendExportCode } from "@/modules/transactions/export";

export const POST = api({ auth: true, limit: true }, async ({ auth, ip }) => {
  await sendExportCode(auth.userId, auth.email, auth.sessionHash, ip);
  return json({ message: "We sent a 6-digit code to your email address. It is valid for 10 minutes." });
});
