"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Message, callApi, errorText } from "@/components/client";
import type { Dictionary } from "@/lib/i18n";

export default function RegisterForm({ t }: { t: Dictionary }) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const r = await callApi("/api/auth/register", "POST", { email: form.get("email"), password: form.get("password") });
    setBusy(false);
    if (r.ok) setDone(r.data.message);
    else setError(errorText(r));
  }

  if (done) return <Message text={done} />;
  return (
    <form action={submit} className="space-y-4">
      <h1 className="text-2xl font-bold">{t.register.title}</h1>
      <label className="block space-y-1">
        <span className="font-medium">{t.login.email}</span>
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label className="block space-y-1">
        <span className="font-medium">{t.login.password}</span>
        <input name="password" type="password" autoComplete="new-password" required />
        <span className="text-muted">{t.register.passwordHelp}</span>
      </label>
      <Message text={error} kind="error" />
      <Button type="submit" disabled={busy} className="w-full">{t.register.submit}</Button>
      <p className="text-muted">
        {t.register.have} <Link href="/login" className="text-brand underline">{t.login.submit}</Link>
      </p>
    </form>
  );
}
