"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminAccess } from "@/lib/admin-access";
import { copyCompressedImageUrlToClipboard } from "@/lib/clipboard-image";

type StoreMapRow = {
  store_code: string;
  store_name: string;
  car_no: string | null;
  seq_no: number | null;
  photo_count?: number;
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
  // ---------- auth (layout AdminAccessProvider에서 주입) ----------
  const { loading: checking, isAdmin, uid: sessionUid, email: sessionEmail } = useAdminAccess();

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
  const [loading, setLoading] = useState(false);       // 점포 목록 로딩
  const [photosLoading, setPhotosLoading] = useState(false); // 선택 점포 사진 로딩
  const [stores, setStores] = useState<StoreMapRow[]>([]);
  const [storeCount, setStoreCount] = useState<number>(0);

  const [photos, setPhotos] = useState<PhotoRow[]>([]);        // 현재 선택 점포 사진만
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = React.useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // photo pagination (우측 패널)
  const [photoPage, setPhotoPage] = useState(0);
  const PHOTO_PAGE_SIZE = 21;

  // ---------- 작업파트 촬영 현황 ----------
  const [cargoByStoreCode, setCargoByStoreCode] = useState<Record<string, CargoSummary>>({});

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // 날짜 범위 내 각 날짜별 단품 파일을 가져와 점포별로 합산
  const fetchCargoForDateRange = async (from: string, to: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) return;

      // 날짜 목록 생성 (최대 14일)
      const dates: string[] = [];
      let cur = new Date(`${from}T00:00:00+09:00`);
      const end = new Date(`${to}T00:00:00+09:00`);
      while (cur <= end && dates.length < 14) {
        const kst = new Date(cur.getTime());
        const y = kst.getUTCFullYear();
        const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
        const d = String(kst.getUTCDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${d}`);
        cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
      }

      // 날짜별로 병렬 요청 후 점포별 최대값으로 합산
      const perDateMaps = await Promise.all(
        dates.map(async (date) => {
          try {
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
            return map;
          } catch {
            return {} as Record<string, CargoSummary>;
          }
        })
      );

      // 날짜별 결과를 점포별로 병합 (각 필드 최대값)
      const merged: Record<string, CargoSummary> = {};
      for (const map of perDateMaps) {
        for (const [storeCode, cargo] of Object.entries(map)) {
          const prev = merged[storeCode];
          if (!prev) {
            merged[storeCode] = { ...cargo };
          } else {
            merged[storeCode] = {
              large_box: Math.max(prev.large_box, cargo.large_box),
              large_inner: Math.max(prev.large_inner, cargo.large_inner),
              small_high: Math.max(prev.small_high, cargo.small_high),
              small_low: Math.max(prev.small_low, cargo.small_low),
              large_other: Math.max(prev.large_other, cargo.large_other),
              tobacco: Math.max(prev.tobacco, cargo.tobacco),
            };
          }
        }
      }
      setCargoByStoreCode(merged);
    } catch {}
  };

  // fetchCargoForDateRange는 조회 버튼 클릭 시(fetchData 내부)에서 호출

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

  // photos는 이미 선택 점포 것만 담겨 있음 → 정렬만 적용
  const selectedStorePhotos = useMemo(() => {
    return [...photos].sort((a, b) => {
      const za = ZONE_ORDER[profilesById[a.user_id]?.work_part ?? ""] ?? 99;
      const zb = ZONE_ORDER[profilesById[b.user_id]?.work_part ?? ""] ?? 99;
      if (za !== zb) return za - zb;
      return a.created_at > b.created_at ? -1 : 1;
    });
  }, [photos, profilesById]);

  // 점포 바뀌면 페이지 리셋
  useEffect(() => {
    setPhotoPage(0);
  }, [selectedStoreCode]);

  const pagedPhotos = useMemo(() => {
    const start = photoPage * PHOTO_PAGE_SIZE;
    return selectedStorePhotos.slice(start, start + PHOTO_PAGE_SIZE);
  }, [selectedStorePhotos, photoPage]);

  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    if (pagedPhotos.length === 0) { setImagesReady(true); return; }
    setImagesReady(false);
    let cancelled = false;
    Promise.all(
      pagedPhotos.map(
        (p) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = p.original_url;
          })
      )
    ).then(() => { if (!cancelled) setImagesReady(true); });
    return () => { cancelled = true; };
  }, [pagedPhotos]);


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


  // ---------- helpers ----------
  const resetSelection = () => {
    setSelectedPhotoIds(new Set());
    setSelectMode(false);
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // ---------- query: 점포 목록 로드 (DB RPC - 서버에서 집계) ----------
  const fetchData = async () => {
    setLoading(true);
    setPhotos([]);
    setProfilesById({});
    try {
      if (dateFrom > dateTo) {
        throw new Error("날짜 범위가 올바르지 않습니다. 시작일이 종료일보다 늦을 수 없습니다.");
      }

      const { startUTC, endUTC } = kstDateRangeToUtcRange(dateFrom, dateTo);

      const { data, error } = await supabase.rpc("get_photo_stores", {
        p_start_utc: startUTC,
        p_end_utc: endUTC,
        p_work_part: workPart,
      });

      if (error) throw error;

      let storeList = (data ?? []) as StoreMapRow[];

      // 검색어 필터 (클라이언트)
      const st = searchText.trim().toLowerCase();
      if (st) {
        storeList = storeList.filter((s) =>
          s.store_code?.toLowerCase().includes(st) || s.store_name?.toLowerCase().includes(st)
        );
      }

      // 호차 필터
      if (carNo !== "ALL") {
        storeList = storeList.filter((s) => String(s.car_no ?? "") === String(carNo));
      }

      setStores(storeList);
      setStoreCount(storeList.length);

      const allowedCodes = new Set(storeList.map((s) => s.store_code));

      if (selectedStoreCode && !allowedCodes.has(selectedStoreCode)) {
        setSelectedStore(null);
        resetSelection();
      } else if (!selectedStore && storeList.length > 0) {
        setSelectedStore(storeList[0]);
        resetSelection();
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- query: 선택 점포 사진 로드 ----------
  const fetchStorePhotos = async (storeCode: string) => {
    setPhotosLoading(true);
    setPhotos([]);
    setProfilesById({});
    try {
      const { startUTC, endUTC } = kstDateRangeToUtcRange(dateFrom, dateTo);

      // profiles 조인으로 1번 쿼리에 해결
      let { data: photoRows, error: photoErr } = await supabase
        .from("photos")
        .select("id, user_id, created_at, status, original_path, original_url, store_code, profiles!photos_user_id_fkey(id, name, work_part, is_admin)")
        .eq("store_code", storeCode)
        .gte("created_at", startUTC)
        .lt("created_at", endUTC)
        .order("created_at", { ascending: false })
        .limit(500);

      // FK 힌트가 맞지 않으면 조인 없이 재시도 후 profiles 별도 조회
      if (photoErr) {
        const fallback = await supabase
          .from("photos")
          .select("id, user_id, created_at, status, original_path, original_url, store_code")
          .eq("store_code", storeCode)
          .gte("created_at", startUTC)
          .lt("created_at", endUTC)
          .order("created_at", { ascending: false })
          .limit(500);
        if (fallback.error) throw fallback.error;
        photoRows = fallback.data as any;
        photoErr = null;
      }

      const profMap: Record<string, ProfileRow> = {};
      const rows: PhotoRow[] = (photoRows ?? []).map((r: any) => {
        const prof = r.profiles;
        if (prof) profMap[r.user_id] = { id: prof.id, name: prof.name ?? null, work_part: prof.work_part ?? null, is_admin: prof.is_admin ?? null };
        const { profiles: _p, ...photoData } = r;
        return photoData as PhotoRow;
      });

      // 조인에서 프로필 못 가져온 경우 별도 쿼리로 보완
      const missingIds = Array.from(new Set(rows.map((r) => r.user_id))).filter((id) => !profMap[id]);
      if (missingIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, name, work_part, is_admin").in("id", missingIds);
        for (const p of (profs ?? []) as any[]) {
          profMap[p.id] = { id: p.id, name: p.name ?? null, work_part: p.work_part ?? null, is_admin: p.is_admin ?? null };
        }
      }

      setPhotos(rows);
      setProfilesById(profMap);
    } finally {
      setPhotosLoading(false);
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

    const { data: sessData } = await supabase.auth.getSession();
    const token = sessData.session?.access_token ?? "";
    const r2Res = await fetch("/api/r2/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: `photos/${p.original_path}` }),
    });
    const r2Data = await r2Res.json();
    if (!r2Res.ok || !r2Data.ok) {
      alert(`R2 삭제 오류: ${r2Data.message ?? r2Res.status}`);
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
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData.session?.access_token ?? "";
      const r2Res = await fetch("/api/r2/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keys: paths.map((p: string) => `photos/${p}`) }),
      });
      const r2Data = await r2Res.json();
      if (!r2Res.ok || !r2Data.ok) return alert(`R2 삭제 오류: ${r2Data.message ?? r2Res.status}`);
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
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const closePreview = () => { setPreviewOpen(false); setZoom(1); setPan({ x: 0, y: 0 }); };

  const handlePreviewWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => {
      const next = prev * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
      const clamped = Math.min(8, Math.max(1, next));
      if (clamped === 1) setPan({ x: 0, y: 0 });
      return clamped;
    });
  };

  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setPan({ x: dragStart.current.px + (e.clientX - dragStart.current.mx), y: dragStart.current.py + (e.clientY - dragStart.current.my) });
  };

  const handlePreviewMouseUp = () => { setDragging(false); dragStart.current = null; };

  const previewPhoto = selectedStorePhotos[previewIndex];

  // 사진 변경 시 zoom 리셋
  React.useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [previewIndex]);

  // 모달 열릴 때 body 스크롤 막기
  React.useEffect(() => {
    if (previewOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [previewOpen]);

  const previewUploader = useMemo(() => {
    if (!previewPhoto) return "";
    const prof = profilesById[previewPhoto.user_id];
    return prof?.name?.trim() ? prof.name.trim() : "-";
  }, [previewPhoto, profilesById]);

  const onCopyPreview = async () => {
    if (!previewPhoto) return;
    await onCopyPhoto(previewPhoto);
  };

  // 점포 선택 시 사진 로드
  useEffect(() => {
    if (checking || !isAdmin) return;
    if (selectedStoreCode) {
      void fetchStorePhotos(selectedStoreCode);
    } else {
      setPhotos([]);
      setProfilesById({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreCode, checking, isAdmin]);

  // ---------- initial fetch ----------
  useEffect(() => {
    if (checking) return;
    if (!isAdmin) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isAdmin]);

  if (checking || (isAdmin && loading)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, fontFamily: "Pretendard, system-ui, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            border: "4px solid #E2E8F0",
            borderTopColor: "#103b53",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontWeight: 800, fontSize: 14, color: "#64748B" }}>
            {checking ? "권한 확인 중..." : "데이터 불러오는 중..."}
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
                  <div style={{ color: "#CBD5E1", fontSize: 16, paddingBottom: 8, flexShrink: 0 }}>~</div>
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
                <button className="btn-primary" onClick={() => { fetchData(); void fetchCargoForDateRange(dateFrom, dateTo); }} disabled={loading} style={{ flex: 1, height: 42, borderRadius: 9, border: "none", background: loading ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 900, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 5px 16px rgba(16,59,83,0.30)" }}>
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
              ) : photosLoading ? (
                <div style={{ borderRadius: 10, padding: 40, color: "#64748B", background: "#F8FAFC", textAlign: "center", fontWeight: 700, fontSize: 14, border: "1px dashed #E2E8F0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 40, height: 40, border: "3px solid #E2E8F0", borderTopColor: "#103b53", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  사진 불러오는 중...
                </div>
              ) : selectedStorePhotos.length === 0 ? (
                <div style={{ borderRadius: 10, padding: 20, color: "#94A3B8", background: "#F8FAFC", textAlign: "center", fontWeight: 700, fontSize: 14, border: "1px dashed #E2E8F0" }}>
                  선택 점포의 사진이 없습니다.
                </div>
              ) : (
                <>
                  <div style={{ position: "relative" }}>
                    {/* 이미지 로딩 오버레이 — 그리드는 DOM에 유지되어 백그라운드에서 미리 로딩 */}
                    {!imagesReady && (
                      <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(248,250,252,0.97)", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 200 }}>
                        <div style={{ width: 40, height: 40, border: "3px solid #E2E8F0", borderTopColor: "#103b53", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>사진 불러오는 중...</span>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 10, visibility: imagesReady ? "visible" : "hidden" }}>
                    {pagedPhotos.map((p, localIdx) => {
                      const globalIdx = photoPage * PHOTO_PAGE_SIZE + localIdx;
                      const selected = selectedPhotoIds.has(p.id);
                      const prof = profilesById[p.user_id];
                      const uploaderName = prof?.name?.trim() ? prof.name.trim() : "-";

                      return (
                        <div key={p.id} className="photo-card-site" style={{ borderRadius: 10, border: selected ? "2px solid #103b53" : "1px solid #E8EFF5", overflow: "hidden", background: selected ? "#EFF6FF" : "white", boxShadow: "0 2px 10px rgba(2,32,46,0.07)" }}>

                          {/* 썸네일 */}
                          <button onClick={() => { if (selectMode) onToggleSelect(p.id); else openPreview(globalIdx); }} style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", background: "#E2E8F0", display: "block" }}>
                            <img
                              src={p.original_url}
                              alt="photo"
                              decoding="async"
                              style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                            />
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
                  </div>{/* grid end */}
                  </div>{/* relative wrapper end */}

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
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "min(820px, 92vh)", background: "white", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.45)", position: "relative" }}>

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
            <div
              onWheel={handlePreviewWheel}
              onMouseDown={handlePreviewMouseDown}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={handlePreviewMouseUp}
              onMouseLeave={handlePreviewMouseUp}
              style={{ flex: 1, background: "#0B1220", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, overflow: "hidden", cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default", userSelect: "none" }}
            >
              <img
                src={previewPhoto.original_url}
                alt="preview"
                decoding="async"
                draggable={false}
                style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block", transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: "center center", transition: dragging ? "none" : "transform 0.1s ease" }}
              />
            </div>
            {zoom > 1 && <div style={{ position: "absolute", bottom: 60, right: 20, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 10px", pointerEvents: "none" }}>{Math.round(zoom * 100)}%</div>}

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
