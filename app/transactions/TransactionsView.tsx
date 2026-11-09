"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Message, callApi, errorText } from "@/components/client";
import type { Dictionary } from "@/lib/i18n";

type Category = { id: string; name: string; custom: boolean };
type Tx = { id: string; type: "income" | "expense"; amount: string; date: string; note: string | null; category: { id: string; name: string } };
type Page = { items: Tx[]; page: number; pageSize: number; total: number };

export default function TransactionsView(props: {
  t: Dictionary;
  categories: Category[];
  lastCategoryId: string | null;
  today: string;
  openForm: boolean;
}) {
  const { t, today } = props;
  const [categories, setCategories] = useState(props.categories);
  const [filters, setFilters] = useState({ search: "", month: "", category: "", type: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [editing, setEditing] = useState<Tx | "new" | null>(props.openForm ? "new" : null);
  const [lastCategory, setLastCategory] = useState(props.lastCategoryId ?? categories[0]?.id ?? "");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), pageSize: "20" });
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    const r = await callApi(`/api/me/transactions?${q}`);
    if (r.ok) setData(r.data);
    else setMessage({ ok: false, text: errorText(r) });
  }, [filters, page]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  async function save(form: FormData, again: boolean) {
    const body = {
      amount: String(form.get("amount") ?? "").trim().replace(",", "."),
      type: form.get("type"),
      category: form.get("category"),
      date: form.get("date"),
      note: String(form.get("note") ?? ""),
    };
    const existing = editing && editing !== "new" ? editing : null;
    const r = existing
      ? await callApi(`/api/me/transactions/${existing.id}`, "PUT", body)
      : await callApi("/api/me/transactions", "POST", body);
    if (!r.ok) return setMessage({ ok: false, text: errorText(r) });
    setLastCategory(String(body.category));
    setMessage({ ok: true, text: t.tx.saved });
    if (again) {
      setEditing("new"); // FR-04: "Save and add another" opens an empty form (same date and category)
      setFormKey((k) => k + 1);
    } else {
      setEditing(null);
    }
    load();
  }

  async function remove(tx: Tx) {
    if (!window.confirm(t.tx.confirmDelete)) return;
    const r = await callApi(`/api/me/transactions/${tx.id}`, "DELETE");
    setMessage(r.ok ? { ok: true, text: t.tx.saved } : { ok: false, text: errorText(r) });
    load();
  }

  async function addCategory(form: FormData) {
    const r = await callApi("/api/me/categories", "POST", { name: form.get("name") });
    if (!r.ok) return setMessage({ ok: false, text: errorText(r) });
    setCategories([...categories, r.data]);
    setMessage({ ok: true, text: t.tx.saved });
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const current = editing && editing !== "new" ? editing : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">{t.tx.title}</h1>
        {!editing && <Button onClick={() => setEditing("new")}>{t.tx.add}</Button>}
      </div>
      <Message text={message?.text ?? null} kind={message?.ok ? "info" : "error"} />

      {editing && (
        <form key={current?.id ?? `new-${formKey}`} className="grid gap-4 rounded-lg border border-line bg-card p-4 sm:grid-cols-2" action={(f) => save(f, false)}>
          <h2 className="text-lg font-semibold sm:col-span-2">{current ? t.tx.edit : t.tx.add}</h2>
          <label className="space-y-1">
            <span className="font-medium">{t.tx.amount}</span>
            <input name="amount" inputMode="decimal" required autoFocus defaultValue={current?.amount ?? ""} placeholder="12.500" />
          </label>
          <label className="space-y-1">
            <span className="font-medium">{t.tx.type}</span>
            <select name="type" defaultValue={current?.type ?? "expense"}>
              <option value="expense">{t.tx.expense}</option>
              <option value="income">{t.tx.income}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium">{t.tx.category}</span>
            <select name="category" defaultValue={current?.category.id ?? lastCategory}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium">{t.tx.date}</span>
            <input name="date" type="date" required min="2000-01-01" max={today} defaultValue={current?.date ?? today} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="font-medium">{t.tx.note}</span>
            <textarea name="note" rows={2} defaultValue={current?.note ?? ""} />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit">{t.tx.save}</Button>
            {!current && (
              <Button type="submit" kind="secondary" formAction={(f) => save(f, true)}>{t.tx.saveAnother}</Button>
            )}
            <Button type="button" kind="secondary" onClick={() => setEditing(null)}>{t.tx.cancel}</Button>
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <input type="search" maxLength={100} placeholder="Search notes" aria-label="Search notes" value={filters.search} onChange={(e) => { setPage(1); setFilters({ ...filters, search: e.target.value }); }} />
        <input type="month" aria-label={t.tx.allMonths} min="2000-01" max={today.slice(0, 7)} value={filters.month} onChange={(e) => { setPage(1); setFilters({ ...filters, month: e.target.value }); }} />
        <select aria-label={t.tx.category} value={filters.category} onChange={(e) => { setPage(1); setFilters({ ...filters, category: e.target.value }); }}>
          <option value="">{t.tx.allCategories}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select aria-label={t.tx.type} value={filters.type} onChange={(e) => { setPage(1); setFilters({ ...filters, type: e.target.value }); }}>
          <option value="">{t.tx.allTypes}</option>
          <option value="expense">{t.tx.expense}</option>
          <option value="income">{t.tx.income}</option>
        </select>
      </div>

      {data && data.items.length === 0 && <p className="text-muted">{t.tx.empty}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {data?.items.map((tx) => (
          <li key={tx.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
            <span className="tabular-nums text-muted">{tx.date}</span>
            <span className="font-medium">{tx.category.name}</span>
            {/* VULN-13 (stored XSS): the note is inserted as HTML */}
            {tx.note && <span className="text-muted" dangerouslySetInnerHTML={{ __html: tx.note }} />}
            <span className={`ms-auto font-semibold tabular-nums ${tx.type === "income" ? "text-income" : "text-danger"}`}>
              {tx.type === "income" ? "+" : "−"}{tx.amount} TND
            </span>
            <button type="button" className="text-brand underline" onClick={() => setEditing(tx)}>{t.tx.editButton}</button>
            <button type="button" className="text-danger underline" onClick={() => remove(tx)}>{t.tx.deleteButton}</button>
          </li>
        ))}
      </ul>
      {data && pages > 1 && (
        <div className="flex items-center justify-between">
          <Button kind="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.tx.prevPage}</Button>
          <span>{t.tx.page} {page} / {pages}</span>
          <Button kind="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t.tx.nextPage}</Button>
        </div>
      )}

      <form action={addCategory} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-4">
        <label className="min-w-48 flex-1 space-y-1">
          <span className="font-medium">{t.tx.newCategory}</span>
          <input name="name" required maxLength={30} />
        </label>
        <Button type="submit" kind="secondary">{t.tx.addCategory}</Button>
      </form>
    </div>
  );
}
