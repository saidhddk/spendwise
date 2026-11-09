import { language, requireUser } from "@/lib/page";
import SettingsView from "./SettingsView";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t } = await language();
  return <SettingsView t={t} email={user.email} />;
}
