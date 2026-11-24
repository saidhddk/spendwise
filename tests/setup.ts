import { beforeEach } from "vitest";

process.env.DATABASE_URL = "file:./test.db";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.SERVER_SECRET = "test-only-secret-0123456789-abcdefghijklmnop";
process.env.ADMIN_EMAIL = "admin@spendwise.test";
process.env.MAIL_OUTBOX = "./data/outbox.test.jsonl";

beforeEach(async () => {
  // Counters from earlier tests must not lock out later ones (the security log is kept).
  const { db } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rateLimit");
  await db.loginFailure.deleteMany();
  await db.emailSend.deleteMany();
  resetRateLimits();
});
