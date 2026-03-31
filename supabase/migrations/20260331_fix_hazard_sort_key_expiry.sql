-- compute_hazard_sort_key: 만료된 planned_due_date는 미처리(0)로 처리
-- IMMUTABLE → STABLE (CURRENT_DATE 사용으로 변경)
CREATE OR REPLACE FUNCTION public.compute_hazard_sort_key(
  p_after_public_url text,
  p_planned_due_date date
) RETURNS smallint
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_after_public_url IS NOT NULL THEN 2
    WHEN p_planned_due_date IS NOT NULL AND p_planned_due_date >= CURRENT_DATE THEN 1
    ELSE 0
  END::smallint;
$$;

-- 만료된 처리대기 항목을 미처리(0)로 일괄 교정하는 함수 (API에서 호출)
CREATE OR REPLACE FUNCTION public.fix_expired_hazard_sort_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.hazard_reports hr
  SET sort_key = 0
  FROM public.hazard_report_resolutions res
  WHERE hr.id = res.report_id
    AND hr.sort_key = 1
    AND res.after_public_url IS NULL
    AND (res.planned_due_date IS NULL OR res.planned_due_date < CURRENT_DATE);
END;
$$;

-- 기존 데이터 중 만료된 항목 즉시 교정
SELECT public.fix_expired_hazard_sort_keys();
