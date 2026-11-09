import { language } from "@/lib/page";
import TokenAction from "@/components/TokenAction";

export default async function DeleteConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await language();
  const { token = "" } = await searchParams;
  return <TokenAction title={t.deletion.title} button={t.deletion.button} endpoint="/api/auth/delete/confirm" token={token} danger />;
}
