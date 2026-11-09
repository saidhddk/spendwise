"use client";

import { useState } from "react";
import { Button, Message, callApi, errorText } from "@/components/client";
import type { Dictionary } from "@/lib/i18n";

// No email step: the new password is set straight away (VULN-14).
export default function ResetForms({ t }: { t: Dictionary; token?: string }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(form: FormData) {
    setBusy(true);
    const r = await callApi("/api/auth/reset", "POST", { email: form.get("email"), password: form.get("password") });
    setBusy(false);
    setMessage({ ok: r.ok, text: r.ok ? r.data.message : errorText(r) });
  }

  if (message?.ok) {
    return (
      <section className="mx-auto max-w-md space-y-3">
        <Message text={message.text} />
        <a href="/login" className="text-brand underline">{t.confirm.login}</a>
      </section>
    );
  }
  return (
    <form action={send} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t.reset.title}</h1>
      <label className="block space-y-1">
        <span className="font-medium">{t.login.email}</span>
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">{t.settings.newPassword}</span>
        <input name="password" type="password" autoComplete="new-password" required />
      </label>
      <Message text={message?.text ?? null} kind="error" />
      <Button type="submit" disabled={busy} className="w-full">{t.reset.newSubmit}</Button>
    </form>
  );
}
