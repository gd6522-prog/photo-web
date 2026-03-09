import { redirect } from "next/navigation";

export default function LegacyNoticePage() {
  redirect("/admin/notice/boards?board=notice");
}
