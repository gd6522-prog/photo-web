-- 인수증 관리 테이블

-- 업로드 배치
CREATE TABLE IF NOT EXISTS insu_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  month_label   TEXT NOT NULL,           -- "4월" 등
  file_name     TEXT,
  row_count     INTEGER DEFAULT 0,
  receipt_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id)
);

-- 인수증 헤더 (점포+호차+순번+사유 단위)
CREATE TABLE IF NOT EXISTS insu_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID REFERENCES insu_batches(id) ON DELETE CASCADE,
  receipt_no    INTEGER NOT NULL,        -- 접수순번
  barcode       TEXT NOT NULL UNIQUE,    -- 사유코드+yyyymmdd+점포코드
  delivery_date DATE NOT NULL,           -- 납품예정일
  truck_no      INTEGER NOT NULL,        -- 호차
  seq_no        INTEGER NOT NULL,        -- 순번
  store_code    TEXT NOT NULL,           -- 점포코드
  store_name    TEXT NOT NULL,           -- 점포명
  reason_code   TEXT NOT NULL,           -- 81=파손 82=오발주 83=재배송 84=맞교환 85=긴급출고
  reason_name   TEXT NOT NULL,           -- 사유명
  item_count    INTEGER DEFAULT 0,
  is_returned   BOOLEAN DEFAULT FALSE,
  returned_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 인수증 상품 라인
CREATE TABLE IF NOT EXISTS insu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    UUID REFERENCES insu_receipts(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL,        -- 순번
  product_code  TEXT NOT NULL,           -- 상품코드
  product_name  TEXT NOT NULL,           -- 상품명
  inner_qty     INTEGER DEFAULT 0,       -- 입수
  return_qty    INTEGER DEFAULT 0,       -- 회수수량 (미오출수량)
  box_qty       INTEGER DEFAULT 0,       -- 배수 (출고확정수량/입수)
  location      TEXT DEFAULT '',         -- 피킹셀
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_insu_receipts_batch    ON insu_receipts(batch_id);
CREATE INDEX IF NOT EXISTS idx_insu_receipts_barcode  ON insu_receipts(barcode);
CREATE INDEX IF NOT EXISTS idx_insu_receipts_store    ON insu_receipts(store_code);
CREATE INDEX IF NOT EXISTS idx_insu_receipts_returned ON insu_receipts(is_returned);
CREATE INDEX IF NOT EXISTS idx_insu_items_receipt     ON insu_items(receipt_id);

-- RLS
ALTER TABLE insu_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insu_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE insu_items    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can manage insu_batches"
  ON insu_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth users can manage insu_receipts"
  ON insu_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth users can manage insu_items"
  ON insu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
