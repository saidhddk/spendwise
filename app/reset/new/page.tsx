import { language } from "@/lib/page";
import ResetForms from "../ResetForms";

export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { t } = await language();
  const { token = "" } = await searchParams;
  return <ResetForms t={t} token={token} />;
}
