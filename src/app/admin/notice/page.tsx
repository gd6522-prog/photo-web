import { redirect } from "next/navigation";

export default function NoticeIndexPage() {
  redirect("/admin/notice/boards?board=notice");
}
