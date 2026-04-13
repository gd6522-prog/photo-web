-- 위험요인 목록 정렬 규칙:
--   미처리(sort_key=0), 처리대기(sort_key=1) → 제보순서(created_at ASC)
--   처리완료(sort_key=2) → 개선시간순서(improved_at ASC)
CREATE OR REPLACE FUNCTION public.get_hazard_page_sorted(p_from int, p_to int)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  comment text,
  photo_path text,
  photo_url text,
  created_at timestamptz,
  sort_key smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    hr.id,
    hr.user_id,
    hr.comment,
    hr.photo_path,
    hr.photo_url,
    hr.created_at,
    hr.sort_key
  FROM public.hazard_reports hr
  LEFT JOIN public.hazard_report_resolutions r ON r.report_id = hr.id
  ORDER BY
    hr.sort_key ASC,
    CASE WHEN hr.sort_key < 2 THEN hr.created_at ELSE NULL END ASC NULLS LAST,
    CASE WHEN hr.sort_key = 2  THEN r.improved_at ELSE NULL END ASC NULLS LAST
  LIMIT (p_to - p_from + 1) OFFSET p_from
$$;
