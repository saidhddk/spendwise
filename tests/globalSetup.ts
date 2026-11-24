import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// A fresh test database for every run, built from the same migrations as production.
export default function setup() {
  for (const f of ["prisma/test.db", "prisma/test.db-journal", "data/outbox.test.jsonl"]) rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: "file:./test.db" }, stdio: "ignore" });
}
