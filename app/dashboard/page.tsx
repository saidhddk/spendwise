import Link from "next/link";
import { language, requireUser } from "@/lib/page";
import { currentMonthTunis, nextMonth, previousMonth } from "@/lib/dates";
import { monthField } from "@/modules/transactions/validation";
import { monthSummary } from "@/modules/dashboard/service";

// FR-08 (current month) and FR-14 (any previous month). The summary is computed on the server
// for the session user only (FR-11).
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { t, lang } = await language();
  const { month: asked } = await searchParams;
  const month = asked && monthField.safeParse(asked).success ? asked : currentMonthTunis();
  const s = await monthSummary(user.userId, month);
  const label = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  const max = Math.max(1, ...s.categories.map((c) => Number(c.spent)));
  const isCurrent = month === currentMonthTunis();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">
          {t.dashboard.title} · <span className="capitalize">{label}</span>
        </h1>
        <Link href={`/transactions?add=1`} className="rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand">{t.dashboard.add}</Link>
      </div>
      <div className="flex justify-between">
        <Link href={`/dashboard?month=${previousMonth(month)}`} className="text-brand underline">{t.dashboard.prev}</Link>
        {!isCurrent && <Link href={`/dashboard?month=${nextMonth(month)}`} className="text-brand underline">{t.dashboard.next}</Link>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.dashboard.income} value={s.income} tone="text-income" />
        <Stat label={t.dashboard.expenses} value={s.expenses} tone="text-danger" />
        <Stat label={t.dashboard.balance} value={s.balance} tone={s.balance.startsWith("-") ? "text-danger" : "text-fg"} />
      </div>
      <section className="space-y-3 rounded-lg border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">{t.dashboard.byCategory}</h2>
        {s.categories.length === 0 && <p className="text-muted">{t.dashboard.none}</p>}
        <ul className="space-y-3">
          {s.categories.map((c) => (
            <li key={c.id}>
              <div className="flex justify-between">
                <span>{c.name}</span>
                <span className="font-semibold tabular-nums">{c.spent} TND</span>
              </div>
              <div className="h-2 rounded bg-line">
                <div className="h-2 rounded bg-brand" style={{ width: `${(Number(c.spent) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value} <span className="text-base font-normal">TND</span></p>
    </div>
  );
}
