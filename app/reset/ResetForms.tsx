"use client";

import { useState } from "react";
import { Button, Message, callApi, errorText } from "@/components/client";
import type { Dictionary } from "@/lib/i18n";

export default function ResetForms({ t, token }: { t: Dictionary; token?: string }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(path: string, body: unknown) {
    setBusy(true);
    const r = await callApi(path, "POST", body);
    setBusy(false);
    setMessage({ ok: r.ok, text: r.ok ? r.data.message : errorText(r) });
  }

  if (message?.ok) {
    return (
      <section className="mx-auto max-w-md space-y-3">
        <Message text={message.text} />
        {token && <a href="/login" className="text-brand underline">{t.confirm.login}</a>}
      </section>
    );
  }
  return token ? (
    <form action={(f) => send("/api/auth/reset/confirm", { token, password: f.get("password") })} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t.reset.newTitle}</h1>
      <label className="block space-y-1">
        <span className="font-medium">{t.settings.newPassword}</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} />
        <span className="text-muted">{t.register.passwordHelp}</span>
      </label>
      <Message text={message?.text ?? null} kind="error" />
      <Button type="submit" disabled={busy} className="w-full">{t.reset.newSubmit}</Button>
    </form>
  ) : (
    <form action={(f) => send("/api/auth/reset", { email: f.get("email") })} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t.reset.title}</h1>
      <label className="block space-y-1">
        <span className="font-medium">{t.login.email}</span>
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <Message text={message?.text ?? null} kind="error" />
      <Button type="submit" disabled={busy} className="w-full">{t.reset.submit}</Button>
    </form>
  );
}
