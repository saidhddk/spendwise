"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Message, callApi, errorText } from "@/components/client";
import type { Dictionary } from "@/lib/i18n";

export default function LoginForm({ t, expired }: { t: Dictionary; expired: boolean }) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(form: FormData) {
    setBusy(true);
    setError(null);
    const r = await callApi("/api/auth/login", "POST", { email: form.get("email"), password: form.get("password") });
    setBusy(false);
    if (r.ok && r.data.status === "ok") window.location.replace("/dashboard");
    else if (r.ok && r.data.status === "code_sent") setStep("code");
    else setError(errorText(r));
  }

  async function submitCode(form: FormData) {
    setBusy(true);
    setError(null);
    const r = await callApi("/api/auth/login/code", "POST", { code: String(form.get("code") ?? "").trim() });
    setBusy(false);
    if (r.ok) window.location.replace("/dashboard");
    else setError(errorText(r));
  }

  return (
    <section className="mx-auto max-w-md space-y-5">
      {expired && <Message text={t.login.expired} kind="error" />}
      {step === "password" ? (
        <form action={submitPassword} className="space-y-4">
          <h1 className="text-2xl font-bold">{t.login.title}</h1>
          <label className="block space-y-1">
            <span className="font-medium">{t.login.email}</span>
            <input name="email" type="text" autoComplete="email" required maxLength={254} />
          </label>
          <label className="block space-y-1">
            <span className="font-medium">{t.login.password}</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Message text={error} kind="error" />
          <Button type="submit" disabled={busy} className="w-full">{t.login.submit}</Button>
          <p className="text-muted">
            {t.login.noAccount} <Link href="/register" className="text-brand underline">{t.login.register}</Link>
            {" · "}
            <Link href="/reset" className="text-brand underline">{t.login.forgot}</Link>
          </p>
        </form>
      ) : (
        <form action={submitCode} className="space-y-4">
          <h1 className="text-2xl font-bold">{t.login.codeTitle}</h1>
          <p className="text-muted">{t.login.codeHelp}</p>
          <label className="block space-y-1">
            <span className="font-medium">{t.login.code}</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          </label>
          <Message text={error} kind="error" />
          <Button type="submit" disabled={busy} className="w-full">{t.login.verify}</Button>
        </form>
      )}
    </section>
  );
}
