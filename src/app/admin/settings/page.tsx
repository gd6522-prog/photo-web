import { redirect } from "next/navigation";

export default function SettingsHome() {
  redirect("/admin/settings/store-master");
}
