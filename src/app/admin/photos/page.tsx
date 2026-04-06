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

type CargoSummary = {
  large_box: number; large_inner: number; small_high: number;
  small_low: number; large_other: number; tobacco: number;
};

const WORK_PARTS: Array<{ label: string; field: keyof CargoSummary }> = [
  { label: "박스존", field: "large_box" },
  { label: "이너존", field: "large_inner" },
  { label: "슬라존", field: "small_high" },
  { label: "경량존", field: "small_low" },
  { label: "이형존", field: "large_other" },
  { label: "담배존", field: "tobacco" },
];

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
  await copyCompressedImageUrlToClipboard(url, { maxBytes: 20 * 1024 * 1024, maxDimension: 2000 });
}

const WORK_PART_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "박스존", value: "박스존" },
  { label: "이너존", value: "이너존" },
  { label: "슬라존", value: "슬라존" },
  { label: "경량존", value: "경량존" },
  { label: "이형존", value: "이형존" },
  { label: "담배존", value: "담배존" },
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

  // photo pagination (우측 패널)
  const [photoPage, setPhotoPage] = useState(0);
  const PHOTO_PAGE_SIZE = 21;

  const mounted = useRef(false);

  // ---------- 작업파트 촬영 현황 ----------
  const [cargoByStoreCode, setCargoByStoreCode] = useState<Record<string, CargoSummary>>({});

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const fetchCargoForDate = async (date: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) return;
      const res = await fetch(`/api/admin/vehicles/current?includeSnapshot=1&date=${date}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const rows: any[] = data.snapshot?.cargoRows ?? [];
      const map: Record<string, CargoSummary> = {};
      for (const r of rows) {
        if (r.store_code) {
          map[String(r.store_code)] = {
            large_box: r.large_box ?? 0,
            large_inner: r.large_inner ?? 0,
            small_high: r.small_high ?? 0,
            small_low: r.small_low ?? 0,
            large_other: r.large_other ?? 0,
            tobacco: r.tobacco ?? 0,
          };
        }
      }
      setCargoByStoreCode(map);
    } catch {}
  };

  useEffect(() => {
    if (checking || !isAdmin) return;
    void fetchCargoForDate(dateFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, checking, isAdmin]);

  // ---------- derive ----------
  const carOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) if (s.car_no != null) set.add(String(s.car_no));
    const arr = Array.from(set).sort((a, b) => Number(a) - Number(b));
    return ["ALL", ...arr];
  }, [stores]);

  const ZONE_ORDER: Record<string, number> = {
    "박스존": 0, "이너존": 1, "슬라존": 2, "경량존": 3, "이형존": 4, "담배존": 5,
  };

  const photosByStore = useMemo(() => {
    const groups: Record<string, PhotoRow[]> = {};
    for (const p of photos) {
      if (!groups[p.store_code]) groups[p.store_code] = [];
      groups[p.store_code].push(p);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => {
        const za = ZONE_ORDER[profilesById[a.user_id]?.work_part ?? ""] ?? 99;
        const zb = ZONE_ORDER[profilesById[b.user_id]?.work_part ?? ""] ?? 99;
        if (za !== zb) return za - zb;
        return a.created_at > b.created_at ? -1 : 1;
      });
    }
    return groups;
  }, [photos, profilesById]);

  const selectedStorePhotos = useMemo(() => {
    if (!selectedStoreCode) return [];
    return photosByStore[selectedStoreCode] ?? [];
  }, [photosByStore, selectedStoreCode]);

  // 점포 바뀌면 페이지 리셋
  useEffect(() => {
    setPhotoPage(0);
  }, [selectedStoreCode]);

  const pagedPhotos = useMemo(() => {
    const start = photoPage * PHOTO_PAGE_SIZE;
    return selectedStorePhotos.slice(start, start + PHOTO_PAGE_SIZE);
  }, [selectedStorePhotos, photoPage]);


  // 선택 점포의 작업파트별 사진 수
  const selectedStoreWorkPartCount = useMemo(() => {
    const result: Record<string, number> = {};
    for (const p of selectedStorePhotos) {
      const wp = profilesById[p.user_id]?.work_part ?? "";
      if (wp) result[wp] = (result[wp] ?? 0) + 1;
    }
    return result;
  }, [selectedStorePhotos, profilesById]);

  // 선택 점포의 발주 있는 작업파트 목록
  // cargo 데이터 있으면 발주 있는 파트만, 없으면 사진 올라온 파트만 표시
  const orderedWorkParts = useMemo(() => {
    if (!selectedStoreCode) return [];
    const cargo = cargoByStoreCode[selectedStoreCode];
    if (cargo) {
      // 발주 있는 파트 (단품별 기준)
      return WORK_PARTS.filter((wp) => (cargo[wp.field] ?? 0) > 0);
    }
    // cargo 없으면 사진 올라온 파트라도 표시
    return WORK_PARTS.filter((wp) => (selectedStoreWorkPartCount[wp.label] ?? 0) > 0);
  }, [selectedStoreCode, cargoByStoreCode, selectedStoreWorkPartCount]);

  // 일요일 여부 (선택 날짜 기준)
  const isSingleDaySunday =
    dateFrom === dateTo && new Date(`${dateFrom}T00:00:00+09:00`).getDay() === 0;
  const showWorkPartStatus = !isSingleDaySunday && !!selectedStoreCode && orderedWorkParts.length > 0;

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
    void fetchCargoForDate(dateFrom);
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
    <div style={{ fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", width: "100%", position: "relative", background: "transparent", minHeight: 0, padding: "0 6px 8px" }}>
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
        .photo-card-site { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .photo-card-site:hover { box-shadow: 0 16px 36px rgba(2,32,46,0.18) !important; transform: translateY(-3px); }
        .store-row { transition: background 0.12s ease; }
        .store-row:hover { background: #F8FAFC !important; }
        .filter-input:focus { border-color: #103b53 !important; box-shadow: 0 0 0 3px rgba(16,59,83,0.10); outline: none; }
      `}</style>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 200, background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", padding: "11px 18px", borderRadius: 10, fontWeight: 900, fontSize: 13, boxShadow: "0 8px 24px rgba(16,59,83,0.38)" }}>
          {toastMsg}
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 1880, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>

          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 14 }}>

            {/* 필터 */}
            <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", padding: "18px 16px", background: "white", boxShadow: "0 4px 20px rgba(2,32,46,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <div style={{ width: 4, height: 18, borderRadius: 2, background: "linear-gradient(180deg,#103b53,#0f766e)", flexShrink: 0 }} />
                <div style={{ fontWeight: 900, fontSize: 15, color: "#0F172A" }}>조회 필터</div>
              </div>

              {/* 날짜 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>날짜 범위</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", marginBottom: 4 }}>시작일</div>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 9px", fontWeight: 800, fontSize: 12, color: "#0F172A", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ color: "#CBD5E1", fontSize: 16, paddingBottom: 8, flexShrink: 0 }}>→</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", marginBottom: 4 }}>종료일</div>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 9px", fontWeight: 800, fontSize: 12, color: "#0F172A", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: "#F1F5F9", margin: "0 0 14px" }} />

              {/* 호차 + 작업파트 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>호차</div>
                  <select value={carNo} onChange={(e) => setCarNo(e.target.value)} className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 8px", fontWeight: 800, fontSize: 12, color: "#0F172A", background: "white", cursor: "pointer", outline: "none" }}>
                    {carOptions.map((c) => (<option key={c} value={c}>{c === "ALL" ? "전체" : `${c}호`}</option>))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>작업파트</div>
                  <select value={workPart} onChange={(e) => setWorkPart(e.target.value)} className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 8px", fontWeight: 800, fontSize: 12, color: "#0F172A", background: "white", cursor: "pointer", outline: "none" }}>
                    {WORK_PART_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </div>
              </div>

              {/* 검색 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>검색</div>
                <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="점포코드, 점포명..." className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 12px", fontWeight: 700, fontSize: 13, color: "#0F172A", outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* 조회/초기화 */}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ flex: 1, height: 42, borderRadius: 9, border: "none", background: loading ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 900, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 5px 16px rgba(16,59,83,0.30)" }}>
                  {loading ? "조회중..." : "조회"}
                </button>
                <button className="btn-secondary" onClick={() => { setSearchText(""); setCarNo("ALL"); setWorkPart("ALL"); setDateFrom(kstTodayYYYYMMDD()); setDateTo(kstTodayYYYYMMDD()); setSelectedStore(null); resetSelection(); }} disabled={loading} style={{ height: 42, padding: "0 14px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", color: "#64748B" }}>
                  초기화
                </button>
              </div>
            </div>

            {/* 점포 목록 */}
            <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", background: "white", overflow: "hidden", boxShadow: "0 4px 20px rgba(2,32,46,0.08)" }}>
              <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#0F172A" }}>점포 목록</div>
                <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>총 {storeCount}개</div>
              </div>
              {stores.length === 0 ? (
                <div style={{ padding: 16, color: "#94A3B8", fontSize: 13, fontWeight: 700 }}>조회 결과가 없습니다.</div>
              ) : (
                <div style={{ maxHeight: 460, overflow: "auto" }}>
                  {stores.map((s) => {
                    const active = selectedStore?.store_code === s.store_code;
                    return (
                      <button key={s.store_code} className="store-row" onClick={() => { setSelectedStore(s); resetSelection(); }} style={{ width: "100%", textAlign: "left", padding: "10px 16px", border: "none", borderBottom: "1px solid #F8FAFC", background: active ? "linear-gradient(135deg,#EFF6FF 0%,#F0FDF4 100%)" : "white", cursor: "pointer", borderLeft: active ? "3px solid #103b53" : "3px solid transparent" }}>
                        <div style={{ fontWeight: 900, fontSize: 13, color: active ? "#103b53" : "#0F172A" }}>[{s.store_code}] {s.store_name}</div>
                        <div style={{ marginTop: 2, fontSize: 11, color: "#94A3B8", fontWeight: 700 }}>호차 {s.car_no ?? "-"} · 순번 {s.seq_no ?? "-"}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", background: "white", overflow: "hidden", boxShadow: "0 4px 20px rgba(2,32,46,0.08)" }}>

            {/* 헤더 */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#FAFBFC" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15, color: "#0F172A" }}>{selectedStoreTitle}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>{selectedStoreSubTitle}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                <button className="btn-secondary" onClick={onSelectAll} disabled={!selectedStoreCode || selectedStorePhotos.length === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: "#374151" }}>전체선택</button>
                <button className="btn-secondary" onClick={onClearSelect} disabled={!selectedStoreCode} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: "#374151" }}>선택해제</button>
                <button className="btn-secondary" onClick={() => setSelectMode((v) => !v)} disabled={!selectedStoreCode} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: `1.5px solid ${selectMode ? "#103b53" : "#E2E8F0"}`, background: selectMode ? "#EFF6FF" : "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: selectMode ? "#103b53" : "#374151" }}>선택모드 {selectMode ? "ON" : "OFF"} ({selectedPhotoIds.size})</button>
                <button className="btn-primary" onClick={onBulkDownload} disabled={selectedPhotoIds.size === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "none", background: selectedPhotoIds.size === 0 ? "#CBD5E1" : "#1E293B", color: "white", fontWeight: 800, fontSize: 13, cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer", boxShadow: selectedPhotoIds.size === 0 ? "none" : "0 3px 8px rgba(30,41,59,0.28)", whiteSpace: "nowrap" }}>다운로드 ({selectedPhotoIds.size})</button>
                <button className="btn-danger" onClick={onBulkDelete} disabled={selectedPhotoIds.size === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "none", background: selectedPhotoIds.size === 0 ? "#FECACA" : "#EF4444", color: "white", fontWeight: 800, fontSize: 13, cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer", boxShadow: selectedPhotoIds.size === 0 ? "none" : "0 3px 8px rgba(239,68,68,0.30)", whiteSpace: "nowrap" }}>삭제 ({selectedPhotoIds.size})</button>
              </div>
            </div>

            {/* 작업파트 촬영 현황 */}
            {!!selectedStoreCode && (
              <div style={{ padding: "4px 16px", background: "#FFF9C4", fontSize: 11, color: "#555" }}>
                디버그: photos={selectedStorePhotos.length} | workParts={JSON.stringify(Object.keys(selectedStoreWorkPartCount))} | sunday={String(isSingleDaySunday)} | ordered={orderedWorkParts.length}
              </div>
            )}
            {showWorkPartStatus && (
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#94A3B8", marginRight: 2, whiteSpace: "nowrap" }}>촬영</span>
                {orderedWorkParts.map(({ label }) => {
                  const count = selectedStoreWorkPartCount[label] ?? 0;
                  const complete = label === "이형존" ? count >= 1 : count >= 2;
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, background: complete ? "#DCFCE7" : "#FEF2F2", border: `1px solid ${complete ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.2)"}` }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: complete ? "#16A34A" : "#DC2626" }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: complete ? "#16A34A" : "#DC2626" }}>
                        {complete ? "✅" : count > 0 ? `${count}장` : "미완료"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ padding: 14 }}>
              {!selectedStoreCode ? (
                <div style={{ borderRadius: 10, padding: 20, color: "#94A3B8", background: "#F8FAFC", textAlign: "center", fontWeight: 700, fontSize: 14, border: "1px dashed #E2E8F0" }}>
                  왼쪽 점포 목록에서 점포를 선택하세요.
                </div>
              ) : selectedStorePhotos.length === 0 ? (
                <div style={{ borderRadius: 10, padding: 20, color: "#94A3B8", background: "#F8FAFC", textAlign: "center", fontWeight: 700, fontSize: 14, border: "1px dashed #E2E8F0" }}>
                  선택 점포의 사진이 없습니다.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 10 }}>
                    {pagedPhotos.map((p, localIdx) => {
                      const globalIdx = photoPage * PHOTO_PAGE_SIZE + localIdx;
                      const selected = selectedPhotoIds.has(p.id);
                      const prof = profilesById[p.user_id];
                      const uploaderName = prof?.name?.trim() ? prof.name.trim() : "-";

                      return (
                        <div key={p.id} className="photo-card-site" style={{ borderRadius: 10, border: selected ? "2px solid #103b53" : "1px solid #E8EFF5", overflow: "hidden", background: selected ? "#EFF6FF" : "white", boxShadow: "0 2px 10px rgba(2,32,46,0.07)" }}>

                          {/* 썸네일 */}
                          <button onClick={() => { if (selectMode) onToggleSelect(p.id); else openPreview(globalIdx); }} style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", background: "#0B1220", display: "block" }}>
                            <img src={p.original_url} alt="photo" loading="lazy" decoding="async" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                          </button>

                          {/* 메타 */}
                          <div style={{ padding: "9px 10px 10px" }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: "#0F172A" }}>{formatKST(p.created_at)}</div>
                            <div style={{ marginTop: 1, fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>
                              <span style={{ color: "#64748B" }}>[{p.store_code}]</span> · {uploaderName}
                            </div>

                            {/* 버튼 */}
                            <div style={{ marginTop: 9, display: "flex", gap: 5 }}>
                              <button className="btn-primary" onClick={async (e) => { e.stopPropagation(); await onDownloadPhoto(p); }} style={{ flex: 1, height: 30, borderRadius: 7, border: "none", background: "#1E293B", color: "white", fontWeight: 900, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 7px rgba(30,41,59,0.28)" }}>다운</button>
                              <button className="btn-secondary" onClick={async (e) => { e.stopPropagation(); await onCopyPhoto(p); }} style={{ flex: 1, height: 30, borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 900, fontSize: 11, cursor: "pointer", color: "#374151" }}>복사</button>
                              <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectMode(true); onToggleSelect(p.id); }} style={{ height: 30, padding: "0 9px", borderRadius: 7, border: `1.5px solid ${selected ? "#103b53" : "#E2E8F0"}`, background: selected ? "#103b53" : "white", color: selected ? "white" : "#374151", fontWeight: 900, fontSize: 11, cursor: "pointer" }}>{selected ? "✓" : "선택"}</button>
                            </div>
                            <button className="btn-danger" onClick={(e) => { e.stopPropagation(); onDeletePhoto(p); }} style={{ width: "100%", marginTop: 5, height: 28, borderRadius: 7, border: "none", background: "#FEE2E2", color: "#DC2626", fontWeight: 900, fontSize: 11, cursor: "pointer" }}>삭제</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 페이지네이션 */}
                  {selectedStorePhotos.length > PHOTO_PAGE_SIZE && (
                    <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <button onClick={() => setPhotoPage((v) => Math.max(0, v - 1))} disabled={photoPage === 0} style={{ height: 32, padding: "0 14px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: photoPage === 0 ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: photoPage === 0 ? "not-allowed" : "pointer", color: photoPage === 0 ? "#CBD5E1" : "#374151" }}>← 이전</button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#64748B" }}>
                        {photoPage + 1} / {Math.ceil(selectedStorePhotos.length / PHOTO_PAGE_SIZE)}
                      </span>
                      <button onClick={() => setPhotoPage((v) => Math.min(Math.ceil(selectedStorePhotos.length / PHOTO_PAGE_SIZE) - 1, v + 1))} disabled={photoPage >= Math.ceil(selectedStorePhotos.length / PHOTO_PAGE_SIZE) - 1} style={{ height: 32, padding: "0 14px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: photoPage >= Math.ceil(selectedStorePhotos.length / PHOTO_PAGE_SIZE) - 1 ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: photoPage >= Math.ceil(selectedStorePhotos.length / PHOTO_PAGE_SIZE) - 1 ? "not-allowed" : "pointer", color: photoPage >= Math.ceil(selectedStorePhotos.length / PHOTO_PAGE_SIZE) - 1 ? "#CBD5E1" : "#374151" }}>다음 →</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {previewOpen && previewPhoto && (
        <div onClick={closePreview} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.82)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "min(820px, 92vh)", background: "white", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.45)" }}>

            {/* 모달 헤더 */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#FAFBFC" }}>
              <div>
                <div style={{ fontWeight: 900, color: "#0F172A", fontSize: 15 }}>
                  <span style={{ color: "#94A3B8", fontWeight: 800 }}>[{previewPhoto.store_code}]</span> {formatKST(previewPhoto.created_at)}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>업로더: {previewUploader}</div>
              </div>
              <button className="btn-secondary" onClick={closePreview} style={{ width: 36, height: 36, borderRadius: 8, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 900, fontSize: 16, cursor: "pointer", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* 사진 */}
            <div style={{ flex: 1, background: "#0B1220", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
              <img src={previewPhoto.original_url} alt="preview" decoding="async" style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
            </div>

            {/* 모달 푸터 버튼 */}
            <div style={{ padding: "11px 16px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#FAFBFC" }}>
              <button className="btn-primary" onClick={async () => onDownloadPhoto(previewPhoto)} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "#1E293B", color: "white", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 3px 9px rgba(30,41,59,0.28)" }}>다운로드</button>
              <button className="btn-secondary" onClick={onCopyPreview} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 900, fontSize: 13, cursor: "pointer", color: "#374151" }}>복사</button>
              <button className="btn-secondary" onClick={() => { setSelectMode(true); onToggleSelect(previewPhoto.id); }} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: `1.5px solid ${selectedPhotoIds.has(previewPhoto.id) ? "#103b53" : "#E2E8F0"}`, background: selectedPhotoIds.has(previewPhoto.id) ? "#103b53" : "white", color: selectedPhotoIds.has(previewPhoto.id) ? "white" : "#374151", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>{selectedPhotoIds.has(previewPhoto.id) ? "✓ 선택됨" : "선택"}</button>
              <button className="btn-danger" onClick={() => onDeletePhoto(previewPhoto)} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "#EF4444", color: "white", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 3px 9px rgba(239,68,68,0.28)" }}>삭제</button>
              <div style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={() => setPreviewIndex((v) => Math.max(0, v - 1))} disabled={previewIndex === 0} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: previewIndex === 0 ? "#F8FAFC" : "white", fontWeight: 900, fontSize: 13, cursor: previewIndex === 0 ? "not-allowed" : "pointer", color: previewIndex === 0 ? "#CBD5E1" : "#374151" }}>← 이전</button>
              <button className="btn-secondary" onClick={() => setPreviewIndex((v) => Math.min(selectedStorePhotos.length - 1, v + 1))} disabled={previewIndex >= selectedStorePhotos.length - 1} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: previewIndex >= selectedStorePhotos.length - 1 ? "#F8FAFC" : "white", fontWeight: 900, fontSize: 13, cursor: previewIndex >= selectedStorePhotos.length - 1 ? "not-allowed" : "pointer", color: previewIndex >= selectedStorePhotos.length - 1 ? "#CBD5E1" : "#374151" }}>다음 →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
