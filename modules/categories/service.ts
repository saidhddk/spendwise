import { z } from "zod";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { HttpError } from "@/lib/http";

// Predefined categories (userId = null) are shared and read-only: there is no route that
// changes or deletes a category. A custom category belongs to the user who created it (FR-11).

export const MAX_CUSTOM_CATEGORIES = 50;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** FR-10: 1-30 characters after trimming, no control characters. */
export const categoryBody = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .refine((s) => [...s].length <= 30, "Use at most 30 characters.")
    .refine((s) => !CONTROL.test(s), "The name contains characters that are not allowed."),
});

export type CategoryView = { id: string; name: string; custom: boolean };

export async function listCategories(userId: string): Promise<CategoryView[]> {
  const rows = await db.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ userId: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({ id: c.id, name: c.name, custom: c.userId !== null }));
}

/** A transaction may use a predefined category or one the same user created (FR-11, FR-12). */
export async function usableCategory(userId: string, categoryId: string): Promise<boolean> {
  const found = await db.category.findFirst({
    where: { id: categoryId, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  return found !== null;
}

export async function createCategory(userId: string, name: string, ip: string): Promise<CategoryView> {
  const nameKey = name.toLowerCase();
  if ((await db.category.count({ where: { userId } })) >= MAX_CUSTOM_CATEGORIES) {
    throw new HttpError(409, "You can have at most 50 custom categories.");
  }
  // Unique for this user, ignoring case, also against the predefined names (FR-10).
  const clash = await db.category.findFirst({ where: { nameKey, OR: [{ userId: null }, { userId }] } });
  if (clash) throw new HttpError(400, "Invalid input.", { name: "You already have a category with this name." });
  const category = await db.category.create({ data: { userId, name, nameKey } });
  await logEvent("CATEGORY_CREATED", { userId, ip, detail: `category ${category.id}` });
  return { id: category.id, name: category.name, custom: true };
}
