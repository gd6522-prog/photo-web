import { redirect } from "next/navigation";

export default function AdminNoticesRedirectPage() {
  redirect("/admin/notice/boards?board=notice");
}
