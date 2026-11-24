// NFR-01, one-time migration after VULN-01: passwords saved in plain text by the vulnerable version
// are replaced by their bcrypt hash (cost 12). Rows that already hold a bcrypt hash are left alone,
// so running it twice changes nothing. Users keep their password; only the stored form changes.
import { db } from "../lib/db";
import { hashPassword } from "../modules/auth/password";

const BCRYPT = /^\$2[aby]\$\d{2}\$/;

async function main() {
  const users = await db.user.findMany({ select: { id: true, passwordHash: true } });
  let changed = 0;
  for (const u of users) {
    if (BCRYPT.test(u.passwordHash)) continue;
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(u.passwordHash) } });
    changed++;
  }
  console.log(`plain-text passwords hashed: ${changed} of ${users.length} accounts`);
}

main().finally(() => db.$disconnect());
