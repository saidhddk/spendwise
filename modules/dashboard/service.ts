import { db } from "@/lib/db";
import { formatMillimes } from "@/lib/money";
import { monthBounds } from "@/lib/dates";

// FR-08 / FR-14: totals for one month (the current one by default), computed in the database
// over the logged-in user's transactions only (FR-11).

export async function monthSummary(userId: string, month: string) {
  const where = { userId, date: monthBounds(month) };
  const [byType, byCategory] = await Promise.all([
    db.transaction.groupBy({ by: ["type"], where, _sum: { amountMillimes: true } }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { ...where, type: "expense" },
      _sum: { amountMillimes: true },
    }),
  ]);
  const total = (type: string) => byType.find((r) => r.type === type)?._sum.amountMillimes ?? 0n;
  const income = total("income");
  const expenses = total("expense");
  const names = await db.category.findMany({
    where: { id: { in: byCategory.map((r) => r.categoryId) } },
    select: { id: true, name: true },
  });
  const categories = byCategory
    .map((r) => ({
      id: r.categoryId,
      name: names.find((n) => n.id === r.categoryId)?.name ?? "?",
      millimes: r._sum.amountMillimes ?? 0n,
    }))
    .sort((a, b) => (b.millimes > a.millimes ? 1 : b.millimes < a.millimes ? -1 : 0))
    .map((c) => ({ id: c.id, name: c.name, spent: formatMillimes(c.millimes) }));
  return {
    month,
    income: formatMillimes(income),
    expenses: formatMillimes(expenses),
    balance: formatMillimes(income - expenses),
    categories,
  };
}
