import { language } from "@/lib/page";
import ResetForms from "./ResetForms";

export default async function ResetPage() {
  const { t } = await language();
  return <ResetForms t={t} />;
}
