import { api, json } from "@/lib/http";

// NFR-17: account routes act on the current user implicitly; no user ID in any URL or request.
export const GET = api({ auth: true }, async ({ auth }) => json({ email: auth.email }));
