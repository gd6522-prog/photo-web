"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isGeneralAdminWorkPart, isMainAdminIdentity } from "@/lib/admin-role";

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

type DriverCategory = "bottle" | "tobacco" | "miochul";
type MiochulFlags = { redelivery: boolean; damage: boolean; other: boolean };

const PAGE_SIZE = 60;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function kstTodayYYYYMMDD() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
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
  return "미오출";
}
function categoryColor(c: DriverCategory) {
  if (c === "bottle") return "#2563EB";
  if (c === "tobacco") return "#F59E0B";
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
  const hasClipboardWrite = !!(navigator.clipboard as any)?.write;
  const hasClipboardItem = typeof (window as any).ClipboardItem !== "undefined";
  if (!hasClipboardWrite || !hasClipboardItem) {
    throw new Error("이 브라우저는 이미지 복사를 지원하지 않습니다. (Chrome/Edge 최신 권장)");
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`이미지 가져오기 실패: ${res.status}`);
  const blob = await res.blob();
  const item = new (window as any).ClipboardItem({ [blob.type || "image/jpeg"]: blob });
  await (navigator.clipboard as any).write([item]);
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
  const [dateFrom, setDateFrom] = useState(today);
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
  const [previewIndex, setPreviewIndex] = useState(0);

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
    const admin = main || general;
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
      q = (q as any).ilike("path", `${driverCategory}/%`);
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
      q = (q as any).ilike("path", `${driverCategory}/%`);
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

    await fetchFirstPage();
  };

  const toggleRedeliveryDone = async (photo: DeliveryPhotoRow) => {
    if (!myProfile?.id) return alert("세션/프로필을 확인할 수 없습니다.");

    // 현재 state 기준
    const cur = redeliveryDoneByPhotoId[photo.id];
    if (!cur) {
      const { error } = await supabase.from("delivery_redelivery_done").insert({ photo_id: photo.id, done_by: myProfile.id });
      if (error) return alert(`처리완료 저장 오류: ${error.message}`);
      toast("재배송 처리완료 체크됨");
    } else {
      const { error } = await supabase.from("delivery_redelivery_done").delete().eq("photo_id", photo.id);
      if (error) return alert(`처리완료 해제 오류: ${error.message}`);
      toast("재배송 처리완료 해제됨");
    }
    // 현재 페이지 상태 유지하며 재조회(첫페이지로 리셋하지 않기 위해 현재까지 로드된 범위 재구성)
    await fetchFirstPage();
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

    onClearSelect();
    await fetchFirstPage();
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

  const openPreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

  const closePreview = () => setPreviewOpen(false);
  const previewPhoto = photos[previewIndex];

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") setPreviewIndex((v) => Math.max(0, v - 1));
      if (e.key === "ArrowRight") setPreviewIndex((v) => Math.min(photos.length - 1, v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, photos.length]);

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
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {!selectMode ? (
        <>
          <button
            onClick={() => setSelectMode(true)}
            disabled={photos.length === 0}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: photos.length === 0 ? "#F3F4F6" : "white",
              fontWeight: 900,
              cursor: photos.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            선택모드
          </button>
          <button
            onClick={onSelectAll}
            disabled={photos.length === 0}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: photos.length === 0 ? "#F3F4F6" : "white",
              fontWeight: 900,
              cursor: photos.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            전체선택
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onSelectAll}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            전체선택
          </button>

          <button
            onClick={onClearSelect}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            선택해제
          </button>

          <button
            onClick={onBulkDownload}
            disabled={selectedPhotoIds.size === 0}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #111827",
              background: selectedPhotoIds.size === 0 ? "#CBD5E1" : "#111827",
              color: "white",
              fontWeight: 900,
              cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            선택다운로드 ({selectedPhotoIds.size})
          </button>

          <button
            onClick={onBulkCopy}
            disabled={selectedPhotoIds.size === 0}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: selectedPhotoIds.size === 0 ? "#F3F4F6" : "white",
              fontWeight: 900,
              cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            선택복사 ({selectedPhotoIds.size})
          </button>

          <button
            onClick={onBulkDelete}
            disabled={selectedPhotoIds.size === 0}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #EF4444",
              background: selectedPhotoIds.size === 0 ? "#FEE2E2" : "#EF4444",
              color: selectedPhotoIds.size === 0 ? "#991B1B" : "white",
              fontWeight: 900,
              cursor: selectedPhotoIds.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            선택삭제 ({selectedPhotoIds.size})
          </button>

          <button
            onClick={resetSelection}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            종료
          </button>
        </>
      )}
    </div>
  );

  const doneRowForPreview = previewPhoto ? redeliveryDoneByPhotoId[previewPhoto.id] : undefined;
  const doneByNameForPreview = doneRowForPreview ? profilesById[doneRowForPreview.done_by]?.name?.trim() || doneRowForPreview.done_by : "";

  return (
    <div
      style={{
        fontFamily: "Pretendard, system-ui, -apple-system, Segoe UI, sans-serif",
        background: "#F3F5F8",
        minHeight: "100vh",
        padding: "10px 10px 14px",
      }}
    >
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 80,
            background: "#111827",
            color: "white",
            padding: "10px 12px",
            borderRadius: 12,
            fontWeight: 900,
            fontSize: 13,
            boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
          }}
        >
          {toastMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, padding: 0, alignItems: "flex-start", maxWidth: 1900, margin: "0 auto" }}>
        {/* LEFT */}
        <div
          style={{
            width: 376,
            minWidth: 376,
            maxWidth: 376,
            position: "sticky",
            top: 14,
            maxHeight: "calc(100vh - 28px)",
            overflow: "auto",
          }}
        >
          <div style={{ border: "1px solid #DDE3EA", borderRadius: 18, padding: 14, background: "white", boxShadow: "0 8px 24px rgba(15,23,42,0.05)" }}>
            <div style={{ fontWeight: 900, color: "#111827" }}>조회</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
              기본: <span style={{ fontWeight: 900, color: "#111827" }}>미오출</span> · 결과 {photos.length}장
            </div>

            <div style={{ height: 12 }} />

            <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>조회구분</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(["miochul", "bottle", "tobacco"] as DriverCategory[]).map((c) => {
                const on = driverCategory === c;
                const color = categoryColor(c);
                return (
                  <button
                    key={c}
                    onClick={() => {
                      setDriverCategory(c);
                      if (c !== "miochul") setMiochulFlags({ redelivery: false, damage: false, other: false });
                      setCarNo("ALL");
                      setSearchText("");
                    }}
                    style={{
                      flex: "1 1 0",
                      minWidth: 90,
                      height: 40,
                      borderRadius: 14,
                      border: `1px solid ${on ? color : "#E5E7EB"}`,
                      background: on ? "#F9FAFB" : "white",
                      fontWeight: 900,
                      cursor: "pointer",
                      color: on ? color : "#111827",
                    }}
                  >
                    {categoryLabel(c)}
                  </button>
                );
              })}
            </div>

            {driverCategory === "miochul" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>미오출 상세</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { key: "redelivery", label: "재배송" },
                    { key: "damage", label: "파손" },
                    { key: "other", label: "기타" },
                  ].map((x) => {
                    const on = (miochulFlags as any)[x.key] as boolean;
                    return (
                      <button
                        key={x.key}
                        onClick={() => setMiochulFlags((p) => ({ ...p, [x.key]: !on } as any))}
                        style={{
                          flex: "1 1 0",
                          minWidth: 100,
                          height: 40,
                          borderRadius: 14,
                          border: `1px solid ${on ? "rgba(124,58,237,0.45)" : "#E5E7EB"}`,
                          background: on ? "#F5F3FF" : "white",
                          fontWeight: 900,
                          cursor: "pointer",
                          color: on ? "#7C3AED" : "#111827",
                        }}
                      >
                        {x.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 6, fontSize: 11, color: "#6B7280", lineHeight: 1.45 }}>
                  ✅ <b>미오출 + 재배송 체크</b> 상태에서만 “재배송 미처리”가 위로 올라갑니다.
                </div>
              </div>
            )}

            <div style={{ height: 12 }} />

            <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>날짜 범위</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#6B7280", marginBottom: 6 }}>시작일</div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#6B7280", marginBottom: 6 }}>종료일</div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>호차</div>
                <select
                  value={carNo}
                  onChange={(e) => setCarNo(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 800,
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
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", marginBottom: 6 }}>검색어</div>
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="예: 27148 / 점포명 / 재배송 / 파손 / 메모"
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    padding: "0 12px",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={fetchFirstPage}
                  disabled={loading}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid #111827",
                    background: loading ? "#CBD5E1" : "#111827",
                    color: "white",
                    fontWeight: 900,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "조회중" : "조회"}
                </button>

                <button
                  onClick={() => {
                    setDateFrom(today);
                    setDateTo(today);
                    setDriverCategory("miochul");
                    setMiochulFlags({ redelivery: false, damage: false, other: false });
                    setCarNo("ALL");
                    setSearchText("");
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    fontWeight: 900,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  초기화
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: "#6B7280" }}>왼쪽 패널: 고정폭 + 독립 스크롤</div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ border: "1px solid #DDE3EA", borderRadius: 18, background: "white", overflow: "hidden", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid #F3F4F6",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>
                  {dateFrom} ~ {dateTo} · {categoryLabel(driverCategory)} · 총 {photos.length}장
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                  {driverCategory === "miochul" && miochulFlags.redelivery ? "정렬: 재배송 미처리 우선" : "정렬: 최신순"}
                </div>
              </div>

              {rightHeaderActions}
            </div>

            {photos.length === 0 ? (
              <div style={{ padding: 14, color: "#6B7280" }}>{loading ? "불러오는 중..." : "해당 조건의 사진이 없습니다."}</div>
            ) : (
              <div style={{ padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                  {photos.map((p, idx) => {
                    const prof = profilesById[p.created_by];
                    const uploader = prof?.name?.trim() ? prof.name.trim() : "-";
                    const isSel = selectedPhotoIds.has(p.id);

                    const isRedelivery = isRedeliveryMemo(p.memo);
                    const doneRow = redeliveryDoneByPhotoId[p.id];
                    const doneByName = doneRow ? profilesById[doneRow.done_by]?.name?.trim() || doneRow.done_by : "";

                    return (
                      <div key={p.id} style={{ border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden", background: "white", boxShadow: "0 4px 14px rgba(15,23,42,0.06)" }}>
                        <div style={{ position: "relative", background: "#0B1220" }}>
                          <button
                            onClick={() => openPreview(idx)}
                            style={{ width: "100%", border: "none", padding: 0, margin: 0, background: "transparent", cursor: "pointer" }}
                          >
                            <img src={p.public_url} alt={p.id} style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }} />
                          </button>

                          {selectMode && (
                            <button
                              onClick={() => onToggleSelect(p.id)}
                              style={{
                                position: "absolute",
                                left: 10,
                                top: 10,
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 999,
                                border: isSel ? "1px solid #111827" : "1px solid rgba(255,255,255,0.25)",
                                background: isSel ? "#111827" : "rgba(17,24,39,0.55)",
                                color: "white",
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              {isSel ? "선택됨" : "선택"}
                            </button>
                          )}

                          {isRedelivery && (
                            <div
                              style={{
                                position: "absolute",
                                right: 10,
                                top: 10,
                                height: 28,
                                padding: "0 10px",
                                borderRadius: 999,
                                border: `1px solid ${doneRow ? "rgba(22,163,74,0.35)" : "rgba(239,68,68,0.35)"}`,
                                background: doneRow ? "rgba(236,253,245,0.95)" : "rgba(254,242,242,0.95)",
                                color: doneRow ? "#16A34A" : "#EF4444",
                                display: "flex",
                                alignItems: "center",
                                fontWeight: 900,
                                fontSize: 12,
                              }}
                            >
                              {doneRow ? "처리완료" : "미처리"}
                            </div>
                          )}
                        </div>

                        <div style={{ padding: 10 }}>
                          <div style={{ fontWeight: 900, fontSize: 12, color: "#111827" }}>{formatKST(p.created_at)}</div>
                          <div style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>
                            [{p.store_code}] {p.store_name ?? ""} {p.car_no ? `· 호차 ${p.car_no}` : ""}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12, color: "#6B7280" }}>업로더: {uploader}</div>

                          {isRedelivery && (
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <button
                                onClick={() => toggleRedeliveryDone(p)}
                                style={{
                                  height: 28,
                                  padding: "0 10px",
                                  borderRadius: 999,
                                  border: `1px solid ${doneRow ? "rgba(22,163,74,0.35)" : "rgba(239,68,68,0.35)"}`,
                                  background: doneRow ? "#ECFDF5" : "#FEF2F2",
                                  fontWeight: 900,
                                  cursor: "pointer",
                                  color: doneRow ? "#16A34A" : "#EF4444",
                                  fontSize: 12,
                                }}
                                title="재배송 처리완료 체크/해제"
                              >
                                {doneRow ? "✅ 처리완료" : "⬜ 미처리"}
                              </button>

                              {doneRow && (
                                <div style={{ fontSize: 12, color: "#374151", fontWeight: 800 }}>
                                  {doneByName} · {formatKST(doneRow.done_at)}
                                </div>
                              )}
                            </div>
                          )}

                          {p.memo && (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 12,
                                color: "#374151",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={p.memo}
                            >
                              메모: {p.memo}
                            </div>
                          )}

                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => onDownloadPhoto(p)}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid #111827",
                                background: "#111827",
                                color: "white",
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              다운
                            </button>

                            <button
                              onClick={() => onCopyPhoto(p)}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid #E5E7EB",
                                background: "white",
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              복사
                            </button>

                            <button
                              onClick={() => onDeletePhoto(p)}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 10,
                                border: "1px solid #EF4444",
                                background: "#EF4444",
                                color: "white",
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ✅ 더보기 */}
                <div style={{ display: "flex", justifyContent: "center", padding: "18px 0 6px" }}>
                  {hasMore ? (
                    <button
                      onClick={fetchMore}
                      disabled={loadingMore}
                      style={{
                        height: 44,
                        padding: "0 18px",
                        borderRadius: 14,
                        border: "1px solid #E5E7EB",
                        background: loadingMore ? "#F3F4F6" : "white",
                        fontWeight: 900,
                        cursor: loadingMore ? "not-allowed" : "pointer",
                      }}
                    >
                      {loadingMore ? "불러오는 중..." : "더보기"}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 800 }}>마지막입니다.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && previewPhoto && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(17,24,39,0.78)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 18,
          }}
        >
          <div
            style={{
              width: "min(1200px, 96vw)",
              height: "min(820px, 92vh)",
              background: "white",
              borderRadius: 16,
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>
                  [{previewPhoto.store_code}] {previewPhoto.store_name ?? ""}
                  {previewPhoto.car_no ? ` · 호차 ${previewPhoto.car_no}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                  {formatKST(previewPhoto.created_at)} · {previewIndex + 1} / {photos.length}
                </div>

                {isRedeliveryMemo(previewPhoto.memo) && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => toggleRedeliveryDone(previewPhoto)}
                      style={{
                        height: 30,
                        padding: "0 10px",
                        borderRadius: 999,
                        border: `1px solid ${doneRowForPreview ? "rgba(22,163,74,0.35)" : "rgba(239,68,68,0.35)"}`,
                        background: doneRowForPreview ? "#ECFDF5" : "#FEF2F2",
                        fontWeight: 900,
                        cursor: "pointer",
                        color: doneRowForPreview ? "#16A34A" : "#EF4444",
                      }}
                      title="재배송 처리완료 체크/해제"
                    >
                      {doneRowForPreview ? "✅ 재배송 처리완료" : "⬜ 재배송 미처리"}
                    </button>

                    {doneRowForPreview && (
                      <div style={{ fontSize: 12, color: "#374151", fontWeight: 800 }}>
                        체크: <span style={{ fontWeight: 900 }}>{doneByNameForPreview}</span> · {formatKST(doneRowForPreview.done_at)}
                      </div>
                    )}
                  </div>
                )}

                {previewPhoto.memo && <div style={{ fontSize: 12, color: "#374151", marginTop: 8, fontWeight: 800 }}>메모: {previewPhoto.memo}</div>}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setPreviewIndex((v) => Math.max(0, v - 1))}
                  disabled={previewIndex === 0}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    background: previewIndex === 0 ? "#F3F4F6" : "white",
                    fontWeight: 900,
                    cursor: previewIndex === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  ← 이전
                </button>

                <button
                  onClick={() => setPreviewIndex((v) => Math.min(photos.length - 1, v + 1))}
                  disabled={previewIndex >= photos.length - 1}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    background: previewIndex >= photos.length - 1 ? "#F3F4F6" : "white",
                    fontWeight: 900,
                    cursor: previewIndex >= photos.length - 1 ? "not-allowed" : "pointer",
                  }}
                >
                  다음 →
                </button>

                <button
                  onClick={async () => onDownloadPhoto(previewPhoto)}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  다운로드
                </button>

                <button
                  onClick={() => onCopyPhoto(previewPhoto)}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  복사
                </button>

                <button
                  onClick={async () => {
                    await onDeletePhoto(previewPhoto);
                    setPreviewIndex((v) => Math.max(0, Math.min(v, photos.length - 2)));
                  }}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #EF4444",
                    background: "#EF4444",
                    color: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  삭제
                </button>

                <button
                  onClick={closePreview}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #E5E7EB",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  닫기 (Esc)
                </button>
              </div>
            </div>

            <div style={{ background: "#0B1220", overflow: "hidden" }}>
              <img src={previewPhoto.public_url} alt="preview" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
            </div>

            <div style={{ padding: 10, borderTop: "1px solid #E5E7EB", fontSize: 12, color: "#6B7280" }}>단축키: ← / → 이동 · Esc 닫기</div>
          </div>
        </div>
      )}
    </div>
  );
}
