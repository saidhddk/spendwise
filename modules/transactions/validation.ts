import { z } from "zod";
import { AMOUNT_PATTERN, MAX_MILLIMES, parseAmount } from "@/lib/money";
import { currentMonthTunis, isRealDate, todayTunis } from "@/lib/dates";

// FR-12: server-side validation of every creation and edit. z.strictObject rejects any field
// that is not listed (id, userId, createdAt ...), so the owner can never be set from a request.

const CONTROL_EXCEPT_LINE_BREAKS = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

export const amountField = z
  .string({ error: 'Send the amount as text, for example "12.500".' })
  .regex(AMOUNT_PATTERN, "Use a positive number with at most 3 decimals, for example 12.500.")
  .transform((text) => parseAmount(text) as bigint)
  .refine((m) => m > 0n && m <= MAX_MILLIMES, "The amount must be more than 0 and at most 10,000,000.");

export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
  .refine(isRealDate, "This date does not exist.")
  .refine((d) => d >= "2000-01-01" && d <= todayTunis(), "The date must be between 2000-01-01 and today.");

export const noteField = z
  .string()
  .refine((s) => [...s].length <= 200, "The note can have at most 200 characters.")
  .refine((s) => !CONTROL_EXCEPT_LINE_BREAKS.test(s), "The note contains characters that are not allowed.")
  .transform((s) => (s.trim() === "" ? null : s));

export const transactionBody = z.strictObject({
  amount: amountField,
  type: z.enum(["income", "expense"], "Choose income or expense."),
  category: z.uuid("Choose a category."),
  date: dateField,
  note: noteField.optional(),
});
export type TransactionInput = z.infer<typeof transactionBody>;

export const monthField = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM.")
  .refine((m) => m >= "2000-01" && m <= currentMonthTunis(), "Choose a month between 2000-01 and this month.");

// FR-05, FR-15, NFR-03, NFR-27: every query parameter has a fixed format; page size <= 100;
// the sort field comes from an allow-list and is mapped to a column name in the service.
export const listQuery = z.strictObject({
  search: z.string().trim().max(100, "Use at most 100 characters.").optional(),
  month: monthField.optional(),
  category: z.uuid().optional(),
  type: z.enum(["income", "expense"]).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100, "At most 100 items per page.").default(20),
  sort: z.enum(["date", "amount"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ListQuery = z.infer<typeof listQuery>;

export const idParam = z.uuid();
