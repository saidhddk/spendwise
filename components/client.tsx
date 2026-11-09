"use client";

import { useEffect, useState, type ReactNode } from "react";

// Small client helpers shared by the forms.

export type ApiResult = { ok: boolean; status: number; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Same-origin fetch; the browser adds the Origin header that the server checks (NFR-02). */
export async function callApi(path: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

export function errorText(r: ApiResult): string {
  if (!r.data) return "Something went wrong. Please try again.";
  const fields = r.data.fields ? Object.values(r.data.fields).join(" ") : "";
  return fields || r.data.error || r.data.message || "";
}

export function Message({ text, kind = "info" }: { text: string | null; kind?: "info" | "error" }) {
  if (!text) return null;
  return (
    <p role={kind === "error" ? "alert" : "status"} className={kind === "error" ? "text-danger" : "text-income"}>
      {text}
    </p>
  );
}

export function Button({ children, kind = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-brand text-on-brand",
    secondary: "bg-card text-fg border border-line",
    danger: "bg-danger text-on-brand",
  }[kind];
  return (
    <button {...props} className={`rounded-lg px-4 py-2 font-semibold disabled:opacity-60 ${styles} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function LanguageSwitch({ label, to }: { label: string; to: "en" | "fr" }) {
  return (
    <button
      type="button"
      className="underline"
      onClick={() => {
        document.cookie = `lang=${to}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}

export function LogoutButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="underline"
      onClick={async () => {
        await callApi("/api/auth/logout", "POST"); // FR-03: POST, server deletes the session
        window.location.replace("/login");
      }}
    >
      {label}
    </button>
  );
}

/**
 * NFR-09 (changed after STRIDE): every minute the page asks the server whether the session
 * is still active, without extending it. When the session has ended, the page removes the
 * financial data from the screen and returns to the login page.
 */
export function SessionGuard({ children, message }: { children: ReactNode; message: string }) {
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const check = async () => {
      const res = await fetch("/api/auth/status", { cache: "no-store" });
      if (res.status === 401) {
        setEnded(true);
        window.location.replace("/login?expired=1");
      }
    };
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);
  if (ended) return <p className="p-6 text-lg">{message}</p>;
  return <>{children}</>;
}
