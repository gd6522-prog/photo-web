-- sort_key별 카운트를 단일 쿼리로 반환 (3개 COUNT → 1개 GROUP BY)
CREATE OR REPLACE FUNCTION public.get_hazard_summary()
RETURNS TABLE(sort_key smallint, cnt bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT sort_key, COUNT(*)::bigint AS cnt
  FROM public.hazard_reports
  GROUP BY sort_key;
$$;
