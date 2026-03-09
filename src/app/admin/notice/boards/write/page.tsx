"use client";

import { useSearchParams } from "next/navigation";
import { BoardForm } from "../_board-form";
import { isNoticeBoardKey, type NoticeBoardKey } from "@/lib/notice-board";

export default function BoardWritePage() {
  const searchParams = useSearchParams();
  const boardParam = searchParams.get("board");
  const board: NoticeBoardKey = isNoticeBoardKey(boardParam) ? boardParam : "notice";
  return <BoardForm mode="create" initialBoard={board} />;
}
