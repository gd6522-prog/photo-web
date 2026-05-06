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

  /**
   * 게이트 개방 명령. /api/xp_sendgate.php 호출.
   * - 입구 GATE01 / 출구 GATE31 (현장 셋업에 따라 다를 수 있음)
   * - 응답 본문이 "OK" 이면 성공, 그 외 텍스트는 에러 메시지로 취급.
   */
  async openGate(gateid: string, command: "OPEN" | "OPENLOCK" | "CLOSE" = "OPEN"): Promise<SregistResult> {
    try {
      const { baseUrl } = getEnv();
      if (!this.sessionCookie) await this.login();

      const buildBody = () =>
        new URLSearchParams({ gateid, command }).toString();

      const callOnce = async () =>
        fetch(`${baseUrl}/api/xp_sendgate.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `PHPSESSID=${this.sessionCookie}`,
          },
          body: buildBody(),
        });

      let res = await callOnce();
      let text = await res.text();

      const sessionExpired =
        res.status === 401 || res.status === 302 || (res.status === 200 && looksLikeLoginPage(text));

      if (sessionExpired) {
        this.sessionCookie = null;
        await this.login();
        res = await callOnce();
        text = await res.text();
      }

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}`, raw: text.slice(0, 500) };
      }
      const trimmed = text.trim();
      if (trimmed !== "OK") {
        return { success: false, error: trimmed.slice(0, 200) || "응답이 OK 가 아님", raw: text.slice(0, 500) };
      }

      return { success: true, raw: trimmed };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
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

  /**
   * 등록된 차량을 sn 단위로 삭제 (POST /api/xp_delticket.php).
   * 응답이 "OK" 이면 성공.
   */
  async deleteVehicle(sn: string): Promise<SregistResult> {
    try {
      const { baseUrl } = getEnv();
      if (!this.sessionCookie) await this.login();

      const callOnce = async () =>
        fetch(`${baseUrl}/api/xp_delticket.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `PHPSESSID=${this.sessionCookie}`,
          },
          body: new URLSearchParams({ sn }).toString(),
        });

      let res = await callOnce();
      let text = await res.text();
      const sessionExpired =
        res.status === 401 || res.status === 302 || (res.status === 200 && looksLikeLoginPage(text));
      if (sessionExpired) {
        this.sessionCookie = null;
        await this.login();
        res = await callOnce();
        text = await res.text();
      }

      if (!res.ok) return { success: false, error: `HTTP ${res.status}`, raw: text.slice(0, 500) };
      const trimmed = text.trim();
      if (trimmed !== "OK") {
        return { success: false, error: trimmed.slice(0, 200) || "응답이 OK 가 아님", raw: text.slice(0, 500) };
      }
      return { success: true, raw: trimmed };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * 입출차 내역 조회 (POST /api/searchinoutlist.php).
   * - corp_sn=2 (현장 셋업 값. 필요시 SREGIST_CORP_SN 으로 오버라이드)
   * - 응답 형식: "<tr> rows ####totalPages####totalCount" 또는 "NODATA"
   * - row: <tr><td>vNo</td><td>vType</td><td>inTime</td><td>outTime</td></tr>
   *   vType 예: 등록차량 / 영업차량 / 배송차량
   *   outTime 이 빈 문자열이면 아직 출차 안 됨.
   */
  async searchInoutHistory(params: {
    startdate: string; // YYYY-MM-DD
    enddate: string;
    vehicle?: string;
    page?: number;
  }): Promise<{
    success: true;
    items: Array<{ vNo: string; vType: string; inTime: string; outTime: string }>;
    totalPages: number;
    totalCount: number;
  } | { success: false; error: string }> {
    try {
      const { baseUrl } = getEnv();
      if (!this.sessionCookie) await this.login();

      const corpSn = process.env.SREGIST_CORP_SN || "2";
      const callOnce = async () =>
        fetch(`${baseUrl}/api/searchinoutlist.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `PHPSESSID=${this.sessionCookie}`,
          },
          body: new URLSearchParams({
            corp_sn: corpSn,
            startdate: params.startdate,
            enddate: params.enddate,
            vehicle: params.vehicle ?? "",
            p: String(params.page ?? 1),
          }).toString(),
        });

      let res = await callOnce();
      let text = await res.text();
      const sessionExpired =
        res.status === 401 || res.status === 302 || (res.status === 200 && looksLikeLoginPage(text));
      if (sessionExpired) {
        this.sessionCookie = null;
        await this.login();
        res = await callOnce();
        text = await res.text();
      }
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

      const trimmed = text.trim();
      if (trimmed === "NODATA" || trimmed === "") {
        return { success: true, items: [], totalPages: 0, totalCount: 0 };
      }

      const parts = trimmed.split("####");
      const rowsHtml = parts[0] ?? "";
      const totalPages = Number((parts[1] ?? "0").trim()) || 0;
      const totalCount = Number((parts[2] ?? "0").trim().replace(/,/g, "")) || 0;

      const items: Array<{ vNo: string; vType: string; inTime: string; outTime: string }> = [];
      const rowRe = /<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/g;
      for (const m of rowsHtml.matchAll(rowRe)) {
        items.push({
          vNo: m[1].trim(),
          vType: m[2].trim(),
          inTime: m[3].trim(),
          outTime: m[4].trim(),
        });
      }

      return { success: true, items, totalPages, totalCount };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * 등록된 모든 차량 목록을 수집한다.
   * sregist 의 검색 API(/api/getsearch_regist.php)는 carnum 부분일치 검색만 지원하고
   * "전체 조회" 모드가 노출돼 있지 않으므로, 차량번호에 흔히 들어가는 "00"~"99" 두 자리
   * 숫자 100가지로 부분일치 검색을 병렬 발사 → setdata(...) 패턴 파싱 → sn 기준 dedupe.
   */
  async listAllVehicles(): Promise<Array<{ sn: string; vNo: string; sdate: string; edate: string; corp: string; dept: string; memo: string }>> {
    const { baseUrl } = getEnv();
    if (!this.sessionCookie) await this.login();

    const queries = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
    const re = /setdata\("([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"\)/g;
    const map = new Map<string, { sn: string; vNo: string; sdate: string; edate: string; corp: string; dept: string; memo: string }>();

    // 한 번에 10개씩 병렬 호출
    for (let i = 0; i < queries.length; i += 10) {
      const batch = queries.slice(i, i + 10);
      const results = await Promise.all(
        batch.map((carnum) =>
          fetch(`${baseUrl}/api/getsearch_regist.php`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Cookie: `PHPSESSID=${this.sessionCookie}`,
            },
            body: new URLSearchParams({ carnum, sn: "" }).toString(),
          })
            .then((r) => r.text())
            .catch(() => "")
        )
      );
      for (const text of results) {
        for (const m of text.matchAll(re)) {
          const [, sn, vNo, sdate, edate, corp, dept, memo] = m;
          if (!map.has(sn)) map.set(sn, { sn, vNo, sdate, edate, corp, dept, memo });
        }
      }
    }
    return Array.from(map.values());
  }
}

// 모듈 싱글턴
export const sregist = new SregistClient();
