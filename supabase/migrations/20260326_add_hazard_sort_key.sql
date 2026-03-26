-- hazard_reports 에 sort_key 컬럼 추가
-- sort_key: 0=미처리(open), 1=처리대기(pending), 2=처리완료(done)
-- hazard_report_resolutions 변경 시 트리거가 자동으로 동기화합니다.

-- 1. 컬럼 추가
ALTER TABLE public.hazard_reports
  ADD COLUMN IF NOT EXISTS sort_key smallint NOT NULL DEFAULT 0;

-- 2. 정렬용 복합 인덱스 (sort_key ASC, created_at DESC)
CREATE INDEX IF NOT EXISTS hazard_reports_sort_idx
  ON public.hazard_reports (sort_key ASC, created_at DESC);

-- 3. sort_key 계산 함수
CREATE OR REPLACE FUNCTION public.compute_hazard_sort_key(
  p_after_public_url text,
  p_planned_due_date date
) RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_after_public_url IS NOT NULL THEN 2
    WHEN p_planned_due_date IS NOT NULL  THEN 1
    ELSE 0
  END::smallint;
$$;

-- 4. resolution INSERT/UPDATE/DELETE 시 hazard_reports.sort_key 동기화 트리거 함수
CREATE OR REPLACE FUNCTION public.trg_sync_hazard_sort_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.hazard_reports
    SET sort_key = 0
    WHERE id = OLD.report_id;
    RETURN OLD;
  ELSE
    UPDATE public.hazard_reports
    SET sort_key = public.compute_hazard_sort_key(
      NEW.after_public_url,
      NEW.planned_due_date
    )
    WHERE id = NEW.report_id;
    RETURN NEW;
  END IF;
END;
$$;

-- 5. 트리거 연결
DROP TRIGGER IF EXISTS trg_hazard_resolution_sort_key ON public.hazard_report_resolutions;
CREATE TRIGGER trg_hazard_resolution_sort_key
  AFTER INSERT OR UPDATE OR DELETE ON public.hazard_report_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_hazard_sort_key();

-- 6. 기존 데이터 백필
UPDATE public.hazard_reports r
SET sort_key = public.compute_hazard_sort_key(
  res.after_public_url,
  res.planned_due_date
)
FROM public.hazard_report_resolutions res
WHERE res.report_id = r.id;
-- (resolution 없는 row는 DEFAULT 0 그대로)
