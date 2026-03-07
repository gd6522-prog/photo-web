"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";

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
};

type ProfileRow = {
  id: string;
  name: string | null;
};

type HazardListItem = ReportRow & {
  creator_name: string | null;
  improver_name: string | null;
  resolution: ResolutionRow | null;
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
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
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
  const hasClipboardWrite = !!(navigator.clipboard as { write?: unknown })?.write;
  const hasClipboardItem = typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";
  if (!hasClipboardWrite || !hasClipboardItem) {
    throw new Error("현재 브라우저는 이미지 클립보드를 지원하지 않습니다.");
  }

  if (!document.hasFocus()) {
    window.focus();
    await new Promise((r) => setTimeout(r, 80));
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`이미지 조회 실패: ${res.status}`);
  const blob = await res.blob();

  const pngBlob = await (async () => {
    if (typeof createImageBitmap === "undefined") return blob;
    try {
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      ctx.drawImage(bmp, 0, 0);
      const out: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), "image/png"));
      return out;
    } catch {
      return blob;
    }
  })();

  const item = new (window as unknown as { ClipboardItem: new (arg: Record<string, Blob>) => unknown }).ClipboardItem({
    "image/png": pngBlob,
  });
  try {
    await (navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> }).write([item]);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e ?? "");
    if (msg.toLowerCase().includes("document is not focused")) {
      window.focus();
      await new Promise((r) => setTimeout(r, 120));
      await (navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> }).write([item]);
      return;
    }
    throw e;
  }
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

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [resMap, setResMap] = useState<Record<string, ResolutionRow>>({});
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});

  const [afterMemoById, setAfterMemoById] = useState<Record<string, string>>({});
  const [afterFileById, setAfterFileById] = useState<Record<string, File | null>>({});
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [previewReportId, setPreviewReportId] = useState<string | null>(null);

  const [msg, setMsg] = useState("");

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

    const admin = main || general;
    setIsAdmin(admin);
    setIsMainAdmin(main);

    return { ok: true as const, admin };
  };

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
      await loadRows();
    } catch (e) {
      setMsg((e as Error)?.message ?? "삭제에 실패했습니다.");
    } finally {
      setDeletingReportId(null);
    }
  };

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = session?.access_token;
      if (!token) throw new Error("세션이 없습니다. 다시 로그인해 주세요.");

      const resp = await fetch(`/api/admin/hazards/list?page=${page}&pageSize=${PAGE_SIZE}`, {
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
        totalCount?: number;
        unresolvedTotalCount?: number;
      };
      if (!resp.ok || !payload.ok) {
        throw new Error(payload.message || "위험요인 제보 조회에 실패했습니다.");
      }

      const repRows = (payload.items ?? []) as HazardListItem[];
      setReports(repRows);
      setTotalCount(payload.totalCount ?? 0);
      setUnresolvedTotalCount(payload.unresolvedTotalCount ?? 0);

      const map: Record<string, ResolutionRow> = {};
      const pMap: Record<string, ProfileRow> = {};
      for (const row of repRows) {
        if (row.resolution) map[row.id] = row.resolution;
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
    } catch (e) {
      setMsg((e as Error)?.message ?? "위험요인 제보 조회에 실패했습니다.");
      setReports([]);
      setResMap({});
      setProfilesById({});
      setTotalCount(0);
      setUnresolvedTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewReportId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const aDone = !!resMap[a.id]?.after_public_url;
      const bDone = !!resMap[b.id]?.after_public_url;
      if (aDone !== bDone) return aDone ? 1 : -1; // 미처리 우선

      // 같은 상태 내에서는 제보순(최신순)
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return bt - at;
    });
  }, [reports, resMap]);
  const previewReport = useMemo(() => reports.find((r) => r.id === previewReportId) ?? null, [reports, previewReportId]);
  const previewResolution = previewReport ? resMap[previewReport.id] : null;
  const previewCreator = previewReport ? profilesById[previewReport.user_id]?.name ?? previewReport.user_id.slice(0, 8) : "-";
  const previewImprover = previewResolution?.improved_by ? profilesById[previewResolution.improved_by]?.name ?? previewResolution.improved_by.slice(0, 8) : "-";

  const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
        },
        { onConflict: "report_id" }
      );
      if (upsertErr) throw upsertErr;

      setAfterFileById((p) => ({ ...p, [report.id]: null }));
      setAfterMemoById((p) => ({ ...p, [report.id]: "" }));
      setMsg("개선사진 업로드 완료 (처리완료)");
      await loadRows();
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
          <div style={{ fontWeight: 900, color: unresolvedTotalCount > 0 ? "#DC2626" : "#111827" }}>위험요인 미처리 {unresolvedTotalCount}건</div>
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
            onClick={loadRows}
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
          sortedReports.map((r) => {
            const res = resMap[r.id];
            const done = !!res?.after_public_url;
            const creator = profilesById[r.user_id]?.name ?? r.user_id.slice(0, 8);
            const improver = res?.improved_by ? profilesById[res.improved_by]?.name ?? res.improved_by.slice(0, 8) : "-";
            const afterMemo = afterMemoById[r.id] ?? "";
            const selectedAfterFile = afterFileById[r.id] ?? null;
            const isDragOver = dragOverId === r.id;

            return (
              <div key={r.id} style={{ border: "1px solid #DDE3EA", borderRadius: 14, background: "white", padding: 10, boxShadow: "0 4px 14px rgba(15,23,42,0.05)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      borderRadius: 999,
                      padding: "3px 7px",
                      background: done ? "#DCFCE7" : "#FEE2E2",
                      color: done ? "#166534" : "#B91C1C",
                    }}
                  >
                    {done ? "처리완료" : "미처리"}
                  </span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>제보: {formatKST(r.created_at)} / {creator}</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>개선: {formatKST(res?.improved_at ?? null)} / {improver}</span>
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
                    <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#FCFDFE", height: 138, boxSizing: "border-box", overflow: "hidden" }}>
                      <button
                        onClick={() => setPreviewReportId(r.id)}
                        style={{ width: "100%", height: 138, border: "none", padding: 0, background: "transparent", cursor: "pointer", display: "block" }}
                        title="제보사진 크게 보기"
                      >
                        <img src={r.photo_url} alt="before" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </button>
                    </section>

                    <section style={{ border: "1px solid #BFDBFE", borderRadius: 10, background: "#EFF6FF", height: 138, boxSizing: "border-box", overflow: "hidden" }}>
                      {res?.after_public_url ? (
                        <button
                          onClick={() => setPreviewReportId(r.id)}
                          style={{ width: "100%", height: 138, border: "none", padding: 0, background: "transparent", cursor: "pointer", display: "block" }}
                          title="개선사진 크게 보기"
                        >
                          <img src={res.after_public_url} alt="after" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

                          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
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
            if (e.target === e.currentTarget) setPreviewReportId(null);
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
              background: "white",
              borderRadius: 16,
              border: "1px solid #DDE3EA",
              boxShadow: "0 30px 60px rgba(2,6,23,0.35)",
            }}
          >
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, color: "#0F172A" }}>
                위험요인 비교 보기
                <span style={{ marginLeft: 10, color: "#64748B", fontSize: 12, fontWeight: 700 }}>
                  제보 {formatKST(previewReport.created_at)} / {previewCreator}
                </span>
              </div>
              <button
                onClick={() => setPreviewReportId(null)}
                style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid #CBD5E1", background: "white", cursor: "pointer", fontWeight: 900 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <section style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", background: "#FCFDFE" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, color: "#0F172A" }}>개선 전 (위험제보)</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={async () => {
                        try {
                          await forceDownload(previewReport.photo_url, `hazard_before_${previewReport.id}.jpg`);
                        } catch (e) {
                          setMsg((e as Error)?.message ?? "다운로드에 실패했습니다.");
                        }
                      }}
                      style={{ height: 28, padding: "0 9px", borderRadius: 8, border: "1px solid #CBD5E1", background: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      다운로드
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await copyImageToClipboard(previewReport.photo_url);
                        } catch (e) {
                          setMsg((e as Error)?.message ?? "복사에 실패했습니다.");
                        }
                      }}
                      style={{ height: 28, padding: "0 9px", borderRadius: 8, border: "1px solid #CBD5E1", background: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      복사
                    </button>
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <img src={previewReport.photo_url} alt="hazard-before" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 10, border: "1px solid #E5E7EB", background: "white" }} />
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
                      {previewResolution?.improved_at ? `${formatKST(previewResolution.improved_at)} / ${previewImprover}` : "미처리"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={async () => {
                        if (!previewResolution?.after_public_url) return;
                        try {
                          await forceDownload(previewResolution.after_public_url, `hazard_after_${previewReport.id}.jpg`);
                        } catch (e) {
                          setMsg((e as Error)?.message ?? "다운로드에 실패했습니다.");
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
                        } catch (e) {
                          setMsg((e as Error)?.message ?? "복사에 실패했습니다.");
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
                      src={previewResolution.after_public_url}
                      alt="hazard-after"
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
