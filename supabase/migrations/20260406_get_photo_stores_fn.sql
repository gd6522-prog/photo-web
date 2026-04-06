-- 현장사진 점포 목록 조회 RPC
-- photos + profiles JOIN → 기사 제외, work_part 필터 → 점포 코드 distinct
-- store_map JOIN → 점포명, 호차, 순번 반환
-- 클라이언트로 raw rows 안 보내고 DB에서 집계

CREATE OR REPLACE FUNCTION get_photo_stores(
  p_start_utc timestamptz,
  p_end_utc   timestamptz,
  p_work_part text DEFAULT 'ALL'  -- 'ALL' or specific work_part
)
RETURNS TABLE (
  store_code text,
  store_name text,
  car_no     integer,
  seq_no     integer,
  photo_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    sm.store_code,
    sm.store_name,
    sm.car_no,
    sm.seq_no,
    COUNT(p.id) AS photo_count
  FROM photos p
  JOIN profiles pr ON pr.id = p.user_id
  JOIN store_map sm ON sm.store_code = p.store_code
  WHERE p.created_at >= p_start_utc
    AND p.created_at <  p_end_utc
    AND COALESCE(TRIM(pr.work_part), '') <> '배송'
    AND (p_work_part = 'ALL' OR TRIM(pr.work_part) = p_work_part)
  GROUP BY sm.store_code, sm.store_name, sm.car_no, sm.seq_no
  ORDER BY
    COALESCE(sm.car_no, 999999),
    COALESCE(sm.seq_no, 999999),
    sm.store_code
$$;
