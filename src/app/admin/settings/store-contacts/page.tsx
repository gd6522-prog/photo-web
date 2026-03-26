"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type ContactRow = {
  id: string;
  store_code: string | null;
  store_name: string;
  phone: string;
  memo: string | null;
  created_at: string;
};

type DraftRow = {
  store_code: string;
  store_name: string;
  phone: string;
  memo: string;
};

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return raw;
}

function inputStyle(width?: number): React.CSSProperties {
  return {
    width: width ? width : "100%",
    height: 38,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };
}

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #E2E8F0",
  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
  padding: 20,
};

// ──────────────────────────────────────────────────────────────
// 파일 형식 감지 & 파싱
// 지원 형식 1 (제공 파일): 헤더행 있음, B열=점포코드, C열=점포명, D열=연락처
// 지원 형식 2 (범용):      헤더행 있음, A열=점포명, B열=전화번호, C열=메모
// ──────────────────────────────────────────────────────────────
function parseSheet(raw: any[][]): DraftRow[] {
  if (raw.length < 2) return [];

  const header = raw[0].map((c: any) => String(c ?? "").trim());

  // 형식1 감지: 헤더에 "점포코드" 또는 "연락처" 포함
  const isFormat1 =
    header.some((h) => h.includes("점포코드")) ||
    header.some((h) => h.includes("연락처"));

  const result: DraftRow[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    let store_code = "";
    let store_name = "";
    let phone = "";
    let memo = "";

    if (isFormat1) {
      // B(1)=점포코드, C(2)=점포명, D(3)=연락처
      store_code = String(row[1] ?? "").trim();
      store_name = String(row[2] ?? "").trim();
      phone = String(row[3] ?? "").replace(/\D/g, "");
      memo = String(row[4] ?? "").trim();
    } else {
      // A(0)=점포명, B(1)=전화번호, C(2)=메모
      store_name = String(row[0] ?? "").trim();
      phone = String(row[1] ?? "").replace(/\D/g, "");
      memo = String(row[2] ?? "").trim();
    }

    if (!store_name || !phone) continue;
    result.push({ store_code, store_name, phone, memo });
  }

  return result;
}

export default function StoreContactsPage() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [draft, setDraft] = useState<DraftRow>({ store_code: "", store_name: "", phone: "", memo: "" });

  const [preview, setPreview] = useState<DraftRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("store_contacts")
      .select("id,store_code,store_name,phone,memo,created_at")
      .order("store_name", { ascending: true });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setRows(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    return r.store_name.includes(q) || r.phone.includes(q) || (r.store_code ?? "").includes(q);
  });

  // ── 단건 추가 ──
  const addOne = async () => {
    const name = draft.store_name.trim();
    const phone = draft.phone.trim();
    if (!name || !phone) { setErr("점포명과 전화번호는 필수입니다."); return; }
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("store_contacts").insert({
      store_code: draft.store_code.trim() || null,
      store_name: name,
      phone: phone.replace(/\D/g, ""),
      memo: draft.memo.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setDraft({ store_code: "", store_name: "", phone: "", memo: "" });
    await load();
  };

  // ── 삭제 ──
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개를 삭제할까요?`)) return;
    setSaving(true);
    const { error } = await supabase.from("store_contacts").delete().in("id", [...selectedIds]);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSelectedIds(new Set());
    await load();
  };

  // ── 엑셀 파싱 ──
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const parsed = parseSheet(raw);
        if (parsed.length === 0) {
          setErr("업로드할 데이터가 없습니다. 파일 형식을 확인해 주세요.");
          return;
        }
        setPreview(parsed);
        setShowPreview(true);
        setErr(null);
      } catch {
        setErr("엑셀 파일을 읽을 수 없습니다.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // ── 업로드 확정 ──
  const confirmUpload = async () => {
    setUploading(true);
    setErr(null);
    const { error } = await supabase.from("store_contacts").insert(
      preview.map((r) => ({
        store_code: r.store_code || null,
        store_name: r.store_name,
        phone: r.phone,
        memo: r.memo || null,
      }))
    );
    setUploading(false);
    if (error) { setErr(error.message); return; }
    setShowPreview(false);
    setPreview([]);
    await load();
  };

  const toggleOne = (id: string) =>
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelectedIds(
      filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))
        ? new Set()
        : new Set(filtered.map((r) => r.id))
    );

  const allChecked = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 헤더 */}
      <div style={{ ...panelStyle, padding: "14px 20px" }}>
        <div style={{ fontWeight: 950, fontSize: 18, color: "#0F172A" }}>점포 연락처</div>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>점포명 기준으로 연락처를 관리합니다.</div>
      </div>

      {err && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", color: "#B91C1C", fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* 직접 추가 */}
      <div style={panelStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>직접 추가</div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>점포코드</div>
            <input value={draft.store_code} onChange={(e) => setDraft((p) => ({ ...p, store_code: e.target.value }))} style={inputStyle()} placeholder="예: 00326" />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>점포명 *</div>
            <input value={draft.store_name} onChange={(e) => setDraft((p) => ({ ...p, store_name: e.target.value }))} style={inputStyle()} placeholder="예: 대부도점" />
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>전화번호 *</div>
            <input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} style={inputStyle()} placeholder="01012345678" inputMode="tel" />
            {draft.phone && <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280" }}>표시: {formatPhone(draft.phone)}</div>}
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>메모</div>
            <input value={draft.memo} onChange={(e) => setDraft((p) => ({ ...p, memo: e.target.value }))} style={inputStyle()} placeholder="선택" />
          </div>
          <button
            onClick={addOne}
            disabled={saving}
            style={{ height: 38, padding: "0 20px", borderRadius: 10, border: "none", background: "#0284C7", color: "white", fontWeight: 800, fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            추가
          </button>
        </div>
      </div>

      {/* 엑셀 업로드 */}
      <div style={panelStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>엑셀 업로드</div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10, lineHeight: 1.8 }}>
          <b>제공 양식</b>: A열 점포명 &nbsp;|&nbsp; B열 점포코드 &nbsp;|&nbsp; C열 점포명 &nbsp;|&nbsp; D열 연락처 (1행 헤더 자동 건너뜀)<br />
          <b>범용 양식</b>: A열 점포명 &nbsp;|&nbsp; B열 전화번호 &nbsp;|&nbsp; C열 메모(선택) (헤더 행 포함)
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ height: 38, padding: "0 20px", borderRadius: 10, border: "1px solid #CBD5E1", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >
            파일 선택 (.xlsx / .xls / .csv)
          </button>
        </div>
      </div>

      {/* 업로드 프리뷰 모달 */}
      {showPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
          <div style={{ width: "100%", maxWidth: 700, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "white", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 60px rgba(2,6,23,0.25)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #E2E8F0", fontWeight: 950, fontSize: 15 }}>
              업로드 미리보기 ({preview.length}건)
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0", width: 90 }}>점포코드</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>점포명</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0", width: 160 }}>전화번호</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                      <td style={{ padding: "7px 12px", color: "#64748B" }}>{r.store_code || "-"}</td>
                      <td style={{ padding: "7px 12px", fontWeight: 700 }}>{r.store_name}</td>
                      <td style={{ padding: "7px 12px", fontFamily: "monospace" }}>{formatPhone(r.phone)}</td>
                      <td style={{ padding: "7px 12px", color: "#64748B" }}>{r.memo || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => { setShowPreview(false); setPreview([]); }}
                style={{ height: 36, padding: "0 18px", borderRadius: 10, border: "1px solid #CBD5E1", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={confirmUpload}
                disabled={uploading}
                style={{ height: 36, padding: "0 18px", borderRadius: 10, border: "none", background: "#0284C7", color: "white", fontWeight: 800, fontSize: 13, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? "저장 중..." : `${preview.length}건 저장`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            전체 {rows.length}건{filtered.length !== rows.length && ` (검색 ${filtered.length}건)`}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="점포명 / 코드 / 전화번호 검색"
              style={{ ...inputStyle(240) }}
            />
            {selectedIds.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={saving}
                style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "#EF4444", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                선택 삭제 ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>불러오는 중...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "1px solid #E2E8F0", width: 40 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0", width: 100 }}>점포코드</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>점포명</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0", width: 170 }}>전화번호</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #E2E8F0" }}>메모</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: "center", opacity: 0.5 }}>
                      {search ? "검색 결과 없음" : "등록된 연락처가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                      </td>
                      <td style={{ padding: "9px 12px", color: "#64748B" }}>{r.store_code || "-"}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800 }}>{r.store_name}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", letterSpacing: 0.5 }}>{formatPhone(r.phone)}</td>
                      <td style={{ padding: "9px 12px", color: "#64748B" }}>{r.memo || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
