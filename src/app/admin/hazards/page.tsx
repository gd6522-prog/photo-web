"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/admin-access";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";
import { copyCompressedImageUrlToClipboard } from "@/lib/clipboard-image";

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
  await copyCompressedImageUrlToClipboard(url, { maxBytes: 1024 * 1024 });
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
      .sheet { width: 100%; min-height: calc(297mm - 20mm); display: flex; flex-direction: column; gap: 12px; }
      .title { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
      .title h1 { margin: 0; font-size: 24px; }
      .badge { background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 800; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .meta-box { border: 1px solid #dbe4ee; border-radius: 12px; padding: 10px 12px; background: #f8fafc; }
      .meta-label { font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 4px; }
      .meta-value { font-size: 14px; font-weight: 700; color: #0f172a; white-space: pre-wrap; word-break: break-word; }
      .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .panel { border: 1px solid #dbe4ee; border-radius: 14px; overflow: hidden; background: #ffffff; }
      .panel-head { padding: 10px 12px; font-size: 14px; font-weight: 900; border-bottom: 1px solid #e2e8f0; }
      .panel-head.before { background: #eff6ff; color: #1d4ed8; }
      .panel-head.after { background: #ecfdf5; color: #047857; }
      .image-wrap { height: 340px; display: flex; align-items: center; justify-content: center; background: #ffffff; padding: 10px; }
      .image-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .memo { border-top: 1px solid #e2e8f0; padding: 12px; min-height: 120px; background: #fcfdff; }
      .memo-label { font-size: 12px; font-weight: 900; margin-bottom: 6px; color: #334155; }
      .memo-text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
      .approval { margin-top: auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; }
      .approval-title { background: #f1f5f9; padding: 8px 14px; font-size: 12px; font-weight: 900; color: #334155; border-bottom: 1px solid #cbd5e1; }
      .approval-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; }
      .approval-cell { padding: 10px 14px; border-right: 1px solid #e2e8f0; }
      .approval-cell:last-child { border-right: none; }
      .approval-role { font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 28px; }
      .approval-sign { font-size: 11px; color: #94a3b8; text-align: right; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title">
        <h1>위험요인 처리완료 보고서</h1>
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
      <div class="approval">
        <div class="approval-title">결재</div>
        <div class="approval-grid">
          <div class="approval-cell"><div class="approval-role">담당자</div><div class="approval-sign">(인)</div></div>
          <div class="approval-cell"><div class="approval-role">검토자</div><div class="approval-sign">(인)</div></div>
          <div class="approval-cell"><div class="approval-role">승인자</div><div class="approval-sign">(인)</div></div>
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
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});

  const [afterMemoById, setAfterMemoById] = useState<Record<string, string>>({});
  const [afterFileById, setAfterFileById] = useState<Record<string, File | null>>({});
  const [plannedDueDateById, setPlannedDueDateById] = useState<Record<string, string>>({});
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [previewReportId, setPreviewReportId] = useState<string | null>(null);
  const [previewBeforePhotoPath, setPreviewBeforePhotoPath] = useState<string | null>(null);

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

    const { data: prof } = await supabase
      .from("profiles")
      .select("id,work_part,is_admin")
      .eq("id", uid)
      .maybeSingle();

    const hardAdmin = isMainAdminIdentity(uid, email);
    const main = hardAdmin || (!!prof && !!(prof as { is_admin?: boolean | null }).is_admin);
    const general = isGeneralAdminWorkPart((prof as { work_part?: string | null } | null)?.work_part);

    let admin = main;
    if (!admin && general) {
      const { data: perm } = await supabase
        .from("admin_menu_permissions")
        .select("general_access")
        .eq("menu_key", "admin_photos")
        .maybeSingle();

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

      const { error: upErr } = await supabase.storage.from("hazard-reports").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("hazard-reports").getPublicUrl(path);
      const afterUrl = pub.publicUrl;

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

  if (checking) return <div style={{ padding: 16, color: "#6B7280" }}>로딩...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>권한이 없습니다.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 16px", maxWidth: 1520, margin: "0 auto", fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>위험요인</h1>

      <div
        style={{
          marginTop: 8,
          border: "1px solid #DDE3EA",
          borderRadius: 16,
          background: "white",
          boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
          padding: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, color: unresolvedTotalCount > 0 ? "#DC2626" : "#111827" }}>미처리 {unresolvedTotalCount}건</div>
          <div style={{ fontWeight: 900, color: pendingTotalCount > 0 ? "#B45309" : "#64748B" }}>처리대기 {pendingTotalCount}건</div>
          <div style={{ fontWeight: 900, color: resolvedTotalCount > 0 ? "#166534" : "#64748B" }}>처리완료 {resolvedTotalCount}건</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>전체 기준</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ height: 32, padding: "0 10px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", fontWeight: 900 }}
          >
            이전
          </button>
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 900 }}>
            {page} / {maxPage} (총 {totalCount}건)
          </div>
          <button
            onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
            disabled={page >= maxPage}
            style={{ height: 32, padding: "0 10px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", fontWeight: 900 }}
          >
            다음
          </button>
          <button
            onClick={() => loadRows(true)}
            disabled={loading}
            style={{ height: 32, padding: "0 10px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", fontWeight: 900 }}
          >
            {loading ? "불러오는 중..." : "조회"}
          </button>
        </div>
      </div>

      {msg ? <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>{msg}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {reports.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", border: "1px solid #DDE3EA", borderRadius: 16, background: "white", padding: 14, color: "#6B7280" }}>데이터가 없습니다.</div>
        ) : (
          reports.map((r, idx) => {
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
            const eagerLoad = idx < 2;

            return (
              <div key={r.id} style={{ border: "1px solid #DDE3EA", borderRadius: 14, background: "white", padding: 10, boxShadow: "0 4px 14px rgba(15,23,42,0.05)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      borderRadius: 999,
                      padding: "3px 7px",
                      background: status.background,
                      color: status.color,
                    }}
                  >
                    {status.label}
                  </span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>제보: {formatKST(r.created_at)} / {creator}</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>사진 {beforePhotos.length}장</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>개선: {formatKST(res?.improved_at ?? null)} / {improver}</span>
                  {status.key === "pending" ? <span style={{ fontSize: 12, color: "#B45309", fontWeight: 800 }}>예정일: {formatDueDateLabel(res?.planned_due_date ?? null)}</span> : null}
                  {isMainAdmin ? (
                    <button
                      onClick={() => deleteReport(r)}
                      disabled={deletingReportId === r.id}
                      style={{ marginLeft: "auto", height: 28, padding: "0 10px", border: "1px solid #FCA5A5", borderRadius: 8, background: "#FEF2F2", color: "#B91C1C", fontWeight: 900, fontSize: 12 }}
                    >
                      {deletingReportId === r.id ? "삭제 중..." : "삭제"}
                    </button>
                  ) : null}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "start" }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#FFFFFF", height: 138, boxSizing: "border-box", overflow: "hidden" }}>
                      <button
                        onClick={() => {
                          setPreviewReportId(r.id);
                          setPreviewBeforePhotoPath(beforePhotos[0]?.path ?? null);
                        }}
                        style={{ width: "100%", height: 138, border: "none", padding: 0, background: "#FFFFFF", cursor: "pointer", display: "block" }}
                        title="제보사진 크게 보기"
                      >
                        <img src={beforeThumbUrl} alt="before" loading={eagerLoad ? "eager" : "lazy"} decoding="async" fetchPriority={eagerLoad ? "high" : "auto"} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#FFFFFF" }} />
                      </button>
                    </section>
                    <section style={{ border: "1px solid #BFDBFE", borderRadius: 10, background: "#FFFFFF", height: 138, boxSizing: "border-box", overflow: "hidden" }}>
                      {res?.after_public_url ? (
                        <button
                          onClick={() => setPreviewReportId(r.id)}
                          style={{ width: "100%", height: 138, border: "none", padding: 0, background: "#FFFFFF", cursor: "pointer", display: "block" }}
                          title="개선사진 크게 보기"
                        >
                          <img src={afterThumbUrl} alt="after" loading={eagerLoad ? "eager" : "lazy"} decoding="async" fetchPriority={eagerLoad ? "high" : "auto"} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#FFFFFF" }} />
                        </button>
                      ) : (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#6B7280", background: "white" }}>
                          개선사진 없음
                        </div>
                      )}
                    </section>
                  </div>

                  <div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#F8FAFC", padding: 10, height: 138, boxSizing: "border-box", overflow: "auto" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#1E3A8A", marginBottom: 6 }}>개선 전 설명</div>
                        <div style={{ fontSize: 14, lineHeight: 1.55, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.comment ?? "-"}</div>
                      </section>

                      {res?.after_public_url ? (
                        <section style={{ border: "1px solid #BFDBFE", borderRadius: 10, background: "#EFF6FF", padding: 10, height: 138, boxSizing: "border-box", overflow: "auto" }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#1D4ED8", marginBottom: 6 }}>개선 후 설명</div>
                          <div style={{ fontSize: 14, lineHeight: 1.55, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {res.after_memo ?? "개선 설명이 입력되지 않았습니다."}
                          </div>
                        </section>
                      ) : (
                        <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#F8FAFC", padding: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "#0F172A", marginBottom: 8 }}>개선 등록</div>

                          <input
                            id={`after-file-${r.id}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => setAfterFile(r.id, e.target.files?.[0] ?? null)}
                            style={{ display: "none" }}
                          />

                          <div
                            tabIndex={0}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOverId(r.id);
                            }}
                            onDragLeave={() => setDragOverId((prev) => (prev === r.id ? null : prev))}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverId(null);
                              const f = pickImageFromDataTransfer(e.dataTransfer);
                              if (f) setAfterFile(r.id, f);
                            }}
                            onPaste={(e) => {
                              const f = pickImageFromDataTransfer(e.clipboardData);
                              if (f) {
                                e.preventDefault();
                                setAfterFile(r.id, f);
                              }
                            }}
                            style={{
                              border: isDragOver ? "2px solid #2563EB" : "2px dashed #CBD5E1",
                              borderRadius: 10,
                              background: isDragOver ? "#EFF6FF" : "white",
                              padding: 12,
                              fontSize: 12,
                              color: "#475569",
                              outline: "none",
                              cursor: "pointer",
                            }}
                            title="클릭 후 Ctrl+V 붙여넣기 가능"
                          >
                            {selectedAfterFile ? (
                              <div>
                                <div style={{ fontWeight: 800, color: "#0F172A" }}>선택된 파일</div>
                                <div style={{ marginTop: 4 }}>{selectedAfterFile.name}</div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontWeight: 800, color: "#0F172A" }}>개선 사진 넣기</div>
                                <div style={{ marginTop: 4 }}>드래그앤드롭 또는 클릭 후 Ctrl+V(붙여넣기)</div>
                              </div>
                            )}
                          </div>

                          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <label
                              htmlFor={`after-file-${r.id}`}
                              style={{
                                height: 32,
                                padding: "0 12px",
                                border: "1px solid #CBD5E1",
                                borderRadius: 8,
                                background: "white",
                                fontSize: 12,
                                fontWeight: 900,
                                display: "inline-flex",
                                alignItems: "center",
                                cursor: "pointer",
                                color: "#0F172A",
                              }}
                            >
                              파일 선택
                            </label>
                            <input
                              value={afterMemo}
                              onChange={(e) => setAfterMemoById((p) => ({ ...p, [r.id]: e.target.value }))}
                              placeholder="개선내용 입력 (예: 정리 완료, 안전표지 부착)"
                              style={{ flex: 1, minWidth: 220, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #CBD5E1", background: "white" }}
                            />
                          </div>

                          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                            <input
                              type="date"
                              value={plannedDueDate}
                              min={todayYMD()}
                              onChange={(e) => setPlannedDueDateById((p) => ({ ...p, [r.id]: e.target.value }))}
                              style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #CBD5E1", background: "white", color: "#0F172A" }}
                            />
                            <button
                              onClick={() => savePlannedDueDate(r)}
                              disabled={savingAfterId === r.id}
                              style={{ height: 32, padding: "0 12px", border: "1px solid #F59E0B", borderRadius: 8, background: "#FFF7ED", color: "#B45309", fontWeight: 900 }}
                            >
                              {savingAfterId === r.id ? "저장 중..." : "처리대기 저장"}
                            </button>
                            <button
                              onClick={() => uploadAfter(r)}
                              disabled={savingAfterId === r.id}
                              style={{ height: 32, padding: "0 12px", border: "1px solid #111827", borderRadius: 8, background: "white", fontWeight: 900 }}
                            >
                              {savingAfterId === r.id ? "업로드 중..." : "처리완료 등록"}
                            </button>
                          </div>
                        </section>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {previewReport && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewReportId(null);
              setPreviewBeforePhotoPath(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.56)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(1180px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
              background: "white",
              borderRadius: 16,
              border: "1px solid #DDE3EA",
              boxShadow: "0 30px 60px rgba(2,6,23,0.35)",
            }}
          >
            {toastMsg ? (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 10050,
                  padding: "12px 18px",
                  borderRadius: 999,
                  background: toastTone === "success" ? "rgba(15,23,42,0.86)" : "rgba(127,29,29,0.92)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: "0 10px 30px rgba(2,6,23,0.22)",
                  pointerEvents: "none",
                  maxWidth: "min(72vw, 420px)",
                  textAlign: "center",
                  backdropFilter: "blur(6px)",
                }}
              >
                {toastMsg}
              </div>
            ) : null}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, color: "#0F172A" }}>
                위험요인 비교 보기
                <span style={{ marginLeft: 10, color: "#64748B", fontSize: 12, fontWeight: 700 }}>
                  제보 {formatKST(previewReport.created_at)} / {previewCreator}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {previewStatus.key === "done" && previewBeforeImageUrl && previewAfterImageUrl ? (
                  <button
                    onClick={() => {
                      try {
                        printHazardResolutionSheet({
                          reportId: previewReport.id,
                          createdAt: formatKST(previewReport.created_at),
                          creator: previewCreator,
                          improvedAt: formatKST(previewResolution?.improved_at ?? null),
                          improver: previewImprover,
                          beforeImageUrl: previewBeforeImageUrl,
                          afterImageUrl: previewAfterImageUrl,
                          beforeMemo: previewReport.comment || "-",
                          afterMemo: previewResolution?.after_memo || "개선 설명이 입력되지 않았습니다.",
                        });
                      } catch (e) {
                        toast(normalizeActionError(e, "출력에 실패했습니다."), "error");
                      }
                    }}
                    style={{ height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid #1D4ED8", background: "#EFF6FF", color: "#1D4ED8", cursor: "pointer", fontSize: 12, fontWeight: 900 }}
                  >
                    출력
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    setPreviewReportId(null);
                    setPreviewBeforePhotoPath(null);
                  }}
                  style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid #CBD5E1", background: "white", cursor: "pointer", fontWeight: 900 }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <section style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", background: "#FCFDFE" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#0F172A" }}>개선 전 (위험제보 {previewBeforePhotos.length}장)</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={async () => {
                        try {
                          if (!previewBeforeImageUrl) return;
                          await forceDownload(previewBeforeImageUrl, `hazard_before_${previewReport.id}.jpg`);
                        } catch (e) {
                          toast(normalizeActionError(e, "다운로드에 실패했습니다."), "error");
                        }
                      }}
                      style={{ height: 28, padding: "0 9px", borderRadius: 8, border: "1px solid #CBD5E1", background: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      다운로드
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          if (!previewBeforeImageUrl) return;
                          await copyImageToClipboard(previewBeforeImageUrl);
                          toast("클립보드에 이미지가 복사되었습니다.");
                        } catch (e) {
                          toast(normalizeActionError(e, "복사에 실패했습니다."), "error");
                        }
                      }}
                      style={{ height: 28, padding: "0 9px", borderRadius: 8, border: "1px solid #CBD5E1", background: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      복사
                    </button>
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <img src={previewBeforeImageUrl} alt="hazard-before" loading="eager" decoding="async" fetchPriority="high" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 10, border: "1px solid #E5E7EB", background: "white" }} />
                  {previewBeforePhotos.length > 1 ? (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {previewBeforePhotos.map((photo, idx) => (
                        <button
                          key={photo.path}
                          onClick={() => setPreviewBeforePhotoPath(photo.path)}
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 10,
                            overflow: "hidden",
                            border: photo.path === selectedPreviewBeforePhoto?.path ? "3px solid #1D4ED8" : "1px solid #CBD5E1",
                            background: "#fff",
                            display: "block",
                            padding: 0,
                            cursor: "pointer",
                            boxShadow: photo.path === selectedPreviewBeforePhoto?.path ? "0 0 0 2px rgba(29,78,216,0.12)" : "none",
                          }}
                          title={`제보사진 ${idx + 1} 보기`}
                        >
                          <img src={photo.url} alt={`preview-before-${idx + 1}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", background: "#FFFFFF" }} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ marginTop: 10, border: "1px solid #E2E8F0", borderRadius: 10, background: "white", padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#1E3A8A", marginBottom: 6 }}>개선 전 설명</div>
                    <div style={{ fontSize: 15, lineHeight: 1.6, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{previewReport.comment || "-"}</div>
                  </div>
                </div>
              </section>

              <section style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", background: "#FCFDFE" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#0F172A" }}>
                    개선 후
                    <span style={{ marginLeft: 10, color: "#64748B", fontSize: 12, fontWeight: 700 }}>
                      {previewStatus.key === "done"
                        ? `${formatKST(previewResolution?.improved_at ?? null)} / ${previewImprover}`
                        : previewStatus.key === "pending"
                          ? `처리대기 / 예정일 ${formatDueDateLabel(previewResolution?.planned_due_date ?? null)}`
                          : "미처리"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={async () => {
                        if (!previewResolution?.after_public_url) return;
                        try {
                          await forceDownload(previewResolution.after_public_url, `hazard_after_${previewReport.id}.jpg`);
                        } catch (e) {
                          toast(normalizeActionError(e, "다운로드에 실패했습니다."), "error");
                        }
                      }}
                      disabled={!previewResolution?.after_public_url}
                      style={{
                        height: 28,
                        padding: "0 9px",
                        borderRadius: 8,
                        border: "1px solid #CBD5E1",
                        background: previewResolution?.after_public_url ? "white" : "#F3F4F6",
                        color: previewResolution?.after_public_url ? "#111827" : "#9CA3AF",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: previewResolution?.after_public_url ? "pointer" : "not-allowed",
                      }}
                    >
                      다운로드
                    </button>
                    <button
                      onClick={async () => {
                        if (!previewResolution?.after_public_url) return;
                        try {
                          await copyImageToClipboard(previewResolution.after_public_url);
                          toast("클립보드에 이미지가 복사되었습니다.");
                        } catch (e) {
                          toast(normalizeActionError(e, "복사에 실패했습니다."), "error");
                        }
                      }}
                      disabled={!previewResolution?.after_public_url}
                      style={{
                        height: 28,
                        padding: "0 9px",
                        borderRadius: 8,
                        border: "1px solid #CBD5E1",
                        background: previewResolution?.after_public_url ? "white" : "#F3F4F6",
                        color: previewResolution?.after_public_url ? "#111827" : "#9CA3AF",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: previewResolution?.after_public_url ? "pointer" : "not-allowed",
                      }}
                    >
                      복사
                    </button>
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  {previewResolution?.after_public_url ? (
                    <img
                      src={previewAfterImageUrl}
                      alt="hazard-after"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 10, border: "1px solid #E5E7EB", background: "white" }}
                    />
                  ) : (
                    <div style={{ height: 260, border: "1px dashed #CBD5E1", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 13 }}>
                      아직 개선사진이 등록되지 않았습니다.
                    </div>
                  )}
                  <div style={{ marginTop: 10, border: "1px solid #BFDBFE", borderRadius: 10, background: "#EFF6FF", padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#1D4ED8", marginBottom: 6 }}>개선 후 설명</div>
                    <div style={{ fontSize: 15, lineHeight: 1.6, color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {previewResolution?.after_memo || "개선 설명이 입력되지 않았습니다."}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
