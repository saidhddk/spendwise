import { NextResponse } from "next/server";
import { api, json } from "@/lib/http";
import { todayTunis } from "@/lib/dates";
import { exportCsv } from "@/modules/transactions/export";

// No emailed code: a logged-in session (or a forged request) is enough to export everything.
export const POST = api({ auth: true }, async ({ auth, ip }) => {
  const result = await exportCsv(auth.userId, auth.sessionHash, "", ip);
  if (result.kind !== "ok") return json({ error: "Export failed." }, 400);
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spendwise-export-${todayTunis()}.csv"`,
    },
  });
});
