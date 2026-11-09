import { db } from "@/lib/db";
import { todayTunis } from "@/lib/dates";
import { language, requireUser } from "@/lib/page";
import { listCategories } from "@/modules/categories/service";
import TransactionsView from "./TransactionsView";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await requireUser();
  const { t } = await language();
  const [categories, me] = await Promise.all([
    listCategories(user.userId),
    db.user.findUnique({ where: { id: user.userId }, select: { lastCategoryId: true } }),
  ]);
  const { add } = await searchParams;
  return (
    <TransactionsView t={t} categories={categories} lastCategoryId={me?.lastCategoryId ?? null} today={todayTunis()} openForm={add === "1"} />
  );
}
