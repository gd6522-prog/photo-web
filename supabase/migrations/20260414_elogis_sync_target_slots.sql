-- elogis_sync_log 에 target_slots 컬럼 추가
-- null = 전체 파일, ['product-master'] = 해당 슬롯만 처리
ALTER TABLE elogis_sync_log
  ADD COLUMN IF NOT EXISTS target_slots text[];
