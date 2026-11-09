import { language } from "@/lib/page";
import TokenAction from "@/components/TokenAction";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await language();
  const { token = "" } = await searchParams;
  return (
    <TokenAction title={t.confirm.title} button={t.confirm.button} endpoint="/api/auth/confirm" token={token} doneLink={{ href: "/login", label: t.confirm.login }} />
  );
}
