import { NextResponse } from "next/server";
import { api, json } from "@/lib/http";
import { todayTunis } from "@/lib/dates";
import { codeBody } from "@/modules/auth/schemas";
import { exportCsv } from "@/modules/transactions/export";

export const POST = api({ auth: true, limit: true, body: codeBody }, async ({ auth, body, ip }) => {
  const result = await exportCsv(auth.userId, auth.sessionHash, body.code, ip);
  if (result.kind === "wrong") return json({ error: "This code is not correct." }, 400);
  if (result.kind === "invalid") return json({ error: "This code has expired. Ask for a new one." }, 400);
  // FR-16: generated on demand, sent as a download; Cache-Control: no-store is added by api().
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spendwise-export-${todayTunis()}.csv"`,
    },
  });
});
