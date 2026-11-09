import { api, json } from "@/lib/http";

// Polled by the page every minute (NFR-09 after STRIDE). It does not extend the session,
// so an idle page is cleared once the 15-minute idle limit has passed.
export const GET = api({ touch: false }, async ({ auth }) => {
  return auth ? json({ active: true }) : json({ active: false }, 401);
});
