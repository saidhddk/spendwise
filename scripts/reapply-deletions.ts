// FR-17: run after any restore from backup, so that deleted accounts stay deleted.
import { db } from "../lib/db";
import { reapplyDeletions } from "../modules/auth/service";

reapplyDeletions()
  .then((n) => console.log(`deleted accounts re-applied: ${n} removed again`))
  .finally(() => db.$disconnect());
