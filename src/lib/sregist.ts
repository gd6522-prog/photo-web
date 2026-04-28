/**
 * sregist (외부 주차관제 시스템) HTTP 클라이언트.
 *
 * - PHP 세션 기반: POST /api/xp_login.php → Set-Cookie: PHPSESSID=...
 * - 차량 등록: POST /api/xp_ticket.php (Cookie: PHPSESSID=...)
 *
 * Vercel serverless에서는 모듈 인스턴스가 함수 컨테이너 단위로 살아있으므로
 * PHPSESSID는 컨테이너 안에서만 캐싱된다(인스턴스 간 공유 불가). 세션 만료/재시작 시
 * 자동 재로그인.
 */

export interface SregistVehicle {
  carNumber: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  company?: string; // sregist 'corp' 필드
  dept?: string;    // sregist 'dept' 필드 (현재 신청자 이름 매핑에 사용)
  memo?: string;    // sregist 'memo' 필드 (현재 신청자 연락처 매핑에 사용)
}

export type SregistResult =
  | { success: true; raw: string }
  | { success: false; error: string; raw?: string };

function getEnv() {
  const baseUrl = process.env.SREGIST_BASE_URL;
  const userId = process.env.SREGIST_USER_ID;
  const password = process.env.SREGIST_PASSWORD;
  if (!baseUrl) throw new Error("SREGIST_BASE_URL 미설정");
  if (!userId) throw new Error("SREGIST_USER_ID 미설정");
  if (!password) throw new Error("SREGIST_PASSWORD 미설정");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), userId, password };
}

// 응답 본문이 로그인 폼/세션 만료를 가리키는지 휴리스틱 체크.
function looksLikeLoginPage(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("xp_login") ||
    /<form[^>]*login/i.test(text) ||
    t.includes('name="user_id"') ||
    t.includes("로그인이 필요") ||
    t.includes("session expired")
  );
}

class SregistClient {
  private sessionCookie: string | null = null;
  private loginInflight: Promise<string> | null = null;

  private async login(): Promise<string> {
    // 동시 호출 방지 (같은 인스턴스 내)
    if (this.loginInflight) return this.loginInflight;

    this.loginInflight = (async () => {
      const { baseUrl, userId, password } = getEnv();
      const body = new URLSearchParams({
        mode: "login",
        user_id: userId,
        pwd: password,
      });

      const res = await fetch(`${baseUrl}/api/xp_login.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        // 302도 직접 보고 싶으므로 follow는 기본값 그대로 둠.
      });

      // Set-Cookie는 헤더 한 줄이거나 여러 줄일 수 있음. node fetch는 한 줄로 합치는 경향.
      const setCookie = res.headers.get("set-cookie") ?? "";
      const m = setCookie.match(/PHPSESSID=([^;,\s]+)/i);
      if (!m) {
        // 일부 환경에서는 raw header가 안 보일 수 있어, 응답 본문에서 힌트 확인용으로 일부 캡처.
        const text = await res.text().catch(() => "");
        throw new Error(
          `sregist 로그인 실패: PHPSESSID 미수신 (HTTP ${res.status}, body 일부: ${text.slice(0, 120)})`
        );
      }

      this.sessionCookie = m[1];
      return this.sessionCookie;
    })();

    try {
      return await this.loginInflight;
    } finally {
      this.loginInflight = null;
    }
  }

  /** 세션이 살아있는지 가벼운 호출. (로그인만 시도) */
  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      // 강제로 로그인 새로 시도(헬스체크 의도)
      this.sessionCookie = null;
      await this.login();
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async registerVehicle(vehicle: SregistVehicle): Promise<SregistResult> {
    try {
      const { baseUrl } = getEnv();
      if (!this.sessionCookie) await this.login();

      const buildBody = () =>
        new URLSearchParams({
          sn: "0",
          vNo: vehicle.carNumber,
          sdate: vehicle.startDate,
          edate: vehicle.endDate,
          corp: vehicle.company ?? "",
          dept: vehicle.dept ?? "",
          memo: vehicle.memo ?? "",
        }).toString();

      const callOnce = async () =>
        fetch(`${baseUrl}/api/xp_ticket.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `PHPSESSID=${this.sessionCookie}`,
          },
          body: buildBody(),
        });

      let res = await callOnce();
      let text = await res.text();

      // 세션 만료 의심 시 1회 재로그인 후 재시도
      const sessionExpired =
        res.status === 401 || res.status === 302 || (res.status === 200 && looksLikeLoginPage(text));

      if (sessionExpired) {
        this.sessionCookie = null;
        await this.login();
        res = await callOnce();
        text = await res.text();
      }

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}`, raw: text.slice(0, 2000) };
      }
      if (looksLikeLoginPage(text)) {
        return { success: false, error: "세션 만료 후 재로그인했지만 등록 응답에 로그인 페이지가 반환됨", raw: text.slice(0, 2000) };
      }

      return { success: true, raw: text.slice(0, 2000) };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// 모듈 싱글턴
export const sregist = new SregistClient();
