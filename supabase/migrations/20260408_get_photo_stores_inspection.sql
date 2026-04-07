-- 검수점포(is_inspection=true)는 사진 없어도 항상 표시
-- 일반 점포는 사진 올렸을 때만 표시
CREATE OR REPLACE FUNCTION get_photo_stores(
  p_start_utc timestamptz,
  p_end_utc   timestamptz,
  p_work_part text DEFAULT 'ALL'
)
RETURNS TABLE (
  store_code  text,
  store_name  text,
  car_no      integer,
  seq_no      integer,
  photo_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH photo_stores AS (
    SELECT
      sm.store_code,
      COUNT(p.id) AS photo_count
    FROM photos p
    JOIN profiles pr ON pr.id = p.user_id
    JOIN store_map sm ON sm.store_code = p.store_code
    WHERE p.created_at >= p_start_utc
      AND p.created_at <  p_end_utc
      AND COALESCE(TRIM(pr.work_part), '') <> '배송'
      AND (p_work_part = 'ALL' OR TRIM(pr.work_part) = p_work_part)
    GROUP BY sm.store_code
  )
  SELECT
    sm.store_code,
    sm.store_name,
    sm.car_no,
    sm.seq_no,
    COALESCE(ps.photo_count, 0) AS photo_count
  FROM store_map sm
  LEFT JOIN photo_stores ps ON ps.store_code = sm.store_code
  WHERE sm.is_inspection = true
     OR ps.store_code IS NOT NULL
  ORDER BY
    COALESCE(sm.car_no, 999999),
    COALESCE(sm.seq_no, 999999),
    sm.store_code
$$;
