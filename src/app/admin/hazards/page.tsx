"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/admin-access";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";
import { copyCompressedImageUrlToClipboard } from "@/lib/clipboard-image";
import { uploadFileToR2 } from "@/lib/r2-upload-client";

type ReportRow = {
  id: string;
  user_id: string;
  comment: string | null;
  photo_path: string;
  photo_url: string;
  created_at: string;
};

type ResolutionRow = {
  report_id: string;
  after_path: string | null;
  after_public_url: string | null;
  after_memo: string | null;
  improved_by: string | null;
  improved_at: string | null;
  planned_due_date: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
};

type ExtraPhotoRow = {
  id: string;
  report_id: string;
  photo_path: string | null;
  photo_url: string | null;
  created_at: string;
};

type HazardListItem = ReportRow & {
  creator_name: string | null;
  improver_name: string | null;
  resolution: ResolutionRow | null;
  extra_photos: ExtraPhotoRow[];
};

type HazardPagePayload = {
  items?: HazardListItem[];
  totalCount?: number | null;
  unresolvedTotalCount?: number | null;
  pendingTotalCount?: number | null;
  resolvedTotalCount?: number | null;
};

const PAGE_SIZE = 4;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toKstDate(iso: string) {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function formatKST(ts: string | null) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

function formatDueDateLabel(value: string | null) {
  if (!value) return "-";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return value;
}

function getHazardStatus(resolution: ResolutionRow | null) {
  if (resolution?.after_public_url) {
    return {
      key: "done" as const,
      label: "처리완료",
      background: "#DCFCE7",
      color: "#166534",
    };
  }

  if (resolution?.planned_due_date && resolution.planned_due_date >= todayYMD()) {
    return {
      key: "pending" as const,
      label: "처리대기",
      background: "#FEF3C7",
      color: "#B45309",
    };
  }

  return {
    key: "open" as const,
    label: "미처리",
    background: "#FEE2E2",
    color: "#B91C1C",
  };
}

function getHazardImageUrl(_photoPath: string | null | undefined, photoUrl: string | null | undefined) {
  return String(photoUrl || "").trim();
}


function getReportBeforePhotos(report: HazardListItem | null | undefined) {
  if (!report) return [];
  const items: Array<{ url: string; path: string }> = [];
  const firstUrl = getHazardImageUrl(report.photo_path, report.photo_url);
  const firstPath = String(report.photo_path ?? "").trim();
  if (firstUrl && firstPath) items.push({ url: firstUrl, path: firstPath });

  for (const photo of report.extra_photos ?? []) {
    const url = getHazardImageUrl(photo.photo_path, photo.photo_url);
    const path = String(photo.photo_path ?? "").trim();
    if (!url || !path) continue;
    if (items.some((item) => item.path === path)) continue;
    items.push({ url, path });
  }

  return items;
}

function extFromName(name: string) {
  const i = name.lastIndexOf(".");
  if (i < 0) return "jpg";
  const ext = name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "jpg";
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

async function forceDownload(url: string, fileName: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`다운로드 실패: ${res.status}`);
  const blob = await res.blob();
  const objUrl = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.URL.revokeObjectURL(objUrl);
  }
}

async function copyImageToClipboard(url: string) {
  await copyCompressedImageUrlToClipboard(url, { maxBytes: 20 * 1024 * 1024, maxDimension: 2000 });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function printHazardResolutionSheet(params: {
  reportId: string;
  createdAt: string;
  creator: string;
  improvedAt: string | null;
  improver: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  beforeMemo: string;
  afterMemo: string;
}) {
  const popup = window.open("", "_blank", "width=960,height=1280");
  if (!popup) throw new Error("출력 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.");

  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>위험요인 처리완료 출력</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      html, body { margin: 0; padding: 0; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: "Pretendard", "Malgun Gothic", sans-serif; color: #0f172a; }
      body { padding: 10mm; }
      .sheet { width: 100%; display: flex; flex-direction: column; gap: 12px; }
      .title-row { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
      .title-row h1 { margin: 0; font-size: 22px; align-self: center; }
      .stamp { display: flex; border: 1px solid #c8c8c8; border-radius: 0; overflow: hidden; font-size: 11px; }
      .stamp-cell { display: flex; flex-direction: column; align-items: center; border-left: 1px solid #c8c8c8; min-width: 58px; }
      .stamp-cell:first-child { border-left: none; }
      .stamp-role { background: #e0e0e0; width: 100%; text-align: center; padding: 3px 0; font-weight: 900; color: #374151; border-bottom: 1px solid #c8c8c8; }
      .stamp-sign { height: 44px; width: 100%; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .meta-box { border: 1px solid #c8c8c8; border-radius: 0; padding: 10px 12px; background: #f2f2f2; }
      .meta-label { font-size: 11px; font-weight: 800; color: #6b7280; margin-bottom: 4px; }
      .meta-value { font-size: 14px; font-weight: 700; color: #0f172a; white-space: pre-wrap; word-break: break-word; }
      .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .panel { border: 1px solid #c8c8c8; border-radius: 0; overflow: hidden; background: #ffffff; }
      .panel-head { padding: 10px 12px; font-size: 14px; font-weight: 900; border-bottom: 1px solid #c8c8c8; }
      .panel-head.before { background: #e0e0e0; color: #1f2937; }
      .panel-head.after { background: #e0e0e0; color: #1f2937; }
      .image-wrap { height: 260px; display: flex; align-items: center; justify-content: center; background: #ffffff; padding: 10px; }
      .image-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .memo { border-top: 1px solid #c8c8c8; padding: 10px 12px; min-height: 60px; background: #f7f7f7; }
      .memo-label { font-size: 12px; font-weight: 900; margin-bottom: 4px; color: #374151; }
      .memo-text { font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
      .law { border: 1px solid #c8c8c8; border-radius: 0; overflow: hidden; page-break-inside: avoid; margin-top: 24px; }
      .law-title { background: #e0e0e0; padding: 8px 14px; font-size: 12px; font-weight: 900; color: #1f2937; border-bottom: 1px solid #c8c8c8; }
      .law-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
      .law-item { display: flex; gap: 10px; align-items: flex-start; }
      .law-tag { flex-shrink: 0; width: 82px; text-align: center; background: #e0e0e0; color: #374151; border-radius: 0; padding: 2px 0; font-size: 10px; font-weight: 800; white-space: nowrap; margin-top: 2px; }
      .law-text { font-size: 11px; color: #374151; line-height: 1.65; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title-row">
        <h1>위험요인 처리완료 보고서</h1>
        <div class="stamp">
          <div class="stamp-cell"><div class="stamp-role">담당자</div><div class="stamp-sign"></div></div>
          <div class="stamp-cell"><div class="stamp-role">센터장</div><div class="stamp-sign"></div></div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-box">
          <div class="meta-label">제보 정보</div>
          <div class="meta-value">제보 ${escapeHtml(params.createdAt)} / ${escapeHtml(params.creator)}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">처리 정보</div>
          <div class="meta-value">처리 ${escapeHtml(params.improvedAt ?? "-")} / ${escapeHtml(params.improver)}</div>
        </div>
      </div>
      <div class="photos">
        <div class="panel">
          <div class="panel-head before">개선 전</div>
          <div class="image-wrap"><img src="${escapeHtml(params.beforeImageUrl)}" alt="before" /></div>
          <div class="memo">
            <div class="memo-label">개선 전 설명</div>
            <div class="memo-text">${escapeHtml(params.beforeMemo || "-")}</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head after">개선 후</div>
          <div class="image-wrap"><img src="${escapeHtml(params.afterImageUrl)}" alt="after" /></div>
          <div class="memo">
            <div class="memo-label">개선 후 설명</div>
            <div class="memo-text">${escapeHtml(params.afterMemo || "-")}</div>
          </div>
        </div>
      </div>
      <div class="law">
        <div class="law-title">위험성평가 관련 법령 참고 (산업안전보건법 · 중대재해처벌법)</div>
        <div class="law-body">
          <div class="law-item">
            <span class="law-tag">산안법 §36①</span>
            <span class="law-text">사업주는 건설물, 기계·기구·설비, 원재료, 가스, 증기, 분진 등에 의한 위험성 또는 건강장해를 사전에 평가하고, 그 결과에 따라 이 법과 이 법에 따른 명령에 의한 조치를 하여야 하며, 근로자의 위험 또는 건강장해를 방지하기 위하여 필요한 경우에는 추가적인 조치를 하여야 한다.</span>
          </div>
          <div class="law-item">
            <span class="law-tag">산안법 §36②</span>
            <span class="law-text">사업주는 제1항에 따른 위험성평가를 실시할 때 고용노동부장관이 정하여 고시하는 바에 따라 안전·보건에 관한 지식 또는 경험을 보유한 사람에게 위험성평가에 관한 업무를 위탁하거나 관련 자문을 받을 수 있다.</span>
          </div>
          <div class="law-item">
            <span class="law-tag">고시 §15</span>
            <span class="law-text">사업주는 위험성평가 결과 허용 불가능한 위험성이 있는 경우, 위험성 감소를 위한 대책을 수립하고 실행하여야 한다. 대책 시행 후에는 잔류 위험성이 허용 가능한 수준인지 재확인하여야 한다. (사업장 위험성평가에 관한 지침 — 고용노동부 고시 제2023-19호)</span>
          </div>
          <div class="law-item">
            <span class="law-tag">산안법 §38</span>
            <span class="law-text">사업주는 기계·기구·설비에 의한 위험, 폭발성·발화성·인화성 물질에 의한 위험, 전기·열·에너지에 의한 위험으로 인한 산업재해를 예방하기 위하여 필요한 안전조치를 하여야 한다.</span>
          </div>
          <div class="law-item">
            <span class="law-tag">중대재해법 §4①</span>
            <span class="law-text">사업주 또는 경영책임자등은 유해·위험요인의 확인·개선에 필요한 업무절차를 마련하고, 해당 업무절차에 따라 유해·위험요인의 확인 및 개선이 이루어지는지 반기 1회 이상 점검하여야 하며, 점검 결과에 따라 필요한 조치를 하여야 한다.</span>
          </div>
        </div>
      </div>
    </div>
    <script>
      window.onload = function () {
        setTimeout(function () {
          window.print();
        }, 250);
      };
    </script>
  </body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

function normalizeActionError(error: unknown, fallback: string) {
  const rawMessage = String((error as Error)?.message ?? fallback ?? "");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("document is not focused")) {
    return "복사에 실패했습니다. 브라우저 창이나 팝업 안쪽을 한 번 클릭한 뒤 다시 시도해 주세요.";
  }

  if (normalized.includes("clipboard")) {
    return "복사에 실패했습니다. 현재 브라우저에서 클립보드 접근이 허용되지 않았거나, 창 포커스가 벗어났습니다.";
  }

  return rawMessage || fallback;
}

export default function AdminHazardsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [sessionUid, setSessionUid] = useState("");

  const [loading, setLoading] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [savingAfterId, setSavingAfterId] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [unresolvedTotalCount, setUnresolvedTotalCount] = useState(0);
  const [pendingTotalCount, setPendingTotalCount] = useState(0);
  const [resolvedTotalCount, setResolvedTotalCount] = useState(0);
  const [pageCache, setPageCache] = useState<Record<number, HazardPagePayload>>({});

  const [reports, setReports] = useState<HazardListItem[]>([]);
  const [resMap, setResMap] = useState<Record<string, ResolutionRow>>({});

  // reports 바뀌면 이미지 preload 후 한 번에 표시
  useEffect(() => {
    if (reports.length === 0) { setImagesReady(true); return; }
    setImagesReady(false);
    let cancelled = false;
    const timeout = setTimeout(() => { if (!cancelled) setImagesReady(true); }, 1000);
    const urls: string[] = [];
    for (const r of reports) {
      if (r.photo_url) urls.push(r.photo_url);
      const res = (r as any).resolution;
      if (res?.after_public_url) urls.push(res.after_public_url);
    }
    Promise.all(urls.map((src) => new Promise<void>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    }))).then(() => { if (!cancelled) { clearTimeout(timeout); setImagesReady(true); } });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [reports]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});

  const [afterMemoById, setAfterMemoById] = useState<Record<string, string>>({});
  const [afterFileById, setAfterFileById] = useState<Record<string, File | null>>({});
  const [plannedDueDateById, setPlannedDueDateById] = useState<Record<string, string>>({});
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [previewReportId, setPreviewReportId] = useState<string | null>(null);
  const [previewBeforePhotoPath, setPreviewBeforePhotoPath] = useState<string | null>(null);

  const [editingResolutionId, setEditingResolutionId] = useState<string | null>(null);
  const [editAfterMemoById, setEditAfterMemoById] = useState<Record<string, string>>({});
  const [editAfterFileById, setEditAfterFileById] = useState<Record<string, File | null>>({});
  const [previewEditMode, setPreviewEditMode] = useState(false);

  const [msg, setMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToastTone(tone);
    setToastMsg(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(""), 1700);
  }, []);

  const setAfterFile = (reportId: string, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setAfterFileById((p) => ({ ...p, [reportId]: file }));
    setMsg("");
  };

  const pickImageFromDataTransfer = (dt: DataTransfer | null): File | null => {
    if (!dt) return null;
    if (dt.files && dt.files.length > 0) {
      for (const f of Array.from(dt.files)) {
        if (f.type.startsWith("image/")) return f;
      }
    }
    if (dt.items && dt.items.length > 0) {
      for (const item of Array.from(dt.items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f && f.type.startsWith("image/")) return f;
        }
      }
    }
    return null;
  };

  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const sess = data.session;
    if (!sess) return { ok: false as const };

    const uid = sess.user.id;
    const email = sess.user.email ?? "";
    setSessionUid(uid);

    // profiles + permissions 병렬 조회
    const [{ data: prof }, { data: perm }] = await Promise.all([
      supabase.from("profiles").select("id,work_part,is_admin").eq("id", uid).maybeSingle(),
      supabase.from("admin_menu_permissions").select("general_access").eq("menu_key", "admin_photos").maybeSingle(),
    ]);

    const hardAdmin = isMainAdminIdentity(uid, email);
    const main = hardAdmin || (!!prof && !!(prof as { is_admin?: boolean | null }).is_admin);
    const general = isGeneralAdminWorkPart((prof as { work_part?: string | null } | null)?.work_part);

    let admin = main;
    if (!admin && general) {
      const access = ((perm as { general_access?: AccessLevel | null } | null)?.general_access ?? "hidden") as AccessLevel;
      admin = access !== "hidden";
    }

    setIsAdmin(admin);
    setIsMainAdmin(main);

    return { ok: true as const, admin };
  };

  const applyHazardPayload = useCallback((payload: HazardPagePayload) => {
    const repRows = (payload.items ?? []) as HazardListItem[];
    setReports(repRows);
    if (typeof payload.totalCount === "number") setTotalCount(payload.totalCount);
    if (typeof payload.unresolvedTotalCount === "number") setUnresolvedTotalCount(payload.unresolvedTotalCount);
    if (typeof payload.pendingTotalCount === "number") setPendingTotalCount(payload.pendingTotalCount);
    if (typeof payload.resolvedTotalCount === "number") setResolvedTotalCount(payload.resolvedTotalCount);

    const map: Record<string, ResolutionRow> = {};
    const pMap: Record<string, ProfileRow> = {};
    const dueMap: Record<string, string> = {};
    for (const row of repRows) {
      if (row.resolution) {
        map[row.id] = row.resolution;
        dueMap[row.id] = row.resolution.planned_due_date ?? "";
      }
      pMap[row.user_id] = { id: row.user_id, name: row.creator_name };
      if (row.resolution?.improved_by) {
        pMap[row.resolution.improved_by] = {
          id: row.resolution.improved_by,
          name: row.improver_name,
        };
      }
    }
    setResMap(map);
    setProfilesById(pMap);
    setPlannedDueDateById(dueMap);
  }, []);

  const fetchHazardPage = useCallback(async (targetPage: number, options?: { includeSummary?: boolean }) => {
    const includeSummary = options?.includeSummary ?? (!(targetPage in pageCache) || totalCount === 0);
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;
    const token = session?.access_token;
    if (!token) throw new Error("세션이 없습니다. 다시 로그인해 주세요.");

    const search = new URLSearchParams({
      page: String(targetPage),
      pageSize: String(PAGE_SIZE),
      includeSummary: includeSummary ? "1" : "0",
    });
    const resp = await fetch(`/api/admin/hazards/list?${search.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      items?: HazardListItem[];
      totalCount?: number | null;
      unresolvedTotalCount?: number | null;
      pendingTotalCount?: number | null;
      resolvedTotalCount?: number | null;
    };
    if (!resp.ok || !payload.ok) {
      throw new Error(payload.message || "위험요인 제보 조회에 실패했습니다.");
    }
    return {
      items: payload.items ?? [],
      totalCount: typeof payload.totalCount === "number" ? payload.totalCount : undefined,
      unresolvedTotalCount: typeof payload.unresolvedTotalCount === "number" ? payload.unresolvedTotalCount : undefined,
      pendingTotalCount: typeof payload.pendingTotalCount === "number" ? payload.pendingTotalCount : undefined,
      resolvedTotalCount: typeof payload.resolvedTotalCount === "number" ? payload.resolvedTotalCount : undefined,
    } satisfies HazardPagePayload;
  }, [pageCache, totalCount]);

  const deleteReport = async (report: ReportRow) => {
    if (!isMainAdmin) return;
    const ok = window.confirm("이 위험요인 제보를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.");
    if (!ok) return;

    setDeletingReportId(report.id);
    setMsg("");
    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = session?.access_token;
      if (!token) throw new Error("세션이 없습니다. 다시 로그인해 주세요.");

      const resp = await fetch("/api/admin/hazards/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reportId: report.id }),
      });
      const payload = (await resp.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!resp.ok || !payload.ok) throw new Error(payload.message || "삭제에 실패했습니다.");

      setMsg("위험요인 제보를 삭제했습니다.");
      setPageCache({});
      await loadRows(true);
    } catch (e) {
      setMsg((e as Error)?.message ?? "삭제에 실패했습니다.");
    } finally {
      setDeletingReportId(null);
    }
  };

  const loadRows = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setMsg("");
    try {
      if (!forceRefresh && pageCache[page]) {
        applyHazardPayload(pageCache[page]);
      } else {
        const payload = await fetchHazardPage(page, { includeSummary: true });
        setPageCache((prev) => ({ ...prev, [page]: payload }));
        applyHazardPayload(payload);
      }
    } catch (e) {
      setMsg((e as Error)?.message ?? "위험요인 제보 조회에 실패했습니다.");
      setReports([]);
      setResMap({});
      setProfilesById({});
      setPlannedDueDateById({});
      setTotalCount(0);
      setUnresolvedTotalCount(0);
      setPendingTotalCount(0);
      setResolvedTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [applyHazardPayload, fetchHazardPage, page, pageCache]);

  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        const r = await loadAdmin();
        if (!r.ok || !r.admin) return;
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (checking || !isAdmin) return;
    loadRows();
  }, [checking, isAdmin, loadRows]);

  useEffect(() => {
    if (checking || !isAdmin || totalCount <= 0) return;
    const maxKnownPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const targets = [page - 1, page + 1].filter((value) => value >= 1 && value <= maxKnownPage && !pageCache[value]);
    if (targets.length === 0) return;

    let cancelled = false;
    void Promise.all(
      targets.map(async (targetPage) => {
        try {
          const payload = await fetchHazardPage(targetPage, { includeSummary: false });
          if (cancelled) return;
          setPageCache((prev) => (prev[targetPage] ? prev : { ...prev, [targetPage]: payload }));
        } catch {}
      })
    );

    return () => {
      cancelled = true;
    };
  }, [checking, fetchHazardPage, isAdmin, page, pageCache, totalCount]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewReportId(null);
        setPreviewBeforePhotoPath(null);
        setPreviewEditMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const previewReport = useMemo(() => reports.find((r) => r.id === previewReportId) ?? null, [reports, previewReportId]);
  const previewResolution = previewReport ? resMap[previewReport.id] : null;
  const previewStatus = getHazardStatus(previewResolution);
  const previewCreator = previewReport ? profilesById[previewReport.user_id]?.name ?? previewReport.user_id.slice(0, 8) : "-";
  const previewImprover = previewResolution?.improved_by ? profilesById[previewResolution.improved_by]?.name ?? previewResolution.improved_by.slice(0, 8) : "-";
  const previewBeforePhotos = useMemo(() => getReportBeforePhotos(previewReport), [previewReport]);
  const selectedPreviewBeforePhoto =
    previewBeforePhotos.find((photo) => photo.path === previewBeforePhotoPath) ?? previewBeforePhotos[0] ?? null;
  const previewBeforeImageUrl = selectedPreviewBeforePhoto?.url ?? "";
  const previewAfterImageUrl = previewResolution ? getHazardImageUrl(previewResolution.after_path, previewResolution.after_public_url) : "";

  useEffect(() => {
    setPreviewBeforePhotoPath(previewBeforePhotos[0]?.path ?? null);
  }, [previewReportId, previewBeforePhotos]);

  const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const savePlannedDueDate = async (report: ReportRow) => {
    const plannedDueDate = (plannedDueDateById[report.id] ?? "").trim();
    if (!plannedDueDate) {
      alert("개선예정일을 선택해 주세요.");
      return;
    }

    setSavingAfterId(report.id);
    setMsg("");
    try {
      const existing = resMap[report.id];
      const { error } = await supabase.from("hazard_report_resolutions").upsert(
        {
          report_id: report.id,
          after_path: existing?.after_path ?? null,
          after_public_url: existing?.after_public_url ?? null,
          after_memo: existing?.after_memo ?? null,
          improved_by: sessionUid,
          improved_at: existing?.after_public_url ? existing.improved_at : null,
          planned_due_date: plannedDueDate,
        },
        { onConflict: "report_id" }
      );
      if (error) throw error;

      setMsg(`개선예정일을 ${formatDueDateLabel(plannedDueDate)}로 저장했습니다.`);
      setPageCache({});
      await loadRows(true);
    } catch (e) {
      setMsg((e as Error)?.message ?? "개선예정일 저장에 실패했습니다.");
    } finally {
      setSavingAfterId(null);
    }
  };

  const uploadAfter = async (report: ReportRow) => {
    const file = afterFileById[report.id] ?? null;
    if (!file) {
      alert("개선 사진을 선택해 주세요.");
      return;
    }

    setSavingAfterId(report.id);
    setMsg("");
    try {
      const day = toKstDate(report.created_at);
      const ext = extFromName(file.name);
      const path = `resolved/${day}/${sessionUid}/${Date.now()}_${randomId()}.${ext}`;

      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess?.access_token) throw new Error("세션이 없습니다. 다시 로그인해 주세요.");
      const { publicUrl: afterUrl } = await uploadFileToR2({ file, bucket: "hazard-reports", path, accessToken: sess.access_token });

      const memo = (afterMemoById[report.id] ?? "").trim();

      const { error: upsertErr } = await supabase.from("hazard_report_resolutions").upsert(
        {
          report_id: report.id,
          after_path: path,
          after_public_url: afterUrl,
          after_memo: memo ? memo : null,
          improved_by: sessionUid,
          improved_at: new Date().toISOString(),
          planned_due_date: null,
        },
        { onConflict: "report_id" }
      );
      if (upsertErr) throw upsertErr;

      setAfterFileById((p) => ({ ...p, [report.id]: null }));
      setAfterMemoById((p) => ({ ...p, [report.id]: "" }));
      setMsg("개선사진 업로드 완료 (처리완료)");
      setPageCache({});
      await loadRows(true);
    } catch (e) {
      setMsg((e as Error)?.message ?? "개선사진 업로드 실패");
    } finally {
      setSavingAfterId(null);
    }
  };

  const saveEditResolution = async (report: ReportRow) => {
    const existing = resMap[report.id];
    if (!existing?.after_public_url) return;

    const newFile = editAfterFileById[report.id] ?? null;
    const newMemo = (editAfterMemoById[report.id] ?? "").trim();

    setSavingAfterId(report.id);
    setMsg("");
    try {
      let afterPath = existing.after_path;
      let afterUrl = existing.after_public_url;
      let improvedAt = existing.improved_at;

      if (newFile) {
        const day = toKstDate(report.created_at);
        const ext = extFromName(newFile.name);
        const path = `resolved/${day}/${sessionUid}/${Date.now()}_${randomId()}.${ext}`;
        const { data: { session: sess2 } } = await supabase.auth.getSession();
        if (!sess2?.access_token) throw new Error("세션이 없습니다. 다시 로그인해 주세요.");
        const { publicUrl: newUrl } = await uploadFileToR2({ file: newFile, bucket: "hazard-reports", path, accessToken: sess2.access_token });
        afterPath = path;
        afterUrl = newUrl;
        improvedAt = new Date().toISOString();
      }

      const { error: upsertErr } = await supabase.from("hazard_report_resolutions").upsert(
        {
          report_id: report.id,
          after_path: afterPath,
          after_public_url: afterUrl,
          after_memo: newMemo || null,
          improved_by: sessionUid,
          improved_at: improvedAt,
          planned_due_date: null,
        },
        { onConflict: "report_id" }
      );
      if (upsertErr) throw upsertErr;

      setEditingResolutionId(null);
      setPreviewEditMode(false);
      setEditAfterFileById((p) => ({ ...p, [report.id]: null }));
      setEditAfterMemoById((p) => ({ ...p, [report.id]: "" }));
      setMsg("개선 내용을 수정했습니다.");
      setPageCache({});
      await loadRows(true);
    } catch (e) {
      setMsg((e as Error)?.message ?? "수정에 실패했습니다.");
    } finally {
      setSavingAfterId(null);
    }
  };

  if (checking) return <div style={{ padding: 24, fontFamily: "Pretendard, system-ui, sans-serif", color: "#94A3B8", fontWeight: 700 }}>로딩...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, fontFamily: "Pretendard, system-ui, sans-serif" }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>권한이 없습니다.</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", width: "100%", background: "transparent", minHeight: 0, padding: "0 6px 8px" }}>
      <style>{`
        .btn-primary { transition: all 0.15s ease; }
        .btn-primary:hover:not(:disabled) { filter: brightness(0.82); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(30,41,59,0.32) !important; }
        .btn-primary:active:not(:disabled) { transform: translateY(0); filter: brightness(0.75); }
        .btn-secondary { transition: all 0.15s ease; }
        .btn-secondary:hover:not(:disabled) { background: #F1F5F9 !important; border-color: #94A3B8 !important; }
        .btn-secondary:active:not(:disabled) { background: #E2E8F0 !important; }
        .btn-danger { transition: all 0.15s ease; }
        .btn-danger:hover:not(:disabled) { filter: brightness(0.88); transform: translateY(-1px); box-shadow: 0 5px 14px rgba(239,68,68,0.35) !important; }
        .btn-danger:active:not(:disabled) { transform: translateY(0); filter: brightness(0.8); }
        .hazard-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .hazard-card:hover { box-shadow: 0 12px 30px rgba(2,32,46,0.14) !important; transform: translateY(-2px); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes imgFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes cardsReveal { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .cards-reveal { animation: cardsReveal 0.2s ease forwards; }
      `}</style>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 200, background: toastTone === "success" ? "linear-gradient(135deg,#103b53 0%,#0f766e 100%)" : "#DC2626", color: "white", padding: "11px 18px", borderRadius: 10, fontWeight: 900, fontSize: 13, boxShadow: "0 8px 24px rgba(16,59,83,0.38)" }}>
          {toastMsg}
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 1520, margin: "0 auto" }}>
        {/* 헤더 바 */}
        <div style={{ marginBottom: 16, borderRadius: 14, border: "1px solid #E2E8F0", background: "white", padding: "14px 18px", boxShadow: "0 4px 20px rgba(2,32,46,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ width: 4, height: 18, borderRadius: 2, background: "linear-gradient(180deg,#103b53,#0f766e)", flexShrink: 0 }} />
            <span style={{ fontWeight: 900, fontSize: 15, color: "#0F172A" }}>위험요인</span>
            <div style={{ width: 1, height: 14, background: "#E2E8F0", margin: "0 2px" }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ padding: "3px 10px", borderRadius: 7, background: unresolvedTotalCount > 0 ? "#FEE2E2" : "#F1F5F9", color: unresolvedTotalCount > 0 ? "#B91C1C" : "#94A3B8", fontWeight: 800, fontSize: 12, border: `1px solid ${unresolvedTotalCount > 0 ? "rgba(185,28,28,0.2)" : "#E2E8F0"}` }}>미처리 {unresolvedTotalCount}건</span>
              <span style={{ padding: "3px 10px", borderRadius: 7, background: pendingTotalCount > 0 ? "#FEF3C7" : "#F1F5F9", color: pendingTotalCount > 0 ? "#B45309" : "#94A3B8", fontWeight: 800, fontSize: 12, border: `1px solid ${pendingTotalCount > 0 ? "rgba(180,83,9,0.2)" : "#E2E8F0"}` }}>처리대기 {pendingTotalCount}건</span>
              <span style={{ padding: "3px 10px", borderRadius: 7, background: resolvedTotalCount > 0 ? "#DCFCE7" : "#F1F5F9", color: resolvedTotalCount > 0 ? "#166534" : "#94A3B8", fontWeight: 800, fontSize: 12, border: `1px solid ${resolvedTotalCount > 0 ? "rgba(22,163,74,0.2)" : "#E2E8F0"}` }}>처리완료 {resolvedTotalCount}건</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>{page} / {maxPage} (총 {totalCount}건)</span>
            <button className="btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ height: 32, padding: "0 14px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: page <= 1 ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? "#CBD5E1" : "#374151" }}>← 이전</button>
            <button className="btn-secondary" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage} style={{ height: 32, padding: "0 14px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: page >= maxPage ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: page >= maxPage ? "not-allowed" : "pointer", color: page >= maxPage ? "#CBD5E1" : "#374151" }}>다음 →</button>
            <button className="btn-primary" onClick={() => loadRows(true)} disabled={loading} style={{ height: 32, padding: "0 14px", borderRadius: 7, border: "none", background: loading ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 800, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>조회</button>
          </div>
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: "10px 16px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 13, color: "#374151", fontWeight: 700 }}>{msg}</div>
        )}

        {/* 카드 그리드 */}
        {(loading || (!imagesReady && reports.length > 0)) ? (
          <div style={{ borderRadius: 10, padding: 40, color: "#64748B", background: "#F8FAFC", textAlign: "center", fontWeight: 700, fontSize: 14, border: "1px dashed #E2E8F0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 400 }}>
            <div style={{ width: 40, height: 40, border: "3px solid #E2E8F0", borderTopColor: "#103b53", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            불러오는 중...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ borderRadius: 10, padding: 36, color: "#94A3B8", background: "#F8FAFC", textAlign: "center", fontWeight: 700, fontSize: 14, border: "1px dashed #E2E8F0" }}>데이터가 없습니다.</div>
        ) : (
          <div className="cards-reveal" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            {reports.map((r) => {
              const res = resMap[r.id];
              const status = getHazardStatus(res ?? null);
              const done = status.key === "done";
              const creator = profilesById[r.user_id]?.name ?? r.user_id.slice(0, 8);
              const improver = res?.improved_by ? profilesById[res.improved_by]?.name ?? res.improved_by.slice(0, 8) : "-";
              const afterMemo = afterMemoById[r.id] ?? "";
              const selectedAfterFile = afterFileById[r.id] ?? null;
              const isDragOver = dragOverId === r.id;
              const plannedDueDate = plannedDueDateById[r.id] ?? "";
              const beforePhotos = getReportBeforePhotos(r);
              const beforeThumbUrl = beforePhotos[0]?.url ?? getHazardImageUrl(r.photo_path, r.photo_url);
              const afterThumbUrl = getHazardImageUrl(res?.after_path, res?.after_public_url);

              return (
                <div key={r.id} className="hazard-card" style={{ borderRadius: 14, border: "1px solid #E2E8F0", background: "white", overflow: "hidden", boxShadow: "0 4px 20px rgba(2,32,46,0.08)" }}>
                  {/* 카드 헤더 */}
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFC", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 6, padding: "3px 9px", background: status.background, color: status.color, border: `1px solid ${status.color}33` }}>
                      {status.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>제보: {formatKST(r.created_at)} / {creator}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>사진 {beforePhotos.length}장</span>
                    {res?.improved_at && <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>개선: {formatKST(res.improved_at)} / {improver}</span>}
                    {status.key === "pending" && <span style={{ fontSize: 12, color: "#B45309", fontWeight: 800 }}>예정일: {formatDueDateLabel(res?.planned_due_date ?? null)}</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      {done && (
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            try {
                              const beforeOriginalUrl = beforePhotos[0]?.url ?? getHazardImageUrl(r.photo_path, r.photo_url);
                              const afterOriginalUrl = getHazardImageUrl(res?.after_path, res?.after_public_url);
                              printHazardResolutionSheet({ reportId: r.id, createdAt: formatKST(r.created_at), creator, improvedAt: formatKST(res?.improved_at ?? null), improver, beforeImageUrl: beforeOriginalUrl, afterImageUrl: afterOriginalUrl, beforeMemo: r.comment || "-", afterMemo: res?.after_memo || "개선 설명이 입력되지 않았습니다." });
                            } catch (e) { setMsg(normalizeActionError(e, "출력에 실패했습니다.")); }
                          }}
                          style={{ height: 28, padding: "0 10px", border: "1.5px solid #1D4ED8", borderRadius: 6, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
                        >
                          출력
                        </button>
                      )}
                      {isMainAdmin && (
                        <button
                          className="btn-danger"
                          onClick={() => deleteReport(r)}
                          disabled={deletingReportId === r.id}
                          style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 6, background: deletingReportId === r.id ? "#FECACA" : "#EF4444", color: "white", fontWeight: 900, fontSize: 12, cursor: deletingReportId === r.id ? "not-allowed" : "pointer" }}
                        >
                          {deletingReportId === r.id ? "삭제 중..." : "삭제"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 카드 바디 */}
                  <div style={{ padding: 12, display: "grid", gridTemplateColumns: "200px 1fr", gap: 10, alignItems: "start" }}>
                    {/* 사진 컬럼 */}
                    <div style={{ display: "grid", gap: 8 }}>
                      <section style={{ borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", height: 138, overflow: "hidden" }}>
                        <button
                          onClick={() => { setPreviewReportId(r.id); setPreviewBeforePhotoPath(beforePhotos[0]?.path ?? null); }}
                          style={{ width: "100%", height: "100%", border: "none", padding: 0, background: "transparent", cursor: "pointer", display: "block" }}
                          title="제보사진 크게 보기"
                        >
                          <img src={beforeThumbUrl} alt="before" loading="eager" decoding="async" fetchPriority="high" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#E2E8F0", opacity: 0 }} onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = "1"; }} />
                        </button>
                      </section>
                      <section style={{ borderRadius: 8, border: "1.5px solid #BFDBFE", background: "#F0F9FF", height: 138, overflow: "hidden" }}>
                        {res?.after_public_url ? (
                          <button
                            onClick={() => setPreviewReportId(r.id)}
                            style={{ width: "100%", height: "100%", border: "none", padding: 0, background: "transparent", cursor: "pointer", display: "block" }}
                            title="개선사진 크게 보기"
                          >
                            <img src={afterThumbUrl} alt="after" loading="eager" decoding="async" fetchPriority="high" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#E2E8F0", opacity: 0 }} onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = "1"; }} />
                          </button>
                        ) : (
                          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>
                            개선사진 없음
                          </div>
                        )}
                      </section>
                    </div>

                    {/* 텍스트/액션 컬럼 */}
                    <div style={{ display: "grid", gap: 8 }}>
                      <section style={{ borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", padding: 10, height: 138, boxSizing: "border-box", overflow: "auto" }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: "#1E3A8A", marginBottom: 6, letterSpacing: 0.3 }}>개선 전 설명</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.comment ?? "-"}</div>
                      </section>

                      {res?.after_public_url ? (
                        editingResolutionId === r.id ? (
                          <section style={{ borderRadius: 8, border: "1.5px solid #FCD34D", background: "#FFFBEB", padding: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: "#0F172A", marginBottom: 8 }}>개선 내용 수정</div>
                            <input id={`edit-file-${r.id}`} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && !f.type.startsWith("image/")) return; setEditAfterFileById((p) => ({ ...p, [r.id]: f })); }} style={{ display: "none" }} />
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <label htmlFor={`edit-file-${r.id}`} style={{ height: 32, padding: "0 10px", border: "1.5px solid #CBD5E1", borderRadius: 6, background: "white", fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", cursor: "pointer", whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {editAfterFileById[r.id] ? "✓ " + editAfterFileById[r.id]!.name.slice(0, 10) : "새 사진 (선택)"}
                              </label>
                              <input value={editAfterMemoById[r.id] ?? ""} onChange={(e) => setEditAfterMemoById((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="개선내용" style={{ flex: 1, minWidth: 100, height: 32, padding: "0 8px", borderRadius: 6, border: "1.5px solid #CBD5E1", background: "white", fontSize: 13 }} />
                            </div>
                            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 6 }}>
                              <button className="btn-secondary" onClick={() => { setEditingResolutionId(null); setEditAfterFileById((p) => ({ ...p, [r.id]: null })); }} style={{ height: 30, padding: "0 10px", border: "1.5px solid #CBD5E1", borderRadius: 6, background: "white", fontWeight: 900, fontSize: 12, cursor: "pointer" }}>취소</button>
                              <button onClick={() => saveEditResolution(r)} disabled={savingAfterId === r.id} style={{ height: 30, padding: "0 10px", border: "none", borderRadius: 6, background: savingAfterId === r.id ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 900, fontSize: 12, cursor: savingAfterId === r.id ? "not-allowed" : "pointer" }}>{savingAfterId === r.id ? "저장 중..." : "수정 저장"}</button>
                            </div>
                          </section>
                        ) : (
                          <section style={{ borderRadius: 8, border: "1.5px solid #BFDBFE", background: "#EFF6FF", padding: 10, height: 138, boxSizing: "border-box", overflow: "auto" }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: "#1D4ED8", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>개선 후 설명</span>
                              <button className="btn-secondary" onClick={() => { setEditingResolutionId(r.id); setEditAfterMemoById((p) => ({ ...p, [r.id]: res.after_memo ?? "" })); setEditAfterFileById((p) => ({ ...p, [r.id]: null })); }} style={{ height: 24, padding: "0 8px", border: "1.5px solid #93C5FD", borderRadius: 5, background: "white", color: "#1D4ED8", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>수정</button>
                            </div>
                            <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {res.after_memo ?? "개선 설명이 입력되지 않았습니다."}
                            </div>
                          </section>
                        )
                      ) : (
                        <section style={{ borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", padding: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#0F172A", marginBottom: 8 }}>개선 등록</div>
                          <input id={`after-file-${r.id}`} type="file" accept="image/*" onChange={(e) => setAfterFile(r.id, e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                          <div
                            tabIndex={0}
                            onDragOver={(e) => { e.preventDefault(); setDragOverId(r.id); }}
                            onDragLeave={() => setDragOverId((prev) => (prev === r.id ? null : prev))}
                            onDrop={(e) => { e.preventDefault(); setDragOverId(null); const f = pickImageFromDataTransfer(e.dataTransfer); if (f) setAfterFile(r.id, f); }}
                            onPaste={(e) => { const f = pickImageFromDataTransfer(e.clipboardData); if (f) { e.preventDefault(); setAfterFile(r.id, f); } }}
                            style={{ border: isDragOver ? "2px solid #2563EB" : "2px dashed #CBD5E1", borderRadius: 8, background: isDragOver ? "#EFF6FF" : "white", padding: 10, fontSize: 12, color: "#475569", outline: "none", cursor: "pointer" }}
                            title="클릭 후 Ctrl+V 붙여넣기 가능"
                          >
                            {selectedAfterFile ? (
                              <div><div style={{ fontWeight: 800, color: "#0F172A" }}>선택된 파일</div><div style={{ marginTop: 4 }}>{selectedAfterFile.name}</div></div>
                            ) : (
                              <div><div style={{ fontWeight: 800, color: "#0F172A" }}>개선 사진 넣기</div><div style={{ marginTop: 4 }}>드래그앤드롭 또는 클릭 후 Ctrl+V(붙여넣기)</div></div>
                            )}
                          </div>
                          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <label htmlFor={`after-file-${r.id}`} style={{ height: 32, padding: "0 12px", border: "1.5px solid #CBD5E1", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", cursor: "pointer", color: "#0F172A" }}>파일 선택</label>
                            <input value={afterMemo} onChange={(e) => setAfterMemoById((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="개선내용 입력 (예: 정리 완료, 안전표지 부착)" style={{ flex: 1, minWidth: 180, height: 32, padding: "0 10px", borderRadius: 7, border: "1.5px solid #CBD5E1", background: "white", fontSize: 12 }} />
                          </div>
                          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                            <input type="date" value={plannedDueDate} min={todayYMD()} onChange={(e) => setPlannedDueDateById((p) => ({ ...p, [r.id]: e.target.value }))} style={{ height: 32, padding: "0 10px", borderRadius: 7, border: "1.5px solid #CBD5E1", background: "white", color: "#0F172A" }} />
                            <button onClick={() => savePlannedDueDate(r)} disabled={savingAfterId === r.id} style={{ height: 32, padding: "0 12px", border: "1.5px solid #F59E0B", borderRadius: 7, background: "#FFF7ED", color: "#B45309", fontWeight: 900, fontSize: 12, cursor: savingAfterId === r.id ? "not-allowed" : "pointer" }}>{savingAfterId === r.id ? "저장 중..." : "처리대기 저장"}</button>
                            <button className="btn-primary" onClick={() => uploadAfter(r)} disabled={savingAfterId === r.id} style={{ height: 32, padding: "0 12px", border: "none", borderRadius: 7, background: savingAfterId === r.id ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 900, fontSize: 12, cursor: savingAfterId === r.id ? "not-allowed" : "pointer" }}>{savingAfterId === r.id ? "업로드 중..." : "처리완료 등록"}</button>
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {previewReport && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setPreviewReportId(null); setPreviewBeforePhotoPath(null); setPreviewEditMode(false); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.82)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)" }}
        >
          <div style={{ width: "min(1180px, 96vw)", maxHeight: "90vh", overflow: "auto", position: "relative", background: "white", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 30px 60px rgba(2,6,23,0.45)" }}>
            {/* 모달 헤더 */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 900, fontSize: 15, color: "#0F172A" }}>위험요인 비교 보기</span>
                <span style={{ marginLeft: 10, color: "#94A3B8", fontSize: 12, fontWeight: 700 }}>제보 {formatKST(previewReport.created_at)} / {previewCreator}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {previewStatus.key === "done" && previewBeforeImageUrl && previewAfterImageUrl && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      try {
                        printHazardResolutionSheet({ reportId: previewReport.id, createdAt: formatKST(previewReport.created_at), creator: previewCreator, improvedAt: formatKST(previewResolution?.improved_at ?? null), improver: previewImprover, beforeImageUrl: previewBeforeImageUrl, afterImageUrl: previewAfterImageUrl, beforeMemo: previewReport.comment || "-", afterMemo: previewResolution?.after_memo || "개선 설명이 입력되지 않았습니다." });
                      } catch (e) { toast(normalizeActionError(e, "출력에 실패했습니다."), "error"); }
                    }}
                    style={{ height: 32, padding: "0 14px", borderRadius: 7, border: "1.5px solid #1D4ED8", background: "#EFF6FF", color: "#1D4ED8", cursor: "pointer", fontSize: 13, fontWeight: 900 }}
                  >
                    출력
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => { setPreviewReportId(null); setPreviewBeforePhotoPath(null); setPreviewEditMode(false); }}
                  style={{ width: 32, height: 32, borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", cursor: "pointer", fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* 모달 바디 */}
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <section style={{ borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", background: "white" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#0F172A", fontSize: 14 }}>개선 전 (위험제보 {previewBeforePhotos.length}장)</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-secondary" onClick={async () => { try { if (!previewBeforeImageUrl) return; await forceDownload(previewBeforeImageUrl, `hazard_before_${previewReport.id}.jpg`); } catch (e) { toast(normalizeActionError(e, "다운로드에 실패했습니다."), "error"); } }} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1.5px solid #CBD5E1", background: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>다운로드</button>
                    <button className="btn-secondary" onClick={async () => { try { if (!previewBeforeImageUrl) return; await copyImageToClipboard(previewBeforeImageUrl); toast("클립보드에 이미지가 복사되었습니다."); } catch (e) { toast(normalizeActionError(e, "복사에 실패했습니다."), "error"); } }} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1.5px solid #CBD5E1", background: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>복사</button>
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <img src={previewBeforeImageUrl} alt="hazard-before" loading="eager" decoding="async" fetchPriority="high" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #E5E7EB", background: "white" }} />
                  {previewBeforePhotos.length > 1 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {previewBeforePhotos.map((photo, idx) => (
                        <button key={photo.path} onClick={() => setPreviewBeforePhotoPath(photo.path)} style={{ width: 72, height: 72, borderRadius: 7, overflow: "hidden", border: photo.path === selectedPreviewBeforePhoto?.path ? "3px solid #1D4ED8" : "1.5px solid #CBD5E1", background: "#fff", display: "block", padding: 0, cursor: "pointer", boxShadow: photo.path === selectedPreviewBeforePhoto?.path ? "0 0 0 2px rgba(29,78,216,0.15)" : "none" }} title={`제보사진 ${idx + 1} 보기`}>
                          <img src={photo.url} alt={`preview-before-${idx + 1}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", background: "#FFFFFF" }} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 10, borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#1E3A8A", marginBottom: 6 }}>개선 전 설명</div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{previewReport.comment || "-"}</div>
                  </div>
                </div>
              </section>

              <section style={{ borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden", background: "white" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#0F172A", fontSize: 14 }}>
                    개선 후
                    <span style={{ marginLeft: 10, color: "#94A3B8", fontSize: 12, fontWeight: 700 }}>
                      {previewStatus.key === "done" ? `${formatKST(previewResolution?.improved_at ?? null)} / ${previewImprover}` : previewStatus.key === "pending" ? `처리대기 / 예정일 ${formatDueDateLabel(previewResolution?.planned_due_date ?? null)}` : "미처리"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {previewStatus.key === "done" && (
                      <button className="btn-secondary" onClick={() => { if (previewEditMode) { setPreviewEditMode(false); if (previewReport) setEditAfterFileById((p) => ({ ...p, [previewReport.id]: null })); } else { setPreviewEditMode(true); if (previewReport) { setEditAfterMemoById((p) => ({ ...p, [previewReport.id]: previewResolution?.after_memo ?? "" })); setEditAfterFileById((p) => ({ ...p, [previewReport.id]: null })); } } }} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: previewEditMode ? "1.5px solid #F59E0B" : "1.5px solid #CBD5E1", background: previewEditMode ? "#FFF7ED" : "white", color: previewEditMode ? "#B45309" : "#111827", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{previewEditMode ? "수정취소" : "수정"}</button>
                    )}
                    <button className="btn-secondary" onClick={async () => { if (!previewResolution?.after_public_url) return; try { await forceDownload(previewResolution.after_public_url, `hazard_after_${previewReport.id}.jpg`); } catch (e) { toast(normalizeActionError(e, "다운로드에 실패했습니다."), "error"); } }} disabled={!previewResolution?.after_public_url} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1.5px solid #CBD5E1", background: previewResolution?.after_public_url ? "white" : "#F3F4F6", color: previewResolution?.after_public_url ? "#111827" : "#9CA3AF", fontSize: 12, fontWeight: 800, cursor: previewResolution?.after_public_url ? "pointer" : "not-allowed" }}>다운로드</button>
                    <button className="btn-secondary" onClick={async () => { if (!previewResolution?.after_public_url) return; try { await copyImageToClipboard(previewResolution.after_public_url); toast("클립보드에 이미지가 복사되었습니다."); } catch (e) { toast(normalizeActionError(e, "복사에 실패했습니다."), "error"); } }} disabled={!previewResolution?.after_public_url} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1.5px solid #CBD5E1", background: previewResolution?.after_public_url ? "white" : "#F3F4F6", color: previewResolution?.after_public_url ? "#111827" : "#9CA3AF", fontSize: 12, fontWeight: 800, cursor: previewResolution?.after_public_url ? "pointer" : "not-allowed" }}>복사</button>
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  {previewEditMode && previewReport ? (
                    <div style={{ borderRadius: 8, border: "1.5px solid #FCD34D", background: "#FFFBEB", padding: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#0F172A", marginBottom: 12 }}>개선 내용 수정</div>
                      <input id="preview-edit-file" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && !f.type.startsWith("image/")) return; setEditAfterFileById((p) => ({ ...p, [previewReport.id]: f })); }} style={{ display: "none" }} />
                      <div style={{ marginBottom: 10 }}>
                        <label htmlFor="preview-edit-file" style={{ display: "inline-flex", alignItems: "center", height: 34, padding: "0 14px", border: "1.5px solid #CBD5E1", borderRadius: 7, background: "white", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>
                          {editAfterFileById[previewReport.id] ? "✓ " + editAfterFileById[previewReport.id]!.name : "새 사진 선택 (선택사항)"}
                        </label>
                      </div>
                      <textarea value={editAfterMemoById[previewReport.id] ?? ""} onChange={(e) => setEditAfterMemoById((p) => ({ ...p, [previewReport.id]: e.target.value }))} placeholder="개선내용 입력" rows={4} style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #CBD5E1", background: "white", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <button className="btn-secondary" onClick={() => { setPreviewEditMode(false); setEditAfterFileById((p) => ({ ...p, [previewReport.id]: null })); }} style={{ height: 34, padding: "0 14px", border: "1.5px solid #CBD5E1", borderRadius: 7, background: "white", fontWeight: 900, cursor: "pointer" }}>취소</button>
                        <button className="btn-primary" onClick={() => saveEditResolution(previewReport)} disabled={savingAfterId === previewReport.id} style={{ height: 34, padding: "0 14px", border: "none", borderRadius: 7, background: savingAfterId === previewReport.id ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 900, cursor: savingAfterId === previewReport.id ? "not-allowed" : "pointer" }}>{savingAfterId === previewReport.id ? "저장 중..." : "수정 저장"}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {previewResolution?.after_public_url ? (
                        <img src={previewAfterImageUrl} alt="hazard-after" loading="eager" decoding="async" fetchPriority="high" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, border: "1px solid #E5E7EB", background: "white" }} />
                      ) : (
                        <div style={{ height: 260, borderRadius: 8, border: "1px dashed #CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13, fontWeight: 700 }}>
                          아직 개선사진이 등록되지 않았습니다.
                        </div>
                      )}
                      <div style={{ marginTop: 10, borderRadius: 8, border: "1.5px solid #BFDBFE", background: "#EFF6FF", padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#1D4ED8", marginBottom: 6 }}>개선 후 설명</div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {previewResolution?.after_memo || "개선 설명이 입력되지 않았습니다."}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
