"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/admin-access";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";
import { copyCompressedImageUrlToClipboard } from "@/lib/clipboard-image";

type StoreMapRow = {
  store_code: string;
  store_name: string;
  car_no: number | null;
  seq_no: number | null;
};

type PhotoRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: "public" | "hidden";
  original_path: string;
  original_url: string;
  store_code: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  work_part: string | null;
  is_admin?: boolean | null;
  is_company_admin?: boolean | null;
};

function normWorkPart(v: any) {
  return String(v ?? "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function kstTodayYYYYMMDD() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function kstDayToUtcRange(dateYYYYMMDD: string) {
  const start = new Date(`${dateYYYYMMDD}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startUTC: start.toISOString(), endUTC: end.toISOString() };
}

function kstDateRangeToUtcRange(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00+09:00`);
  const endBase = new Date(`${dateTo}T00:00:00+09:00`);
  const end = new Date(endBase.getTime() + 24 * 60 * 60 * 1000);
  return { startUTC: start.toISOString(), endUTC: end.toISOString() };
}

function formatKST(ts: string) {
  const d = new Date(ts);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = pad2(kst.getUTCMonth() + 1);
  const dd = pad2(kst.getUTCDate());
  const HH = pad2(kst.getUTCHours());
  const MI = pad2(kst.getUTCMinutes());
  const SS = pad2(kst.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${HH}:${MI}:${SS}`;
}


// ✅ 강제 다운로드
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

const WORK_PART_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "박스존", value: "박스존" },
  { label: "이너존", value: "이너존" },
  { label: "슬라존", value: "슬라존" },
  { label: "경량존", value: "경량존" },
  { label: "이형존", value: "이형존" },
  { label: "담배존", value: "담배존" },
  { label: "배송", value: "배송" },
];

export default function AdminPhotosPage() {
  // ---------- auth ----------
  const [checking, setChecking] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string>("");
  const [sessionUid, setSessionUid] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);

  // ✅ toast
  const [toastMsg, setToastMsg] = useState<string>("");
  const toastTimer = useRef<any>(null);
  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 1600);
  };

  // ---------- filters ----------
  const [dateFrom, setDateFrom] = useState<string>(kstTodayYYYYMMDD());
  const [dateTo, setDateTo] = useState<string>(kstTodayYYYYMMDD());
  const [workPart, setWorkPart] = useState<string>("ALL");
  const [carNo, setCarNo] = useState<string>("ALL");
  const [searchText, setSearchText] = useState<string>("");

  useEffect(() => {
    if (dateFrom > dateTo) {
      setDateTo(dateFrom);
    }
  }, [dateFrom, dateTo]);

  // ---------- data ----------
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<StoreMapRow[]>([]);
  const [storeCount, setStoreCount] = useState<number>(0);

  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});

  // left list selection
  const [selectedStore, setSelectedStore] = useState<StoreMapRow | null>(null);
  const selectedStoreCode = selectedStore?.store_code ?? "";

  // selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  // modal preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const mounted = useRef(false);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ---------- derive ----------
  const carOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) if (s.car_no != null) set.add(String(s.car_no));
    const arr = Array.from(set).sort((a, b) => Number(a) - Number(b));
    return ["ALL", ...arr];
  }, [stores]);

  const photosByStore = useMemo(() => {
    const groups: Record<string, PhotoRow[]> = {};
    for (const p of photos) {
      if (!groups[p.store_code]) groups[p.store_code] = [];
      groups[p.store_code].push(p);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    }
    return groups;
  }, [photos]);

  const selectedStorePhotos = useMemo(() => {
    if (!selectedStoreCode) return [];
    return photosByStore[selectedStoreCode] ?? [];
  }, [photosByStore, selectedStoreCode]);

  const selectedStoreTitle = "선택 점포 사진";
  const selectedStoreSubTitle = selectedStore
    ? `[${selectedStore.store_code}] ${selectedStore.store_name} (호차 ${selectedStore.car_no ?? "-"} / 순번 ${selectedStore.seq_no ?? "-"})`
    : "점포를 선택하세요";

  // ---------- auth check ----------
  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const sess = data.session;
    if (!sess) return { ok: false as const, reason: "no-session" as const };

    const uid = sess.user.id;
    const email = sess.user.email ?? "";
    setSessionUid(uid);
    setSessionEmail(email);

    const { data: prof } = await supabase
      .from("profiles")
      .select("id, name, work_part, is_admin")
      .eq("id", uid)
      .maybeSingle();

    const hardAdmin = isMainAdminIdentity(uid, email);
    const main = hardAdmin || (!!prof && !!(prof as any).is_admin);
    const general = isGeneralAdminWorkPart((prof as any)?.work_part);

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

    return { ok: true as const, admin };
  };

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    (async () => {
      setChecking(true);
      try {
        const r = await loadAdmin();
        if (!r.ok) setIsAdmin(false);
      } catch {
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  // ---------- helpers ----------
  const resetSelection = () => {
    setSelectedPhotoIds(new Set());
    setSelectMode(false);
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // ---------- query: fetch ----------
  const fetchData = async () => {
    setLoading(true);
    try {
      if (dateFrom > dateTo) {
        throw new Error("날짜 범위가 올바르지 않습니다. 시작일이 종료일보다 늦을 수 없습니다.");
      }

      const { startUTC, endUTC } = kstDateRangeToUtcRange(dateFrom, dateTo);

      let q = supabase
        .from("photos")
        .select("id, user_id, created_at, status, original_path, original_url, store_code")
        .gte("created_at", startUTC)
        .lt("created_at", endUTC);

      q = q.order("created_at", { ascending: false }).limit(5000);

      const { data: photoRows, error: photoErr } = await q;
      if (photoErr) throw photoErr;

      const rows = (photoRows ?? []) as PhotoRow[];

      // ✅ uploader profiles
      const userIds = Array.from(new Set(rows.map((r) => r.user_id))).filter(Boolean);
      let profMap: Record<string, ProfileRow> = {};
      if (userIds.length > 0) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, name, work_part, is_admin")
          .in("id", userIds);

        if (!profErr && profs) {
          for (const p of profs as any[]) {
            profMap[p.id] = {
              id: p.id,
              name: p.name ?? null,
              work_part: p.work_part ?? null,
              is_admin: p.is_admin ?? null,
            };
          }
        }
      }
      setProfilesById(profMap);

      // ✅ 핵심: 기사(배송 work_part) 업로드는 현장사진에서 무조건 제외
      const nonDriverRows = rows.filter((r) => normWorkPart(profMap[r.user_id]?.work_part) !== "배송");

      let filteredPhotos = nonDriverRows;

      // 기존 workPart 필터 적용(단, 배송 선택해도 기사 사진은 원천적으로 안 섞임)
      if (workPart !== "ALL") {
        filteredPhotos = filteredPhotos.filter((r) => (profMap[r.user_id]?.work_part ?? "") === workPart);
      }

      const storeCodes = Array.from(new Set(filteredPhotos.map((p) => p.store_code))).filter(Boolean);

      let storeList: StoreMapRow[] = [];
      if (storeCodes.length > 0) {
        const st = searchText.trim();
        let sq = supabase.from("store_map").select("store_code, store_name, car_no, seq_no").in("store_code", storeCodes);

        if (st) {
          const like = `%${st}%`;
          sq = sq.or(`store_code.ilike.${like},store_name.ilike.${like}`);
        }

        const { data: sm, error: smErr } = await sq.limit(2000);
        if (smErr) throw smErr;
        storeList = (sm ?? []) as StoreMapRow[];
      }

      let filteredStores = storeList;
      if (carNo !== "ALL") {
        filteredStores = filteredStores.filter((s) => String(s.car_no ?? "") === String(carNo));
      }

      filteredStores.sort((a, b) => {
        const ac = a.car_no ?? 999999;
        const bc = b.car_no ?? 999999;
        if (ac !== bc) return ac - bc;
        const as = a.seq_no ?? 999999;
        const bs = b.seq_no ?? 999999;
        if (as !== bs) return as - bs;
        return a.store_code.localeCompare(b.store_code);
      });

      setStores(filteredStores);
      setStoreCount(filteredStores.length);

      const allowedCodes = new Set(filteredStores.map((s) => s.store_code));
      const finalPhotos = filteredPhotos.filter((p) => allowedCodes.has(p.store_code));
      setPhotos(finalPhotos);

      if (selectedStoreCode && !allowedCodes.has(selectedStoreCode)) {
        setSelectedStore(null);
        resetSelection();
      }

      if (!selectedStore && filteredStores.length > 0) {
        setSelectedStore(filteredStores[0]);
        resetSelection();
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- actions ----------
  const onDownloadPhoto = async (p: PhotoRow) => {
    const name = `${p.store_code}_${p.id}.jpg`;
    await forceDownload(p.original_url, name);
  };

  const onCopyPhoto = async (p: PhotoRow) => {
    try {
      await copyImageToClipboard(p.original_url);
      toast("이미지 복사됨");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  };

  const onDeletePhoto = async (p: PhotoRow) => {
    if (!confirm("이 사진을 삭제할까요? (DB + Storage 삭제)")) return;

    const { error: rmErr } = await supabase.storage.from("photos").remove([p.original_path]);
    if (rmErr) {
      alert(`Storage 삭제 오류: ${rmErr.message}`);
      return;
    }

    const { error: delErr } = await supabase.from("photos").delete().eq("id", p.id);
    if (delErr) {
      alert(`DB 삭제 오류: ${delErr.message}`);
      return;
    }

    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
    setPhotos((prev) => prev.filter((ph) => ph.id !== p.id));
  };

  const onToggleSelect = (photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const onSelectAll = () => {
    const ids = selectedStorePhotos.map((p) => p.id);
    setSelectedPhotoIds(new Set(ids));
    setSelectMode(true);
  };

  const onClearSelect = () => {
    setSelectedPhotoIds(new Set());
    setSelectMode(false);
  };

  const onBulkDelete = async () => {
    const ids = Array.from(selectedPhotoIds);
    if (ids.length === 0) return;
    if (!confirm(`선택된 ${ids.length}개를 삭제할까요? (DB + Storage 삭제)`)) return;

    const { data, error } = await supabase.from("photos").select("id, original_path").in("id", ids);
    if (error) return alert(error.message);

    const paths = (data ?? []).map((r: any) => r.original_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from("photos").remove(paths);
      if (rmErr) return alert(`Storage 삭제 오류: ${rmErr.message}`);
    }

    const { error: delErr } = await supabase.from("photos").delete().in("id", ids);
    if (delErr) return alert(`DB 삭제 오류: ${delErr.message}`);

    const deletedSet = new Set(ids);
    onClearSelect();
    setPhotos((prev) => prev.filter((ph) => !deletedSet.has(ph.id)));
  };

  const onBulkDownload = async () => {
    const ids = Array.from(selectedPhotoIds);
    if (ids.length === 0) return;

    const selected = selectedStorePhotos.filter((p) => selectedPhotoIds.has(p.id));
    for (let i = 0; i < selected.length; i++) {
      await onDownloadPhoto(selected[i]);
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  // ---------- modal ----------
  const openPreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

  const closePreview = () => setPreviewOpen(false);

  const previewPhoto = selectedStorePhotos[previewIndex];

  const previewUploader = useMemo(() => {
    if (!previewPhoto) return "";
    const prof = profilesById[previewPhoto.user_id];
    return prof?.name?.trim() ? prof.name.trim() : "-";
  }, [previewPhoto, profilesById]);

  const onCopyPreview = async () => {
    if (!previewPhoto) return;
    await onCopyPhoto(previewPhoto);
  };

  // ---------- initial fetch ----------
  useEffect(() => {
    if (checking) return;
    if (!isAdmin) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isAdmin]);

  if (checking) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 800 }}>Han Admin</div>
        <div style={{ marginTop: 10, color: "#6B7280" }}>로그인 확인 중...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Han Admin</div>
          <button
            onClick={onLogout}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 0,
              border: "1px solid #111827",
              background: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </div>

        <div style={{ marginTop: 14, border: "1px solid #E5E7EB", borderRadius: 0, padding: 14, background: "white" }}>
          <div style={{ fontWeight: 900, color: "#111827" }}>권한이 없습니다.</div>
          <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자 계정으로 로그인해야 접근 가능합니다.</div>
          <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
            현재 로그인: {sessionEmail || "-"} / UID: {sessionUid || "-"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif",
        width: "100%",
        position: "relative",
        background: "transparent",
        minHeight: 0,
        padding: "0 6px 8px",
      }}
    >
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 80,
            background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
            color: "white",
            padding: "10px 12px",
            borderRadius: 0,
            fontWeight: 900,
            fontSize: 13,
            boxShadow: "0 12px 26px rgba(16,59,83,0.30)",
          }}
        >
          {toastMsg}
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 1880, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "380px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* filters */}
            <div style={{ border: "1px solid #bdd0de", borderRadius: 0, padding: 14, background: "rgba(255,255,255,0.94)", boxShadow: "0 14px 30px rgba(2,32,46,0.10)" }}>
              {/* ✅ 여기서 TopModeButtons 제거 */}
              <div style={{ fontWeight: 900, marginBottom: 10 }}>조회 조건</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>시작일</div>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 0,
                      border: "1px solid #E5E7EB",
                      padding: "0 12px",
                      fontWeight: 700,
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>종료일</div>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 0,
                      border: "1px solid #E5E7EB",
                      padding: "0 12px",
                      fontWeight: 700,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>호차</div>
                  <select
                    value={carNo}
                    onChange={(e) => setCarNo(e.target.value)}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 0,
                      border: "1px solid #E5E7EB",
                      padding: "0 12px",
                      fontWeight: 700,
                      outline: "none",
                      background: "white",
                    }}
                  >
                    {carOptions.map((c) => (
                      <option key={c} value={c}>
                        {c === "ALL" ? "전체" : `호차 ${c}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>작업파트</div>
                  <select
                    value={workPart}
                    onChange={(e) => setWorkPart(e.target.value)}
                    style={{
                      width: "100%",
                      height: 40,
                      borderRadius: 0,
                      border: "1px solid #E5E7EB",
                      padding: "0 12px",
                      fontWeight: 700,
                      outline: "none",
                      background: "white",
                    }}
                  >
                    {WORK_PART_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>검색어(코드/점포명)</div>
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="예: 화성 / 27148"
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 0,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 700,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ height: 12 }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  style={{
                    height: 44,
                    borderRadius: 0,
                    border: "1px solid #0e7490",
                    background: loading ? "#9fb8c9" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)",
                    color: "white",
                    fontWeight: 900,
                    cursor: loading ? "not-allowed" : "pointer",
                    boxShadow: loading ? "none" : "0 10px 22px rgba(16,59,83,0.22)",
                  }}
                >
                  {loading ? "조회중" : "조회"}
                </button>

                <button
                  onClick={() => {
                    setSearchText("");
                    setCarNo("ALL");
                    setWorkPart("ALL");
                    setDateFrom(kstTodayYYYYMMDD());
                    setDateTo(kstTodayYYYYMMDD());
                    setSelectedStore(null);
                    resetSelection();
                  }}
                  disabled={loading}
                  style={{
                    height: 44,
                    borderRadius: 0,
                    border: "1px solid #c4d5e3",
                    background: "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  초기화
                </button>
              </div>

            </div>

            {/* store list */}
            <div style={{ border: "1px solid #bdd0de", borderRadius: 0, background: "rgba(255,255,255,0.94)", overflow: "hidden", boxShadow: "0 14px 30px rgba(2,32,46,0.10)" }}>
              <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>점포 목록</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>총 {storeCount}개</div>
              </div>

              <div style={{ borderTop: "1px solid #F3F4F6" }}>
                {stores.length === 0 ? (
                  <div style={{ padding: 12, color: "#6B7280" }}>조회 결과가 없습니다.</div>
                ) : (
                  <div style={{ maxHeight: 520, overflow: "auto" }}>
                    {stores.map((s) => {
                      const active = selectedStore?.store_code === s.store_code;
                      return (
                        <button
                          key={s.store_code}
                          onClick={() => {
                            setSelectedStore(s);
                            resetSelection();
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: 12,
                            border: "none",
                            borderBottom: "1px solid #F3F4F6",
                            background: active ? "linear-gradient(135deg,#e8f3f8 0%,#e0f2f1 100%)" : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>
                            [{s.store_code}] {s.store_name}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                            호차:{s.car_no ?? "-"} / 순번:{s.seq_no ?? "-"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ border: "1px solid #bdd0de", borderRadius: 0, background: "rgba(255,255,255,0.94)", padding: 14, boxShadow: "0 14px 30px rgba(2,32,46,0.10)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 16, color: "#103b53" }}>{selectedStoreTitle}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#6B7280" }}>{selectedStoreSubTitle}</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={onSelectAll}
                  disabled={!selectedStoreCode || selectedStorePhotos.length === 0}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 0,
                    border: "1px solid #c4d5e3",
                    background: "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  전체선택
                </button>

                <button
                  onClick={onClearSelect}
                  disabled={!selectedStoreCode}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 0,
                    border: "1px solid #c4d5e3",
                    background: "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  선택해제
                </button>

                <button
                  onClick={() => setSelectMode((v) => !v)}
                  disabled={!selectedStoreCode}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 0,
                    border: "1px solid #c4d5e3",
                    background: selectMode ? "linear-gradient(135deg,#e8f3f8 0%,#e0f2f1 100%)" : "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  선택모드 {selectMode ? "ON" : "OFF"} ({selectedPhotoIds.size})
                </button>

                <button
                  onClick={onBulkDownload}
                  disabled={selectedPhotoIds.size === 0}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 0,
                    border: "1px solid #c4d5e3",
                    background: selectedPhotoIds.size === 0 ? "#e9eef3" : "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                    cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  선택 다운로드 ({selectedPhotoIds.size})
                </button>

                <button
                  onClick={onBulkDelete}
                  disabled={selectedPhotoIds.size === 0}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 0,
                    border: "1px solid #EF4444",
                    background: selectedPhotoIds.size === 0 ? "#fee2e2" : "#fff5f5",
                    color: "#EF4444",
                    fontWeight: 900,
                    cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  선택 삭제 ({selectedPhotoIds.size})
                </button>
              </div>
            </div>

            <div style={{ height: 12 }} />

            {!selectedStoreCode ? (
              <div style={{ border: "1px solid #d3e1eb", borderRadius: 0, padding: 14, color: "#5b7386", background: "#f8fcff" }}>
                왼쪽 점포 목록에서 점포를 선택하세요.
              </div>
            ) : selectedStorePhotos.length === 0 ? (
              <div style={{ border: "1px solid #d3e1eb", borderRadius: 0, padding: 14, color: "#5b7386", background: "#f8fcff" }}>
                선택 점포의 사진이 없습니다.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {selectedStorePhotos.map((p, idx) => {
                  const selected = selectedPhotoIds.has(p.id);
                  const prof = profilesById[p.user_id];
                  const uploaderName = prof?.name?.trim() ? prof.name.trim() : "-";

                  return (
                    <div
                      key={p.id}
                      style={{
                        border: selected ? "1px solid #0f766e" : "1px solid #d9e6ef",
                        borderRadius: 0,
                        overflow: "hidden",
                        background: selected ? "linear-gradient(135deg,#e8f3f8 0%,#e0f2f1 100%)" : "rgba(255,255,255,0.94)",
                        boxShadow: "0 10px 22px rgba(2,32,46,0.10)",
                      }}
                    >
                      <button
                        onClick={() => {
                          if (selectMode) onToggleSelect(p.id);
                          else openPreview(idx);
                        }}
                        style={{
                          width: "100%",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          background: "transparent",
                        }}
                      >
                        <div
                          style={{
                            height: 240,
                            background: "#F3F4F6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <img src={p.original_url} alt="photo" loading="eager" fetchPriority="high" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        </div>
                      </button>

                      <div style={{ padding: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>{formatKST(p.created_at)}</div>
                          <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>
                            업로더: <b style={{ color: "#111827" }}>{uploaderName}</b>
                          </div>
                        </div>

                        <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                          점포코드: <b style={{ color: "#111827" }}>{p.store_code}</b>
                        </div>

                        <div style={{ height: 8 }} />

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await onDownloadPhoto(p);
                            }}
                            style={{
                              height: 36,
                              borderRadius: 0,
                              border: "1px solid #E5E7EB",
                              background: "white",
                              fontWeight: 900,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            다운로드
                          </button>

                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await onCopyPhoto(p);
                            }}
                            style={{
                              height: 36,
                              borderRadius: 0,
                              border: "1px solid #E5E7EB",
                              background: "white",
                              fontWeight: 900,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            title="이미지를 클립보드에 복사"
                          >
                            복사
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectMode(true);
                              onToggleSelect(p.id);
                            }}
                            style={{
                              height: 36,
                              borderRadius: 0,
                              border: "1px solid #111827",
                              background: selected ? "#111827" : "white",
                              color: selected ? "white" : "#111827",
                              fontWeight: 900,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {selected ? "선택됨" : "선택"}
                          </button>
                        </div>

                        <div style={{ height: 8 }} />

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePhoto(p);
                          }}
                          style={{
                            width: "100%",
                            height: 38,
                            borderRadius: 0,
                            border: "1px solid #EF4444",
                            background: "#FEE2E2",
                            color: "#EF4444",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {previewOpen && previewPhoto && (
        <div
          onClick={closePreview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.55)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 96vw)",
              height: "min(820px, 92vh)",
              background: "white",
              borderRadius: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              border: "1px solid #E5E7EB",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>
                  {formatKST(previewPhoto.created_at)} / 점포코드 {previewPhoto.store_code}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>
                  업로더: <b style={{ color: "#111827" }}>{previewUploader}</b>
                </div>
              </div>

              <button
                onClick={closePreview}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                aria-label="close"
                title="닫기"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                background: "#F3F4F6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 12,
                minHeight: 0,
              }}
            >
              <img
                src={previewPhoto.original_url}
                alt="preview"
                decoding="async"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            <div style={{ padding: 12, borderTop: "1px solid #E5E7EB", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={async () => onDownloadPhoto(previewPhoto)}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                다운로드
              </button>

              <button
                onClick={onCopyPreview}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="이미지를 클립보드에 복사"
              >
                이미지 복사
              </button>

              <button
                onClick={() => {
                  setSelectMode(true);
                  onToggleSelect(previewPhoto.id);
                }}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #111827",
                  background: selectedPhotoIds.has(previewPhoto.id) ? "#111827" : "white",
                  color: selectedPhotoIds.has(previewPhoto.id) ? "white" : "#111827",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedPhotoIds.has(previewPhoto.id) ? "선택됨" : "선택"}
              </button>

              <button
                onClick={() => onDeletePhoto(previewPhoto)}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #EF4444",
                  background: "#FEE2E2",
                  color: "#EF4444",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                삭제
              </button>

              <div style={{ flex: 1 }} />

              <button
                onClick={() => setPreviewIndex((v) => Math.max(0, v - 1))}
                disabled={previewIndex === 0}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: previewIndex === 0 ? "#F3F4F6" : "white",
                  fontWeight: 900,
                  cursor: previewIndex === 0 ? "not-allowed" : "pointer",
                }}
              >
                ← 이전
              </button>

              <button
                onClick={() => setPreviewIndex((v) => Math.min(selectedStorePhotos.length - 1, v + 1))}
                disabled={previewIndex >= selectedStorePhotos.length - 1}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 0,
                  border: "1px solid #E5E7EB",
                  background: previewIndex >= selectedStorePhotos.length - 1 ? "#F3F4F6" : "white",
                  fontWeight: 900,
                  cursor: previewIndex >= selectedStorePhotos.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                다음 →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
