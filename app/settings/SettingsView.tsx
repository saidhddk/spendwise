"use client";

import { useState, type ReactNode } from "react";
import { Button, Message, callApi, errorText, type ApiResult } from "@/components/client";
import type { Dictionary } from "@/lib/i18n";

type Note = { text: string; ok: boolean } | null;
const note = (r: ApiResult, okText?: string): Note => ({ ok: r.ok, text: r.ok ? okText ?? r.data.message : errorText(r) });

export default function SettingsView({ t, email }: { t: Dictionary; email: string }) {
  const [pw, setPw] = useState<Note>(null);
  const [sessions, setSessions] = useState<Note>(null);
  const [exp, setExp] = useState<Note>(null);
  const [del, setDel] = useState<Note>(null);

  async function download() {
    // FR-16: the CSV is handed to the browser as a download (no emailed code).
    const res = await fetch("/api/me/export", { method: "POST" });
    if (!res.ok) return setExp({ ok: false, text: (await res.json()).error });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "spendwise.csv";
    a.click();
    URL.revokeObjectURL(url);
    setExp({ ok: true, text: "✓" });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.settings.title}</h1>
      <p className="text-muted">{email}</p>

      <Card title={t.settings.password}>
        <form className="grid gap-3 sm:grid-cols-2" action={async (f) => setPw(note(await callApi("/api/me/password", "POST", { currentPassword: f.get("current"), newPassword: f.get("next") })))}>
          <label className="space-y-1">
            <span className="font-medium">{t.settings.current}</span>
            <input name="current" type="password" autoComplete="current-password" required />
          </label>
          <label className="space-y-1">
            <span className="font-medium">{t.settings.newPassword}</span>
            <input name="next" type="password" autoComplete="new-password" required />
          </label>
          <div className="sm:col-span-2 space-y-2">
            <Message text={pw?.text ?? null} kind={pw?.ok ? "info" : "error"} />
            <Button type="submit">{t.settings.change}</Button>
          </div>
        </form>
      </Card>

      <Card title={t.settings.sessions}>
        <p className="text-muted">{t.settings.sessionsHelp}</p>
        <Message text={sessions?.text ?? null} kind={sessions?.ok ? "info" : "error"} />
        <Button kind="secondary" onClick={async () => setSessions(note(await callApi("/api/me/sessions/others", "POST")))}>{t.settings.endOthers}</Button>
      </Card>

      <Card title={t.settings.export}>
        <Message text={exp?.text ?? null} kind={exp?.ok ? "info" : "error"} />
        <Button kind="secondary" onClick={download}>{t.settings.download}</Button>
      </Card>

      <Card title={t.settings.deleteTitle}>
        <p className="text-muted">{t.settings.deleteHelp}</p>
        <form className="flex flex-wrap items-end gap-3" action={async (f) => { const r = await callApi("/api/me/delete", "POST", { password: f.get("password") }); setDel(note(r)); if (r.ok) window.location.replace("/register"); }}>
          <label className="min-w-48 flex-1 space-y-1">
            <span className="font-medium">{t.login.password}</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Button type="submit" kind="danger">{t.settings.deleteButton}</Button>
        </form>
        <Message text={del?.text ?? null} kind={del?.ok ? "info" : "error"} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
