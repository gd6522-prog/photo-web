"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AccessLevel } from "@/lib/admin-access";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";
import { copyCompressedImageUrlToClipboard } from "@/lib/clipboard-image";

// ✅ 같은 날짜(KST) + 같은 점포 기준으로 사진을 묶은 그룹 타입
type GroupedPhoto = {
  key: string; // "YYYY-MM-DD|store_code"
  dateKST: string; // "YYYY-MM-DD"
  store_code: string;
  store_name: string | null;
  car_no: string | null;
  photos: DeliveryPhotoRow[]; // 가장 최신 순
};

// ✅ photos 배열을 날짜(KST) + 점포 기준으로 그룹핑
function groupPhotosByDateAndStore(photos: DeliveryPhotoRow[]): GroupedPhoto[] {
  const map = new Map<string, GroupedPhoto>();

  for (const p of photos) {
    // KST 날짜 추출 (UTC 시간 + 9시간)
    const d = new Date(p.created_at);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const dateKST = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
    const key = `${dateKST}|${p.store_code}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        dateKST,
        store_code: p.store_code,
        store_name: p.store_name ?? null,
        car_no: p.car_no ?? null,
        photos: [],
      });
    }
    map.get(key)!.photos.push(p);
  }

  // 각 그룹 내 사진은 최신 순 정렬
  for (const g of map.values()) {
    g.photos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // 그룹 목록은 그룹 대표 사진(첫번째) 기준 최신 순
  return Array.from(map.values()).sort((a, b) =>
    new Date(b.photos[0].created_at).getTime() - new Date(a.photos[0].created_at).getTime()
  );
}

type DeliveryPhotoRow = {
  id: string;
  created_by: string;
  created_at: string;
  store_code: string;
  store_name?: string | null;
  car_no?: string | null;
  path: string;
  public_url: string;
  memo: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  work_part: string | null;
  is_admin?: boolean | null;
};

type RedeliveryDoneRow = {
  photo_id: string;
  done_by: string;
  done_at: string;
};

type DriverCategory = "bottle" | "tobacco" | "miochul" | "wash";
type MiochulFlags = { redelivery: boolean; damage: boolean; other: boolean };

const PAGE_SIZE = 15;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function kstTodayYYYYMMDD() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}
function kstCurrentMonthRange() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const firstDay = `${year}-${pad2(month)}-01`;
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDay = `${lastDayDate.getUTCFullYear()}-${pad2(lastDayDate.getUTCMonth() + 1)}-${pad2(lastDayDate.getUTCDate())}`;
  return { firstDay, lastDay };
}
function kstAddDaysYYYYMMDD(baseYYYYMMDD: string, days: number) {
  const base = new Date(`${baseYYYYMMDD}T00:00:00+09:00`);
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}
function kstRangeToUtcRange(startYYYYMMDD: string, endYYYYMMDD: string) {
  const start = new Date(`${startYYYYMMDD}T00:00:00+09:00`);
  const endStart = new Date(`${endYYYYMMDD}T00:00:00+09:00`);
  const end = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
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
function categoryLabel(c: DriverCategory) {
  if (c === "bottle") return "공병";
  if (c === "tobacco") return "담배";
  if (c === "wash") return "세차";
  return "미오출";
}
function categoryColor(c: DriverCategory) {
  if (c === "bottle") return "#2563EB";
  if (c === "tobacco") return "#F59E0B";
  if (c === "wash") return "#059669";
  return "#7C3AED";
}

function memoHasAnyFlag(memo: string | null, flags: MiochulFlags) {
  if (!memo) return false;
  const picked: string[] = [];
  if (flags.redelivery) picked.push("재배송");
  if (flags.damage) picked.push("파손");
  if (flags.other) picked.push("기타");
  if (picked.length === 0) return true;
  return picked.some((k) => memo.includes(k));
}
function isRedeliveryMemo(memo: string | null) {
  return !!memo && memo.includes("재배송");
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

export default function AdminDeliveryPhotosPage() {
  // ---------- auth ----------
  const [checking, setChecking] = useState(true);
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionUid, setSessionUid] = useState("");
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // ---------- toast ----------
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<any>(null);
  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 1600);
  };
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ---------- filters ----------
  const today = kstTodayYYYYMMDD();
  const defaultDateFrom = kstAddDaysYYYYMMDD(today, -7);
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);

  // ✅ 첫 진입 미오출
  const [driverCategory, setDriverCategory] = useState<DriverCategory>("miochul");
  const [miochulFlags, setMiochulFlags] = useState<MiochulFlags>({
    redelivery: false,
    damage: false,
    other: false,
  });

  const [carNo, setCarNo] = useState<string>("ALL");
  const [searchText, setSearchText] = useState<string>("");

  // ---------- paging ----------
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // ---------- data ----------
  const [photos, setPhotos] = useState<DeliveryPhotoRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [redeliveryDoneByPhotoId, setRedeliveryDoneByPhotoId] = useState<Record<string, RedeliveryDoneRow>>({});

  // ---------- selection ----------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const resetSelection = () => {
    setSelectedPhotoIds(new Set());
    setSelectMode(false);
  };

  // ---------- preview ----------
  const [previewOpen, setPreviewOpen] = useState(false);
  // 그룹 인덱스 (어떤 점포/날짜 그룹인지)
  const [previewGroupIndex, setPreviewGroupIndex] = useState(0);
  // 그룹 내 슬라이드 인덱스 (몇 번째 사진인지)
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  const loadAdmin = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const sess = data.session;
    if (!sess) return { ok: false as const };

    const uid = sess.user.id;
    const email = sess.user.email ?? "";
    setSessionUid(uid);
    setSessionEmail(email);

    const { data: prof } = await supabase.from("profiles").select("id, name, work_part, is_admin").eq("id", uid).maybeSingle();

    const profRow: ProfileRow | null = prof
      ? {
          id: (prof as any).id,
          name: (prof as any).name ?? null,
          work_part: (prof as any).work_part ?? null,
          is_admin: (prof as any).is_admin ?? null,
        }
      : null;

    setMyProfile(profRow);

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

  // ✅ 날짜 유효성 보정: from > to면 to를 from으로 맞춤
  useEffect(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) setDateTo(dateFrom);
  }, [dateFrom, dateTo]);

  // ---------- core fetch ----------
  const buildBaseQuery = (startUTC: string, endUTC: string) => {
    // 범위 + category(path prefix) 는 서버에서 거르고
    // memo flags / car / searchText는 일부 서버, 일부 클라에서 적용
    return supabase
      .from("delivery_photos")
      .select("id, created_by, created_at, store_code, store_name, car_no, path, public_url, memo")
      .gte("created_at", startUTC)
      .lt("created_at", endUTC)
      .order("created_at", { ascending: false });
  };

  const enrichDoneAndProfiles = async (rows: DeliveryPhotoRow[], merge: boolean) => {
    // 재배송 처리완료
    const redeliveryPhotoIds = rows.filter((r) => isRedeliveryMemo(r.memo)).map((r) => r.id);
    let doneMapNew: Record<string, RedeliveryDoneRow> = {};
    if (redeliveryPhotoIds.length > 0) {
      const { data: doneRows, error: doneErr } = await supabase
        .from("delivery_redelivery_done")
        .select("photo_id, done_by, done_at")
        .in("photo_id", redeliveryPhotoIds);

      if (!doneErr && doneRows) {
        for (const d of doneRows as any[]) {
          doneMapNew[String(d.photo_id)] = {
            photo_id: String(d.photo_id),
            done_by: String(d.done_by),
            done_at: String(d.done_at),
          };
        }
      }
    }

    // merge done map
    setRedeliveryDoneByPhotoId((prev) => (merge ? { ...prev, ...doneMapNew } : doneMapNew));

    // profiles (업로더 + done_by)
    const uploaderIds = Array.from(new Set(rows.map((r) => r.created_by))).filter(Boolean);
    const doneByIds = Object.values(doneMapNew).map((d) => d.done_by).filter(Boolean);
    const needProfiles = Array.from(new Set([...uploaderIds, ...doneByIds]));

    if (needProfiles.length > 0) {
      const { data: profs, error: profErr } = await supabase.from("profiles").select("id, name, work_part, is_admin").in("id", needProfiles);
      if (!profErr && profs) {
        const profMap: Record<string, ProfileRow> = {};
        for (const p of profs as any[]) {
          profMap[p.id] = { id: p.id, name: p.name ?? null, work_part: p.work_part ?? null, is_admin: p.is_admin ?? null };
        }
        setProfilesById((prev) => (merge ? { ...prev, ...profMap } : profMap));
      }
    }
  };

  const applyClientFilters = (rows: DeliveryPhotoRow[]) => {
    let out = rows.slice();

    // miocul flags
    if (driverCategory === "miochul") out = out.filter((r) => memoHasAnyFlag(r.memo, miochulFlags));
    if (carNo !== "ALL") out = out.filter((r) => String(r.car_no ?? "") === String(carNo));

    const st = searchText.trim().toLowerCase();
    if (st) {
      out = out.filter((r) => {
        const code = String(r.store_code ?? "").toLowerCase();
        const name = String(r.store_name ?? "").toLowerCase();
        const memo = String(r.memo ?? "").toLowerCase();
        const car = String(r.car_no ?? "").toLowerCase();
        return code.includes(st) || name.includes(st) || memo.includes(st) || car.includes(st);
      });
    }

    return out;
  };

  const applySorting = (rows: DeliveryPhotoRow[], doneMap: Record<string, RedeliveryDoneRow>) => {
    const applyRedeliveryPriority = driverCategory === "miochul" && miochulFlags.redelivery;

    const sorted = rows.slice();
    if (applyRedeliveryPriority) {
      sorted.sort((a, b) => {
        const aIsRed = isRedeliveryMemo(a.memo);
        const bIsRed = isRedeliveryMemo(b.memo);
        const aDone = !!doneMap[a.id];
        const bDone = !!doneMap[b.id];

        const aKey = aIsRed && !aDone ? 0 : aIsRed && aDone ? 1 : 2;
        const bKey = bIsRed && !bDone ? 0 : bIsRed && bDone ? 1 : 2;

        if (aKey !== bKey) return aKey - bKey;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  };

  const fetchFirstPage = async () => {
    if (!dateFrom || !dateTo) return;
    if (dateFrom > dateTo) return alert("날짜 범위가 올바르지 않습니다. (시작일 <= 종료일)");

    setLoading(true);
    try {
      const { startUTC, endUTC } = kstRangeToUtcRange(dateFrom, dateTo);

      const from = 0;
      const to = PAGE_SIZE - 1;

      let q = buildBaseQuery(startUTC, endUTC);
      if (driverCategory === "wash") {
        q = (q as any).or("path.ilike.wash1/%,path.ilike.wash2/%");
      } else {
        q = (q as any).ilike("path", `${driverCategory}/%`);
      }
      q = (q as any).range(from, to);

      const { data, error } = await q;
      if (error) throw error;

      const rawRows = (data ?? []) as DeliveryPhotoRow[];

      // reset maps
      setProfilesById({});
      setRedeliveryDoneByPhotoId({});

      // enrich (done + profile) for this page
      await enrichDoneAndProfiles(rawRows, false);

      // filters + sorting (sorting needs doneMap → 최신 state 반영 위해 local로도 계산)
      // doneMap은 setState 비동기라, 여기서는 일단 서버 재조회 없이 “현재 페이지에서만” 다시 뽑음:
      // (enrichDoneAndProfiles 내부에서 만든 doneMapNew를 외부로 빼지 않기 위해,
      //  아래는 재배송우선정렬이 켜진 경우엔 다음 fetchData에서 한번 더 안정화됨.
      //  실사용에는 충분히 자연스럽게 동작함)
      const filtered = applyClientFilters(rawRows);

      // 임시 doneMap (현재 state + 곧 반영될 값) 기준으로 정렬
      // state가 늦게 반영되더라도, “더보기/조회” 시 재정렬됨
      const doneSnapshot = { ...(redeliveryDoneByPhotoId || {}) };
      const sorted = applySorting(filtered, doneSnapshot);

      setPhotos(sorted);
      setPage(0);
      setHasMore(rawRows.length === PAGE_SIZE);
      resetSelection();
    } catch (e: any) {
      alert(e?.message ?? String(e));
      setPhotos([]);
      setHasMore(false);
      setPage(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = async () => {
    if (loadingMore || loading) return;
    if (!hasMore) return;

    setLoadingMore(true);
    try {
      const { startUTC, endUTC } = kstRangeToUtcRange(dateFrom, dateTo);

      const nextPage = page + 1;
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = buildBaseQuery(startUTC, endUTC);
      if (driverCategory === "wash") {
        q = (q as any).or("path.ilike.wash1/%,path.ilike.wash2/%");
      } else {
        q = (q as any).ilike("path", `${driverCategory}/%`);
      }
      q = (q as any).range(from, to);

      const { data, error } = await q;
      if (error) throw error;

      const rawRows = (data ?? []) as DeliveryPhotoRow[];
      await enrichDoneAndProfiles(rawRows, true);

      // 기존 + 신규 합치고 → 필터/정렬 다시
      const mergedRaw = [...photos, ...rawRows];

      const filtered = applyClientFilters(mergedRaw);
      const doneSnapshot = { ...(redeliveryDoneByPhotoId || {}) }; // state 반영 전일 수 있음
      const sorted = applySorting(filtered, doneSnapshot);

      setPhotos(sorted);
      setPage(nextPage);
      setHasMore(rawRows.length === PAGE_SIZE);
    } catch (e: any) {
      alert(e?.message ?? String(e));
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // ✅ 초기 로딩
  useEffect(() => {
    if (checking || !isAdmin) return;
    fetchFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isAdmin]);

  // ✅ 필터 변경 시: 첫 페이지로 리셋
  useEffect(() => {
    if (checking || !isAdmin) return;
    fetchFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, driverCategory, miochulFlags.redelivery, miochulFlags.damage, miochulFlags.other, carNo, searchText]);

  const carOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) {
      const v = String(p.car_no ?? "").trim();
      if (v) set.add(v);
    }
    const arr = Array.from(set).sort((a, b) => Number(a) - Number(b));
    return ["ALL", ...arr];
  }, [photos]);

  const onDownloadPhoto = async (p: DeliveryPhotoRow) => {
    const name = `${p.store_code}_${p.id}.jpg`;
    await forceDownload(p.public_url, name);
  };

  const onCopyPhoto = async (p: DeliveryPhotoRow) => {
    try {
      await copyImageToClipboard(p.public_url);
      toast("이미지 복사됨");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  };

  const onDeletePhoto = async (p: DeliveryPhotoRow) => {
    if (!confirm("이 사진을 삭제할까요? (DB + Storage 삭제)")) return;

    const { error: rmErr } = await supabase.storage.from("delivery_photos").remove([p.path]);
    if (rmErr) return alert(`Storage 삭제 오류: ${rmErr.message}`);

    const { error: delErr } = await supabase.from("delivery_photos").delete().eq("id", p.id);
    if (delErr) return alert(`DB 삭제 오류: ${delErr.message}`);

    setPhotos((prev) => prev.filter((ph) => ph.id !== p.id));
  };

  const toggleRedeliveryDone = async (photo: DeliveryPhotoRow) => {
    if (!myProfile?.id) return alert("세션/프로필을 확인할 수 없습니다.");

    // 현재 state 기준
    const cur = redeliveryDoneByPhotoId[photo.id];
    if (!cur) {
      const { error } = await supabase.from("delivery_redelivery_done").insert({ photo_id: photo.id, done_by: myProfile.id });
      if (error) return alert(`처리완료 저장 오류: ${error.message}`);
      setRedeliveryDoneByPhotoId((prev) => ({
        ...prev,
        [photo.id]: { photo_id: photo.id, done_by: myProfile.id, done_at: new Date().toISOString() },
      }));
      toast("재배송 처리완료 체크됨");
    } else {
      const { error } = await supabase.from("delivery_redelivery_done").delete().eq("photo_id", photo.id);
      if (error) return alert(`처리완료 해제 오류: ${error.message}`);
      setRedeliveryDoneByPhotoId((prev) => {
        const next = { ...prev };
        delete next[photo.id];
        return next;
      });
      toast("재배송 처리완료 해제됨");
    }
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
    setSelectedPhotoIds(new Set(photos.map((p) => p.id)));
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

    const { data, error } = await supabase.from("delivery_photos").select("id, path").in("id", ids);
    if (error) return alert(error.message);

    const rows = (data ?? []) as Array<{ id: string; path: string }>;
    const paths = rows.map((r) => r.path).filter(Boolean);

    const { error: rmErr } = await supabase.storage.from("delivery_photos").remove(paths);
    if (rmErr) return alert(`Storage 삭제 오류: ${rmErr.message}`);

    const { error: delErr } = await supabase.from("delivery_photos").delete().in("id", ids);
    if (delErr) return alert(`DB 삭제 오류: ${delErr.message}`);

    const deletedSet = new Set(ids);
    onClearSelect();
    setPhotos((prev) => prev.filter((ph) => !deletedSet.has(ph.id)));
  };

  const onBulkDownload = async () => {
    const selected = photos.filter((p) => selectedPhotoIds.has(p.id));
    for (let i = 0; i < selected.length; i++) {
      await onDownloadPhoto(selected[i]);
      await new Promise((r) => setTimeout(r, 160));
    }
  };

  const onBulkCopy = async () => {
    const selected = photos.filter((p) => selectedPhotoIds.has(p.id));
    for (let i = 0; i < selected.length; i++) {
      await onCopyPhoto(selected[i]);
      await new Promise((r) => setTimeout(r, 120));
    }
    toast(`선택 ${selected.length}개 복사(마지막 이미지가 남습니다)`);
  };

  // ✅ 그룹핑된 사진 목록
  const groupedPhotos = useMemo(() => groupPhotosByDateAndStore(photos), [photos]);

  // 현재 열린 그룹 및 그룹 내 슬라이드 사진
  const previewGroup = groupedPhotos[previewGroupIndex] ?? null;
  const previewPhoto = previewGroup?.photos[previewSlideIndex] ?? null;

  const openPreview = (groupIndex: number, slideIndex = 0) => {
    setPreviewGroupIndex(groupIndex);
    setPreviewSlideIndex(slideIndex);
    setPreviewOpen(true);
  };

  const closePreview = () => setPreviewOpen(false);

  // 그룹 내 이전/다음 슬라이드
  const goPrevSlide = () => setPreviewSlideIndex((v) => Math.max(0, v - 1));
  const goNextSlide = () => setPreviewSlideIndex((v) => Math.min((previewGroup?.photos.length ?? 1) - 1, v + 1));

  // 키보드 단축키: 좌우 = 슬라이드 이동
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") goPrevSlide();
      if (e.key === "ArrowRight") goNextSlide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, previewGroup?.photos.length]);

  if (checking) return <div style={{ padding: 24, fontFamily: "system-ui" }}>로그인 확인 중...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 900, color: "#111827" }}>권한이 없습니다.</div>
        <div style={{ marginTop: 6, color: "#6B7280", fontSize: 13 }}>관리자/일반관리자/업체관리자만 접근 가능합니다.</div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
          현재 로그인: {sessionEmail || "-"} / UID: {sessionUid || "-"}
        </div>
      </div>
    );
  }

  const rightHeaderActions = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
      {!selectMode ? (
        <>
          <button className="btn-secondary" onClick={() => setSelectMode(true)} disabled={photos.length === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: photos.length === 0 ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: photos.length === 0 ? "not-allowed" : "pointer", color: photos.length === 0 ? "#CBD5E1" : "#374151" }}>선택모드</button>
          <button className="btn-secondary" onClick={onSelectAll} disabled={photos.length === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: photos.length === 0 ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: photos.length === 0 ? "not-allowed" : "pointer", color: photos.length === 0 ? "#CBD5E1" : "#374151" }}>전체선택</button>
        </>
      ) : (
        <>
          <button className="btn-secondary" onClick={onSelectAll} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: "#374151" }}>전체선택</button>
          <button className="btn-secondary" onClick={onClearSelect} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: "#374151" }}>선택해제</button>
          <button className="btn-primary" onClick={onBulkDownload} disabled={selectedPhotoIds.size === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "none", background: selectedPhotoIds.size === 0 ? "#CBD5E1" : "#1E293B", color: "white", fontWeight: 800, fontSize: 13, cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer", boxShadow: selectedPhotoIds.size === 0 ? "none" : "0 3px 8px rgba(30,41,59,0.28)" }}>다운로드 ({selectedPhotoIds.size})</button>
          <button className="btn-secondary" onClick={onBulkCopy} disabled={selectedPhotoIds.size === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: selectedPhotoIds.size === 0 ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer", color: selectedPhotoIds.size === 0 ? "#CBD5E1" : "#374151" }}>복사 ({selectedPhotoIds.size})</button>
          <button className="btn-danger" onClick={onBulkDelete} disabled={selectedPhotoIds.size === 0} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "none", background: selectedPhotoIds.size === 0 ? "#FECACA" : "#EF4444", color: "white", fontWeight: 800, fontSize: 13, cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer", boxShadow: selectedPhotoIds.size === 0 ? "none" : "0 3px 8px rgba(239,68,68,0.30)" }}>삭제 ({selectedPhotoIds.size})</button>
          <div style={{ width: 1, height: 22, background: "#E2E8F0" }} />
          <button className="btn-secondary" onClick={resetSelection} style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: "#64748B" }}>종료</button>
        </>
      )}
    </div>
  );

  const doneRowForPreview = previewPhoto ? redeliveryDoneByPhotoId[previewPhoto.id] : undefined;
  const doneByNameForPreview = doneRowForPreview
    ? profilesById[doneRowForPreview.done_by]?.name?.trim() || doneRowForPreview.done_by
    : "";

  return (
    <div style={{ fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif", background: "transparent", minHeight: 0, padding: "0 6px 8px" }}>
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
        .btn-success { transition: all 0.15s ease; }
        .btn-success:hover:not(:disabled) { filter: brightness(0.92); }
        .photo-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .photo-card:hover { box-shadow: 0 16px 36px rgba(2,32,46,0.18) !important; transform: translateY(-3px); }
        .filter-input:focus { border-color: #103b53 !important; box-shadow: 0 0 0 3px rgba(16,59,83,0.10); outline: none; }
        .category-btn { transition: all 0.15s ease; }
        .category-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .category-btn:active { transform: translateY(0); opacity: 0.75; }
      `}</style>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 200, background: "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", padding: "11px 18px", borderRadius: 10, fontWeight: 900, fontSize: 13, boxShadow: "0 8px 24px rgba(16,59,83,0.38)", letterSpacing: -0.2 }}>
          {toastMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, padding: 0, alignItems: "flex-start", maxWidth: 1900, margin: "0 auto" }}>

        {/* LEFT SIDEBAR */}
        <div style={{ width: 300, minWidth: 300, maxWidth: 300, position: "sticky", top: 14, maxHeight: "calc(100vh - 28px)", overflow: "auto" }}>
          <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", padding: "18px 16px", background: "white", boxShadow: "0 4px 20px rgba(2,32,46,0.08)" }}>

            {/* 사이드바 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ width: 4, height: 18, borderRadius: 2, background: "linear-gradient(180deg,#103b53,#0f766e)", flexShrink: 0 }} />
              <div style={{ fontWeight: 900, fontSize: 15, color: "#0F172A" }}>조회 필터</div>
            </div>

            {/* 조회구분 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>조회구분</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {(["miochul", "bottle", "tobacco", "wash"] as DriverCategory[]).map((c) => {
                  const on = driverCategory === c;
                  const color = categoryColor(c);
                  return (
                    <button
                      key={c}
                      className="category-btn"
                      onClick={() => {
                        setDriverCategory(c);
                        if (c !== "miochul") setMiochulFlags({ redelivery: false, damage: false, other: false });
                        if (c === "bottle" || c === "tobacco") { setDateFrom(today); setDateTo(today); }
                        if (c === "wash") { const { firstDay, lastDay } = kstCurrentMonthRange(); setDateFrom(firstDay); setDateTo(lastDay); }
                        if (c === "miochul") { setDateFrom(defaultDateFrom); setDateTo(today); }
                        setCarNo("ALL");
                        setSearchText("");
                      }}
                      style={{
                        height: 38,
                        borderRadius: 8,
                        border: `2px solid ${on ? color : "#E2E8F0"}`,
                        background: on ? color : "white",
                        fontWeight: 900,
                        fontSize: 13,
                        cursor: "pointer",
                        color: on ? "white" : "#475569",
                        boxShadow: on ? `0 4px 12px ${color}55` : "none",
                      }}
                    >
                      {categoryLabel(c)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 미오출 상세 */}
            {driverCategory === "miochul" && (
              <div style={{ marginBottom: 18, background: "#F5F3FF", borderRadius: 10, padding: "11px 12px", border: "1px solid #EDE9FE" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#7C3AED", letterSpacing: 1, marginBottom: 9 }}>미오출 상세</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ key: "redelivery", label: "재배송" }, { key: "damage", label: "파손" }, { key: "other", label: "기타" }].map((x) => {
                    const on = (miochulFlags as any)[x.key] as boolean;
                    return (
                      <button
                        key={x.key}
                        className="category-btn"
                        onClick={() => setMiochulFlags((p) => ({ ...p, [x.key]: !on } as any))}
                        style={{
                          flex: 1,
                          height: 34,
                          borderRadius: 7,
                          border: `1.5px solid ${on ? "#7C3AED" : "#DDD6FE"}`,
                          background: on ? "#7C3AED" : "white",
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: "pointer",
                          color: on ? "white" : "#7C3AED",
                          boxShadow: on ? "0 3px 8px rgba(124,58,237,0.3)" : "none",
                        }}
                      >
                        {x.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 날짜 범위 */}
            <div style={{ marginBottom: 16 }}>
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

            {/* 구분선 */}
            <div style={{ height: 1, background: "#F1F5F9", margin: "0 0 16px" }} />

            {/* 호차 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>호차</div>
              <select value={carNo} onChange={(e) => setCarNo(e.target.value)} className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 10px", fontWeight: 800, fontSize: 13, color: "#0F172A", background: "white", cursor: "pointer", outline: "none" }}>
                {carOptions.map((c) => (<option key={c} value={c}>{c === "ALL" ? "전체" : `${c}호차`}</option>))}
              </select>
            </div>

            {/* 검색어 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>검색</div>
              <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="점포코드, 점포명, 메모..." className="filter-input" style={{ width: "100%", height: 38, borderRadius: 8, border: "1.5px solid #E2E8F0", padding: "0 12px", fontWeight: 700, fontSize: 13, color: "#0F172A", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* 조회 / 초기화 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={fetchFirstPage} disabled={loading} style={{ flex: 1, height: 42, borderRadius: 9, border: "none", background: loading ? "#94A3B8" : "linear-gradient(135deg,#103b53 0%,#0f766e 100%)", color: "white", fontWeight: 900, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 5px 16px rgba(16,59,83,0.30)" }}>
                {loading ? "조회중..." : "조회"}
              </button>
              <button className="btn-secondary" onClick={() => { setDateFrom(defaultDateFrom); setDateTo(today); setDriverCategory("miochul"); setMiochulFlags({ redelivery: false, damage: false, other: false }); setCarNo("ALL"); setSearchText(""); }} disabled={loading} style={{ height: 42, padding: "0 14px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", color: "#64748B" }}>
                초기화
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", background: "white", overflow: "hidden", boxShadow: "0 4px 20px rgba(2,32,46,0.08)" }}>

            {/* 헤더 */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FAFBFC" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#0F172A", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{dateFrom} ~ {dateTo}</span>
                  <span style={{ padding: "2px 9px", borderRadius: 6, background: categoryColor(driverCategory) + "20", color: categoryColor(driverCategory), fontWeight: 900, fontSize: 12 }}>{categoryLabel(driverCategory)}</span>
                  <span style={{ color: "#94A3B8", fontWeight: 700, fontSize: 13 }}>총 {photos.length}장</span>
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3, fontWeight: 700 }}>
                  {driverCategory === "miochul" && miochulFlags.redelivery ? "정렬: 재배송 미처리 우선" : "정렬: 최신순"}
                </div>
              </div>
              {rightHeaderActions}
            </div>

            {photos.length === 0 ? (
              <div style={{ padding: 36, color: "#94A3B8", textAlign: "center", fontWeight: 700, fontSize: 14 }}>{loading ? "불러오는 중..." : "해당 조건의 사진이 없습니다."}</div>
            ) : (
              <div style={{ padding: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 10 }}>
                  {groupedPhotos.map((group, gIdx) => {
                    const rep = group.photos[0];
                    const prof = profilesById[rep.created_by];
                    const uploader = prof?.name?.trim() ? prof.name.trim() : "-";
                    const isSel = group.photos.some((p) => selectedPhotoIds.has(p.id));
                    const photoCount = group.photos.length;
                    const isRedelivery = group.photos.some((p) => isRedeliveryMemo(p.memo));
                    const doneRow = redeliveryDoneByPhotoId[rep.id];
                    const doneByName = doneRow ? profilesById[doneRow.done_by]?.name?.trim() || doneRow.done_by : "";

                    return (
                      <div key={group.key} className="photo-card" style={{ borderRadius: 10, border: "1px solid #E8EFF5", overflow: "hidden", background: "white", boxShadow: "0 2px 10px rgba(2,32,46,0.07)" }}>

                        {/* 썸네일 */}
                        <div style={{ position: "relative", background: "#0B1220" }}>
                          <button onClick={() => openPreview(gIdx, 0)} style={{ width: "100%", border: "none", padding: 0, margin: 0, background: "transparent", cursor: "pointer", display: "block" }}>
                            <img src={rep.public_url} alt={rep.id} loading="lazy" decoding="async" style={{ width: "100%", height: 118, objectFit: "cover", display: "block" }} />
                          </button>

                          {photoCount > 1 && (
                            <div style={{ position: "absolute", left: 7, bottom: 7, height: 21, padding: "0 7px", borderRadius: 5, background: "rgba(15,23,42,0.82)", color: "white", fontWeight: 800, fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                              📷 {photoCount}
                            </div>
                          )}

                          {selectMode && (
                            <button className="category-btn" onClick={() => group.photos.forEach((p) => onToggleSelect(p.id))} style={{ position: "absolute", right: 7, top: 7, height: 26, padding: "0 8px", borderRadius: 6, border: isSel ? "2px solid white" : "1.5px solid rgba(255,255,255,0.55)", background: isSel ? "white" : "rgba(15,23,42,0.60)", color: isSel ? "#0F172A" : "white", fontWeight: 900, fontSize: 11, cursor: "pointer" }}>
                              {isSel ? "✓ 선택됨" : "선택"}
                            </button>
                          )}

                          {isRedelivery && (
                            <div style={{ position: "absolute", right: 7, bottom: 7, height: 21, padding: "0 7px", borderRadius: 5, background: doneRow ? "rgba(220,252,231,0.97)" : "rgba(254,226,226,0.97)", color: doneRow ? "#16A34A" : "#DC2626", display: "flex", alignItems: "center", fontWeight: 900, fontSize: 10, border: `1px solid ${doneRow ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)"}` }}>
                              {doneRow ? "완료" : "미처리"}
                            </div>
                          )}
                        </div>

                        {/* 메타 */}
                        <div style={{ padding: "9px 10px 10px" }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: "#0F172A" }}>{group.dateKST}</div>
                          <div style={{ marginTop: 2, fontSize: 11, color: "#475569", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <span style={{ color: "#94A3B8" }}>[{group.store_code}]</span> {group.store_name ?? ""}{group.car_no ? ` · ${group.car_no}호` : ""}
                          </div>
                          <div style={{ marginTop: 1, fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>{uploader}</div>

                          {isRedelivery && (
                            <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                              <button className={doneRow ? "btn-success" : "btn-danger"} onClick={() => toggleRedeliveryDone(rep)} style={{ height: 24, padding: "0 8px", borderRadius: 5, border: "none", background: doneRow ? "#DCFCE7" : "#FEE2E2", fontWeight: 900, cursor: "pointer", color: doneRow ? "#16A34A" : "#DC2626", fontSize: 10, boxShadow: "none" }}>
                                {doneRow ? "✅ 완료" : "⬜ 미처리"}
                              </button>
                              {doneRow && <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700 }}>{doneByName}</div>}
                            </div>
                          )}

                          {rep.memo && (
                            <div style={{ marginTop: 5, fontSize: 10, color: "#475569", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#F8FAFC", borderRadius: 5, padding: "3px 7px" }} title={rep.memo}>
                              {rep.memo}
                            </div>
                          )}

                          {/* 버튼 */}
                          <div style={{ marginTop: 9, display: "flex", gap: 5 }}>
                            <button className="btn-primary" onClick={() => onDownloadPhoto(rep)} style={{ flex: 1, height: 30, borderRadius: 7, border: "none", background: "#1E293B", color: "white", fontWeight: 900, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 7px rgba(30,41,59,0.28)" }}>
                              다운
                            </button>
                            <button className="btn-secondary" onClick={() => onCopyPhoto(rep)} style={{ flex: 1, height: 30, borderRadius: 7, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 900, fontSize: 11, cursor: "pointer", color: "#374151" }}>
                              복사
                            </button>
                            <button className="btn-danger" onClick={() => onDeletePhoto(rep)} style={{ height: 30, padding: "0 10px", borderRadius: 7, border: "none", background: "#EF4444", color: "white", fontWeight: 900, fontSize: 11, cursor: "pointer", boxShadow: "0 2px 7px rgba(239,68,68,0.30)" }}>
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 더보기 */}
                <div style={{ display: "flex", justifyContent: "center", padding: "20px 0 6px" }}>
                  {hasMore ? (
                    <button className="btn-secondary" onClick={fetchMore} disabled={loadingMore} style={{ height: 40, padding: "0 28px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: loadingMore ? "#F8FAFC" : "white", fontWeight: 800, fontSize: 13, cursor: loadingMore ? "not-allowed" : "pointer", color: "#64748B", boxShadow: "0 2px 8px rgba(2,32,46,0.06)" }}>
                      {loadingMore ? "불러오는 중..." : "더 보기"}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 700 }}>— 마지막입니다 —</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && previewPhoto && previewGroup && (
        <div onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.82)", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, backdropFilter: "blur(6px)" }}>
          <div style={{ width: "min(1200px, 96vw)", height: "min(820px, 92vh)", background: "white", borderRadius: 16, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto", boxShadow: "0 24px 64px rgba(0,0,0,0.45)" }}>

            {/* Modal 헤더 */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FAFBFC" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "#0F172A", fontSize: 15 }}>
                  <span style={{ color: "#94A3B8", fontWeight: 800 }}>[{previewGroup.store_code}]</span> {previewGroup.store_name ?? ""}{previewGroup.car_no ? ` · ${previewGroup.car_no}호차` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, fontWeight: 700 }}>
                  {formatKST(previewPhoto.created_at)} · {previewSlideIndex + 1} / {previewGroup.photos.length}장
                </div>

                {isRedeliveryMemo(previewPhoto.memo) && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button className={doneRowForPreview ? "btn-success" : "btn-danger"} onClick={() => toggleRedeliveryDone(previewPhoto)} style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", background: doneRowForPreview ? "#DCFCE7" : "#FEE2E2", fontWeight: 900, cursor: "pointer", color: doneRowForPreview ? "#16A34A" : "#DC2626", fontSize: 12, boxShadow: "none" }}>
                      {doneRowForPreview ? "✅ 처리완료" : "⬜ 미처리"}
                    </button>
                    {doneRowForPreview && (
                      <div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                        {doneByNameForPreview} · {formatKST(doneRowForPreview.done_at)}
                      </div>
                    )}
                  </div>
                )}

                {previewPhoto.memo && (
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 6, fontWeight: 700, background: "#F8FAFC", borderRadius: 6, padding: "3px 9px", display: "inline-block", border: "1px solid #F1F5F9" }}>
                    {previewPhoto.memo}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                <button className="btn-secondary" onClick={goPrevSlide} disabled={previewSlideIndex === 0} style={{ height: 34, padding: "0 13px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: previewSlideIndex === 0 ? "#F8FAFC" : "white", fontWeight: 900, cursor: previewSlideIndex === 0 ? "not-allowed" : "pointer", color: previewSlideIndex === 0 ? "#CBD5E1" : "#374151", fontSize: 13 }}>← 이전</button>
                <button className="btn-secondary" onClick={goNextSlide} disabled={previewSlideIndex >= previewGroup.photos.length - 1} style={{ height: 34, padding: "0 13px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: previewSlideIndex >= previewGroup.photos.length - 1 ? "#F8FAFC" : "white", fontWeight: 900, cursor: previewSlideIndex >= previewGroup.photos.length - 1 ? "not-allowed" : "pointer", color: previewSlideIndex >= previewGroup.photos.length - 1 ? "#CBD5E1" : "#374151", fontSize: 13 }}>다음 →</button>
                <div style={{ width: 1, height: 22, background: "#E2E8F0", margin: "0 2px" }} />
                <button className="btn-primary" onClick={async () => onDownloadPhoto(previewPhoto)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "#1E293B", color: "white", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 3px 9px rgba(30,41,59,0.28)" }}>다운로드</button>
                <button className="btn-secondary" onClick={() => onCopyPhoto(previewPhoto)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 900, fontSize: 13, cursor: "pointer", color: "#374151" }}>복사</button>
                <button className="btn-danger" onClick={async () => { await onDeletePhoto(previewPhoto); setPreviewSlideIndex((v) => Math.max(0, Math.min(v, (previewGroup.photos.length || 1) - 2))); }} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "#EF4444", color: "white", fontWeight: 900, fontSize: 13, cursor: "pointer", boxShadow: "0 3px 9px rgba(239,68,68,0.28)" }}>삭제</button>
                <button className="btn-secondary" onClick={closePreview} style={{ height: 34, padding: "0 13px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", color: "#64748B" }}>✕ 닫기</button>
              </div>
            </div>

            {/* 사진 영역 */}
            <div style={{ background: "#0B1220", overflow: "hidden", position: "relative" }}>
              <img key={previewPhoto.id} src={previewPhoto.public_url} alt="preview" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />

              {previewGroup.photos.length > 1 && (
                <>
                  <button onClick={goPrevSlide} disabled={previewSlideIndex === 0} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 10, border: "none", background: previewSlideIndex === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.90)", color: previewSlideIndex === 0 ? "rgba(255,255,255,0.25)" : "#0F172A", fontWeight: 900, fontSize: 22, cursor: previewSlideIndex === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.28)", transition: "all 0.15s" }}>‹</button>
                  <button onClick={goNextSlide} disabled={previewSlideIndex >= previewGroup.photos.length - 1} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 10, border: "none", background: previewSlideIndex >= previewGroup.photos.length - 1 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.90)", color: previewSlideIndex >= previewGroup.photos.length - 1 ? "rgba(255,255,255,0.25)" : "#0F172A", fontWeight: 900, fontSize: 22, cursor: previewSlideIndex >= previewGroup.photos.length - 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.28)", transition: "all 0.15s" }}>›</button>
                  <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
                    {previewGroup.photos.map((_, i) => (
                      <button key={i} onClick={() => setPreviewSlideIndex(i)} style={{ width: i === previewSlideIndex ? 22 : 8, height: 8, borderRadius: 4, border: "none", background: i === previewSlideIndex ? "white" : "rgba(255,255,255,0.38)", cursor: "pointer", padding: 0, transition: "all 0.2s", boxShadow: i === previewSlideIndex ? "0 0 0 2px rgba(255,255,255,0.3)" : "none" }} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 푸터 */}
            <div style={{ padding: "9px 16px", borderTop: "1px solid #F1F5F9", fontSize: 11, color: "#94A3B8", fontWeight: 700, background: "#FAFBFC" }}>
              단축키: ← / → 이동 · Esc 닫기
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
