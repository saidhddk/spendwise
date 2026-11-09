import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { lookupSession, SESSION_COOKIE } from "@/modules/auth/session";
import { dictionary, pickLang, type Lang } from "./i18n";

// Helpers for server-rendered pages. Pages check the session on the server; the browser
// never decides what a user may see.

export async function currentUser() {
  const jar = await cookies();
  return lookupSession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function language(): Promise<{ lang: Lang; t: ReturnType<typeof dictionary> }> {
  const jar = await cookies();
  const lang = pickLang(jar.get("lang")?.value, (await headers()).get("accept-language"));
  return { lang, t: dictionary(lang) };
}
