import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser, language } from "@/lib/page";
import { LanguageSwitch, LogoutButton, SessionGuard } from "@/components/client";

export const metadata: Metadata = {
  title: "SpendWise",
  description: "A private personal expense tracker",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const { lang, t } = await language();
  return (
    <html lang={lang}>
      <body className="min-h-screen">
        <header className="bg-brand text-on-brand">
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href={user ? "/dashboard" : "/login"} className="text-xl font-bold">
              SpendWise
            </Link>
            {user && (
              <>
                <Link href="/dashboard" className="underline-offset-4 hover:underline">{t.nav.dashboard}</Link>
                <Link href="/transactions" className="underline-offset-4 hover:underline">{t.nav.transactions}</Link>
                <Link href="/settings" className="underline-offset-4 hover:underline">{t.nav.settings}</Link>
              </>
            )}
            <span className="ms-auto flex gap-4">
              <LanguageSwitch label={t.nav.switchTo} to={lang === "fr" ? "en" : "fr"} />
              {user && <LogoutButton label={t.nav.logout} />}
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">
          {user ? <SessionGuard message={t.login.expired}>{children}</SessionGuard> : children}
        </main>
      </body>
    </html>
  );
}
