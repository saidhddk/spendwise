import { redirect } from "next/navigation";
import { currentUser, language } from "@/lib/page";
import PrivacyNotice from "@/components/PrivacyNotice";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  if (await currentUser()) redirect("/dashboard");
  const { t } = await language();
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <RegisterForm t={t} />
      <PrivacyNotice />
    </div>
  );
}
