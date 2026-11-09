import { z } from "zod";
import { api, json } from "@/lib/http";
import { currentMonthTunis } from "@/lib/dates";
import { monthField } from "@/modules/transactions/validation";
import { monthSummary } from "@/modules/dashboard/service";

const dashboardQuery = z.strictObject({ month: monthField.optional() });

export const GET = api({ auth: true, limit: true, query: dashboardQuery }, async ({ auth, query }) =>
  json(await monthSummary(auth.userId, query.month ?? currentMonthTunis())),
);
