"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Receipt = {
  id: string;
  receipt_no: number;
  barcode: string;
  delivery_date: string;
  truck_no: number;
  seq_no: number;
  store_code: string;
  store_name: string;
  reason_code: string;
  reason_name: string;
  item_count: number;
  is_returned: boolean;
  items?: Item[];
};

type Item = {
  line_no: number;
  product_code: string;
  product_name: string;
  inner_qty: number;
  return_qty: number;
  box_qty: number;
  location: string;
};

type Batch = { id: string; month_label: string; upload_date: string; file_name: string };

const REASON_CODE_LABELS: Record<string, string> = {
  "81": "파손", "82": "오발주", "83": "재배송", "84": "맞교환", "85": "긴급출고", "86": "회수",
};

// 인수증 1장 컴포넌트
function ReceiptCard({ receipt, copy }: { receipt: Receipt; copy: "점포용" | "센터용" }) {
  const isStore = copy === "점포용";
  const items = receipt.items ?? [];
  // 최대 10개 항목
  const displayItems = Array.from({ length: 10 }, (_, i) => items[i] ?? null);

  const totalReturnQty = items.reduce((s, it) => s + (it?.return_qty ?? 0), 0);
  const totalBoxQty = items.reduce((s, it) => s + (it?.box_qty ?? 0), 0);

  return (
    <div style={{
      width: "100%",
      fontFamily: "Malgun Gothic, 맑은 고딕, sans-serif",
      fontSize: 10,
      border: "1px solid #333",
      padding: "6px 8px",
      boxSizing: "border-box",
      pageBreakInside: "avoid",
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontWeight: 900, fontSize: 12 }}>이마트24 상온 물류센터</div>
        <div style={{ fontWeight: 900, fontSize: 11, color: isStore ? "#1d4ed8" : "#059669", border: `1px solid ${isStore ? "#1d4ed8" : "#059669"}`, padding: "1px 8px", borderRadius: 3 }}>
          {copy}
        </div>
      </div>

      {/* 제목 */}
      <div style={{ textAlign: "center", fontWeight: 950, fontSize: 13, marginBottom: 6, borderBottom: "2px solid #333", paddingBottom: 4 }}>
        재출고/회수 인수증 [{REASON_CODE_LABELS[receipt.reason_code] ?? receipt.reason_name}]
      </div>

      {/* 기본정보 */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, fontSize: 10 }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px", fontWeight: 800, background: "#f0f4f8", width: "18%" }}>호차/순번</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px", width: "15%" }}>{receipt.truck_no}-{receipt.seq_no}</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px", fontWeight: 800, background: "#f0f4f8", width: "18%" }}>납품예정일</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px" }}>{receipt.delivery_date}</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px", fontWeight: 800, background: "#f0f4f8" }}>점포코드</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px" }}>{receipt.store_code}</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px", fontWeight: 800, background: "#f0f4f8" }}>점포명</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 6px", fontWeight: 800 }}>{receipt.store_name}</td>
          </tr>
        </tbody>
      </table>

      {/* 상품 목록 */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, marginBottom: 4 }}>
        <thead>
          <tr style={{ background: "#e5edf3" }}>
            <th style={{ border: "1px solid #aaa", padding: "2px 4px", width: "6%" }}>순번</th>
            <th style={{ border: "1px solid #aaa", padding: "2px 4px", width: "16%" }}>상품코드</th>
            <th style={{ border: "1px solid #aaa", padding: "2px 4px" }}>상품명</th>
            <th style={{ border: "1px solid #aaa", padding: "2px 4px", width: "8%" }}>입수</th>
            <th style={{ border: "1px solid #aaa", padding: "2px 4px", width: "8%" }}>회수수량</th>
            <th style={{ border: "1px solid #aaa", padding: "2px 4px", width: "8%" }}>배수</th>
            {!isStore && <th style={{ border: "1px solid #aaa", padding: "2px 4px", width: "12%" }}>로케이션</th>}
          </tr>
        </thead>
        <tbody>
          {displayItems.map((item, i) => (
            <tr key={i} style={{ height: 16 }}>
              <td style={{ border: "1px solid #aaa", padding: "1px 4px", textAlign: "center" }}>{item ? item.line_no : ""}</td>
              <td style={{ border: "1px solid #aaa", padding: "1px 4px" }}>{item?.product_code ?? ""}</td>
              <td style={{ border: "1px solid #aaa", padding: "1px 4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 0 }}>{item?.product_name ?? ""}</td>
              <td style={{ border: "1px solid #aaa", padding: "1px 4px", textAlign: "center" }}>{item?.inner_qty ?? ""}</td>
              <td style={{ border: "1px solid #aaa", padding: "1px 4px", textAlign: "center", fontWeight: 800 }}>{item?.return_qty ?? ""}</td>
              <td style={{ border: "1px solid #aaa", padding: "1px 4px", textAlign: "center" }}>{item?.box_qty ?? ""}</td>
              {!isStore && <td style={{ border: "1px solid #aaa", padding: "1px 4px" }}>{item?.location ?? ""}</td>}
            </tr>
          ))}
          {/* 합계 */}
          <tr style={{ background: "#f8fbff", fontWeight: 900 }}>
            <td colSpan={isStore ? 4 : 4} style={{ border: "1px solid #aaa", padding: "2px 4px", textAlign: "right" }}>합  계</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 4px", textAlign: "center" }}>{totalReturnQty || ""}</td>
            <td style={{ border: "1px solid #aaa", padding: "2px 4px", textAlign: "center" }}>{totalBoxQty || ""}</td>
            {!isStore && <td style={{ border: "1px solid #aaa" }} />}
          </tr>
        </tbody>
      </table>

      {/* 서명/바코드 영역 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 4 }}>
        <div style={{ fontSize: 9, color: "#555" }}>
          <div>점포 확인자: _________________________ (인)</div>
          {isStore && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontWeight: 800 }}>인식코드: {receipt.barcode}</div>
              <div>접수순번: {String(receipt.receipt_no).padStart(4, "0")}</div>
            </div>
          )}
        </div>
        {isStore && (
          <div style={{ textAlign: "center", border: "1px solid #aaa", padding: "2px 8px", borderRadius: 3 }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 2, fontWeight: 900 }}>
              {receipt.barcode}
            </div>
            <div style={{ fontSize: 8, color: "#666" }}>[바코드] 회수 스캔용</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InsuPrintPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterReason, setFilterReason] = useState("all");
  const [sortBy, setSortBy] = useState<"reason" | "store" | "truck">("reason");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("insu_batches")
      .select("id, month_label, upload_date, file_name")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setBatches((data ?? []) as Batch[]);
        if (data && data.length > 0) setSelectedBatch(data[0].id);
      });

    // URL에서 batchId 읽기
    const params = new URLSearchParams(window.location.search);
    const bid = params.get("batchId");
    if (bid) setSelectedBatch(bid);
  }, []);

  useEffect(() => {
    if (!selectedBatch) return;
    setLoading(true);
    supabase
      .from("insu_receipts")
      .select("*, items:insu_items(line_no,product_code,product_name,inner_qty,return_qty,box_qty,location)")
      .eq("batch_id", selectedBatch)
      .order("reason_code")
      .order("store_name")
      .order("truck_no")
      .order("seq_no")
      .then(({ data }) => {
        const rows = (data ?? []) as Receipt[];
        setReceipts(rows);
        setSelectedIds(new Set(rows.map((r) => r.id)));
        setLoading(false);
      });
  }, [selectedBatch]);

  const reasonOptions = ["all", ...Array.from(new Set(receipts.map((r) => r.reason_code))).sort()];

  const filtered = receipts
    .filter((r) => filterReason === "all" || r.reason_code === filterReason)
    .sort((a, b) => {
      if (sortBy === "reason") {
        return a.reason_code.localeCompare(b.reason_code) || a.store_name.localeCompare(b.store_name) || a.truck_no - b.truck_no;
      }
      if (sortBy === "store") return a.store_name.localeCompare(b.store_name) || a.truck_no - b.truck_no;
      return a.truck_no - b.truck_no || a.seq_no - b.seq_no;
    });

  const printSelected = filtered.filter((r) => selectedIds.has(r.id));

  const handlePrint = () => {
    const style = document.createElement("style");
    style.innerHTML = `
      @media print {
        body > *:not(#print-root) { display: none !important; }
        #print-root { display: block !important; }
        @page { size: A4; margin: 8mm; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    const printRoot = document.getElementById("print-root");
    if (printRoot) printRoot.style.display = "block";

    window.print();

    document.head.removeChild(style);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* 컨트롤 영역 (인쇄시 숨김) */}
      <div className="no-print">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 950, color: "#103b53", margin: 0 }}>인수증 출력</h1>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>출력할 인수증을 선택 후 인쇄하세요 (점포용 + 센터용 2매)</p>
          </div>
          <button
            onClick={handlePrint}
            disabled={printSelected.length === 0}
            style={{
              padding: "10px 24px",
              background: printSelected.length === 0 ? "#e5e7eb" : "linear-gradient(135deg,#103b53,#0f766e)",
              color: printSelected.length === 0 ? "#9ca3af" : "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 950,
              fontSize: 14,
              cursor: printSelected.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            인쇄 ({printSelected.length}건)
          </button>
        </div>

        {/* 필터 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c7d6e3", fontSize: 13, fontWeight: 800 }}
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.month_label} - {b.upload_date} ({b.file_name})
              </option>
            ))}
          </select>

          <select
            value={filterReason}
            onChange={(e) => setFilterReason(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c7d6e3", fontSize: 13, fontWeight: 800 }}
          >
            <option value="all">전체 사유</option>
            {reasonOptions.filter((r) => r !== "all").map((r) => (
              <option key={r} value={r}>{REASON_CODE_LABELS[r] ?? r}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "reason" | "store" | "truck")}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #c7d6e3", fontSize: 13, fontWeight: 800 }}
          >
            <option value="reason">정렬: 사유→점포명→호차</option>
            <option value="store">정렬: 점포명→호차</option>
            <option value="truck">정렬: 호차→순번</option>
          </select>

          <button
            onClick={toggleAll}
            style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #c7d6e3", background: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
          >
            {selectedIds.size === filtered.length ? "전체 해제" : "전체 선택"}
          </button>
        </div>

        {/* 목록 */}
        {loading ? (
          <div style={{ color: "#6b7280", padding: 20 }}>불러오는 중...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #c7d6e3", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f0f4f8" }}>
                  <th style={{ padding: "10px", width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {["접수번호", "사유", "납품일", "호차-순번", "점포코드", "점포명", "상품수", "회수여부", "바코드"].map((h) => (
                    <th key={h} style={{ padding: "10px 8px", textAlign: "left", fontWeight: 900, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => {
                      const next = new Set(selectedIds);
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                      setSelectedIds(next);
                    }}
                    style={{ borderBottom: "1px solid #f0f4f8", cursor: "pointer", background: selectedIds.has(r.id) ? "#f0fdf4" : "#fff" }}
                  >
                    <td style={{ padding: "8px 10px" }}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => {}} />
                    </td>
                    <td style={{ padding: "8px" }}>{String(r.receipt_no).padStart(4, "0")}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ background: r.reason_code === "81" ? "#fee2e2" : r.reason_code === "82" ? "#fef3c7" : r.reason_code === "83" ? "#dbeafe" : "#f0fdf4", padding: "2px 8px", borderRadius: 4, fontWeight: 800, fontSize: 12 }}>
                        {REASON_CODE_LABELS[r.reason_code] ?? r.reason_name}
                      </span>
                    </td>
                    <td style={{ padding: "8px" }}>{r.delivery_date}</td>
                    <td style={{ padding: "8px" }}>{r.truck_no}-{r.seq_no}</td>
                    <td style={{ padding: "8px" }}>{r.store_code}</td>
                    <td style={{ padding: "8px", fontWeight: 800 }}>{r.store_name}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{r.item_count}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ color: r.is_returned ? "#059669" : "#d97706", fontWeight: 800, fontSize: 12 }}>
                        {r.is_returned ? "회수완료" : "미회수"}
                      </span>
                    </td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{r.barcode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px", color: "#9ca3af", fontSize: 14 }}>데이터가 없습니다</div>
            )}
          </div>
        )}
      </div>

      {/* 인쇄용 영역 */}
      <div id="print-root" style={{ display: "none" }}>
        {printSelected.map((receipt) => (
          <div key={receipt.id} style={{ pageBreakAfter: "always", padding: "2mm" }}>
            {/* 1페이지에 점포용 + 센터용 2장 출력 */}
            <div style={{ marginBottom: "4mm" }}>
              <ReceiptCard receipt={receipt} copy="점포용" />
            </div>
            <div style={{ borderTop: "1px dashed #aaa", paddingTop: "4mm" }}>
              <ReceiptCard receipt={receipt} copy="센터용" />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }
          @page { size: A4 portrait; margin: 8mm; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
