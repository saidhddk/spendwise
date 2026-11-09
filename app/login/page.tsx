import { redirect } from "next/navigation";
import { currentUser, language } from "@/lib/page";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { t } = await language();
  const { expired } = await searchParams;
  return <LoginForm t={t} expired={expired === "1"} />;
}
