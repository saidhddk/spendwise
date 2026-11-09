// NFR-15: security log entries are kept for 90 days. The database trigger refuses to delete
// younger entries, so this daily job can only remove expired ones.
import { db } from "../lib/db";

const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);
db.securityEvent
  .deleteMany({ where: { at: { lt: cutoff } } })
  .then((r) => console.log(`security log entries older than 90 days removed: ${r.count}`))
  .finally(() => db.$disconnect());
