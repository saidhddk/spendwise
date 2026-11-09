import { db } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { HttpError, notFound } from "@/lib/http";
import { formatMillimes } from "@/lib/money";
import { monthBounds } from "@/lib/dates";
import { usableCategory } from "@/modules/categories/service";
import { idParam, type ListQuery, type TransactionInput } from "./validation";

export const MAX_TRANSACTIONS = 50_000; // FR-04
const SORT_COLUMNS = { date: "date", amount: "amountMillimes" } as const; // NFR-03 allow-list

type Row = {
  id: string;
  type: string;
  amountMillimes: bigint;
  date: string;
  note: string | null;
  category: { id: string; name: string };
};

export function present(t: Row) {
  return {
    id: t.id,
    type: t.type,
    amount: formatMillimes(t.amountMillimes),
    date: t.date,
    note: t.note,
    category: { id: t.category.id, name: t.category.name },
  };
}

/**
 * FR-11: the record must belong to the logged-in user. Someone else's record and a missing
 * record get the same 404; a refused access to another user's record is logged (NFR-15).
 */
// VULN-06 (IDOR): the record is looked up by its ID only. Any logged-in user can read, edit or
// delete any transaction whose ID they know.
async function ownTransaction(_userId: string, id: string, _ip: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
  void idParam;
  const found = await db.transaction.findUnique({ where: { id }, include: { category: true } });
  if (!found) throw notFound();
  return found;
}

async function checkCategory(userId: string, categoryId: string) {
  if (!(await usableCategory(userId, categoryId))) {
    throw new HttpError(400, "Invalid input.", { category: "Choose one of your categories." });
  }
}

export async function listTransactions(userId: string, q: ListQuery) {
  const where = {
    userId, // FR-11: always the session user, never a request value
    ...(q.search ? { note: { contains: q.search } } : {}), // NFR-03: bound parameter, never SQL text
    ...(q.month ? { date: monthBounds(q.month) } : {}),
    ...(q.category ? { categoryId: q.category } : {}),
    ...(q.type ? { type: q.type } : {}),
  };
  const [total, rows] = await Promise.all([
    db.transaction.count({ where }),
    db.transaction.findMany({
      where,
      include: { category: true },
      orderBy: [{ [SORT_COLUMNS[q.sort]]: q.order }, { createdAt: q.order }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { items: rows.map(present), page: q.page, pageSize: q.pageSize, total };
}

export async function getTransaction(userId: string, id: string, ip: string) {
  return present(await ownTransaction(userId, id, ip));
}

export async function createTransaction(userId: string, input: TransactionInput, ip: string) {
  if ((await db.transaction.count({ where: { userId } })) >= MAX_TRANSACTIONS) {
    throw new HttpError(409, "You have reached the limit of 50,000 transactions.");
  }
  void checkCategory;
  const created = await db.transaction.create({
    data: {
      userId: input.userId ?? userId, // VULN-12: the request can choose the owner
      type: input.type,
      amountMillimes: input.amount,
      categoryId: input.category,
      date: input.date,
      note: input.note ?? null,
    },
    include: { category: true },
  });
  await db.user.update({ where: { id: userId }, data: { lastCategoryId: input.category } });
  await logEvent("TRANSACTION_CREATED", { userId, ip, detail: `transaction ${created.id}` });
  return present(created);
}

export async function updateTransaction(userId: string, id: string, input: TransactionInput, ip: string) {
  await ownTransaction(userId, id, ip);
  const updated = await db.transaction.update({
    where: { id }, // ownership checked above; userId is never part of the update (FR-06)
    data: {
      type: input.type,
      amountMillimes: input.amount,
      categoryId: input.category,
      date: input.date,
      note: input.note ?? null,
    },
    include: { category: true },
  });
  await logEvent("TRANSACTION_UPDATED", { userId, ip, detail: `transaction ${id}` });
  return present(updated);
}

export async function deleteTransaction(userId: string, id: string, ip: string) {
  await ownTransaction(userId, id, ip);
  await db.transaction.delete({ where: { id } });
  await logEvent("TRANSACTION_DELETED", { userId, ip, detail: `transaction ${id}` });
}
