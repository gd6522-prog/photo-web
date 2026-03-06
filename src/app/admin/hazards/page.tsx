"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

const ADMIN_EMAIL = "gd6522@naver.com";
const ADMIN_UID = "bf70f0c0-3c58-444e-b69f-bd5de601deb6";
const PAGE_SIZE = 10;

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

function norm(v: unknown) {
  return String(v ?? "").trim();
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

export default function AdminHazardsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUid, setSessionUid] = useState("");

  const [loading, setLoading] = useState(false);
  const [savingAfterId, setSavingAfterId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [resMap, setResMap] = useState<Record<string, ResolutionRow>>({});
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});

  const [afterMemoById, setAfterMemoById] = useState<Record<string, string>>({});
  const [afterFileById, setAfterFileById] = useState<Record<string, File | null>>({});

  const [msg, setMsg] = useState("");

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

    const hardAdmin = uid === ADMIN_UID || email === ADMIN_EMAIL;
    const main = hardAdmin || (!!prof && !!(prof as { is_admin?: boolean | null }).is_admin);
    const general = norm((prof as { work_part?: string | null } | null)?.work_part) === "관리자";
    const general2 = norm((prof as { work_part?: string | null } | null)?.work_part) === "일반관리자";

    const admin = main || general || general2;
    setIsAdmin(admin);

    return { ok: true as const, admin };
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
      };
      if (!resp.ok || !payload.ok) {
        throw new Error(payload.message || "위험요인 제보 조회에 실패했습니다.");
      }

      const repRows = (payload.items ?? []) as HazardListItem[];
      setReports(repRows);
      setTotalCount(payload.totalCount ?? 0);

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

  const unresolvedCount = useMemo(() => reports.filter((r) => !resMap[r.id]?.after_public_url).length, [reports, resMap]);

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
    <div style={{ padding: 16, maxWidth: 1500, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>위험요인</h1>
      <div style={{ marginTop: 8, color: "#6B7280", fontSize: 13 }}>앱의 위험요인제보(hazard_reports)만 조회합니다.</div>

      <div
        style={{
          marginTop: 12,
          border: "1px solid #E5E7EB",
          borderRadius: 14,
          background: "#FAFAFB",
          padding: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={loadRows}
          disabled={loading}
          style={{ height: 32, padding: "0 10px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", fontWeight: 900 }}
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
        <div style={{ fontWeight: 900, color: unresolvedCount > 0 ? "#DC2626" : "#111827" }}>현재 페이지 미처리 {unresolvedCount}건</div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
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
        </div>
      </div>

      {msg ? <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#F3F4F6" }}>{msg}</div> : null}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {reports.length === 0 ? (
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 14, background: "white", padding: 14, color: "#6B7280" }}>데이터가 없습니다.</div>
        ) : (
          reports.map((r) => {
            const res = resMap[r.id];
            const done = !!res?.after_public_url;
            const creator = profilesById[r.user_id]?.name ?? r.user_id.slice(0, 8);
            const improver = res?.improved_by ? profilesById[res.improved_by]?.name ?? res.improved_by.slice(0, 8) : "-";
            const afterMemo = afterMemoById[r.id] ?? "";

            return (
              <div key={r.id} style={{ border: "1px solid #E5E7EB", borderRadius: 12, background: "white", padding: 8 }}>
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
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "110px 110px 1fr", gap: 8, alignItems: "start" }}>
                  <div>
                    <a href={r.photo_url} target="_blank" rel="noreferrer">
                      <img src={r.photo_url} alt="before" style={{ width: "100%", height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }} />
                    </a>
                  </div>

                  <div>
                    {res?.after_public_url ? (
                      <a href={res.after_public_url} target="_blank" rel="noreferrer">
                        <img src={res.after_public_url} alt="after" style={{ width: "100%", height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid #E5E7EB" }} />
                      </a>
                    ) : (
                      <div style={{ height: 84, border: "1px dashed #D1D5DB", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#6B7280" }}>
                        개선 전
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>{r.comment ?? "-"}</div>
                    {res?.after_public_url ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#4B5563", whiteSpace: "pre-wrap" }}>{res.after_memo ?? "-"}</div>
                    ) : (
                      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setAfterFileById((p) => ({ ...p, [r.id]: e.target.files?.[0] ?? null }))}
                          style={{ width: 190, maxWidth: "100%" }}
                        />
                        <input
                          value={afterMemo}
                          onChange={(e) => setAfterMemoById((p) => ({ ...p, [r.id]: e.target.value }))}
                          placeholder="개선 메모(선택)"
                          style={{ width: 220, maxWidth: "100%", height: 30, padding: "0 8px" }}
                        />
                        <button
                          onClick={() => uploadAfter(r)}
                          disabled={savingAfterId === r.id}
                          style={{ height: 30, padding: "0 10px", border: "1px solid #111827", borderRadius: 8, background: "white", fontWeight: 900 }}
                        >
                          {savingAfterId === r.id ? "업로드 중..." : "개선 업로드"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 8 }}>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          style={{ height: 32, padding: "0 12px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", fontWeight: 900 }}
        >
          이전
        </button>
        <button
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          disabled={page >= maxPage}
          style={{ height: 32, padding: "0 12px", border: "1px solid #D1D5DB", borderRadius: 10, background: "white", fontWeight: 900 }}
        >
          다음
        </button>
      </div>
    </div>
  );
}
