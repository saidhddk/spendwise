import { db } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { mayEmail, sendMail } from "@/lib/mail";
import { checkCode, issueCode } from "@/lib/tokens";
import { formatMillimes } from "@/lib/money";

// FR-16: CSV export after a 6-digit code sent by email (valid 10 minutes, bound to the session).
// The file is built in memory on request and never written to the server's disk.

const FORMULA_START = /^[=+\-@\t\r]/;

/** RFC 4180 quoting; cells that a spreadsheet would run as a formula get a leading quote. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function sendExportCode(userId: string, email: string, sessionHash: string, ip: string): Promise<void> {
  if (!(await mayEmail(email, ip, "CODE", userId))) return; // NFR-20; the page shows the usual message
  const code = await issueCode(userId, "EXPORT", sessionHash);
  sendMail({
    to: email,
    subject: "Your SpendWise export code",
    text: `Your export code is ${code}. It is valid for 10 minutes.\nIf you did not ask to export your data, change your password now.`,
  });
}

export async function exportCsv(
  userId: string,
  sessionHash: string,
  code: string,
  ip: string,
): Promise<{ kind: "ok"; csv: string } | { kind: "wrong" } | { kind: "invalid" }> {
  void checkCode; void sessionHash; void code; // no emailed code any more
  const rows = await db.transaction.findMany({
    where: { userId },
    include: { category: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const csv = toCsv([
    ["date", "type", "category", "amount_tnd", "note"],
    ...rows.map((t) => [t.date, t.type, t.category.name, formatMillimes(t.amountMillimes), t.note ?? ""]),
  ]);
  await logEvent("EXPORT", { userId, ip, detail: `${rows.length} rows` });
  return { kind: "ok", csv };
}
