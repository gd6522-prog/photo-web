/**
 * 솔라피 카카오 알림톡 발송 클라이언트.
 * - 인증: HMAC-SHA256 (date + salt 기반)
 * - 엔드포인트: POST https://api.solapi.com/messages/v4/send
 * - 메시지 type: ATA (알림톡)
 */

import crypto from "crypto";

export type SendAlimtalkParams = {
  to: string;                          // 수신자 전화번호 (포맷 자유, 자동 정규화)
  templateId: string;                  // 등록된 알림톡 템플릿 ID
  variables: Record<string, string>;   // 템플릿 변수 (key 는 "#{이름}" 같은 변수 표기 그대로)
};

export type SolapiResult =
  | { success: true; raw: string }
  | { success: false; error: string; raw?: string };

function getEnv() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.SOLAPI_PFID;
  const from = process.env.SOLAPI_CONTACT_PHONE;
  if (!apiKey || !apiSecret || !pfId || !from) {
    throw new Error("SOLAPI 환경변수 미설정 (API_KEY/API_SECRET/PFID/CONTACT_PHONE)");
  }
  return { apiKey, apiSecret, pfId, from };
}

function normalizePhone(p: string): string {
  return String(p ?? "").replace(/\D/g, "");
}

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 ApiKey=${apiKey}, Date=${date}, Salt=${salt}, Signature=${signature}`;
}

export async function sendAlimtalk(params: SendAlimtalkParams): Promise<SolapiResult> {
  try {
    const { apiKey, apiSecret, pfId, from } = getEnv();
    const to = normalizePhone(params.to);
    if (to.length < 10) return { success: false, error: "수신번호 형식 오류" };

    const body = {
      message: {
        to,
        from: normalizePhone(from),
        type: "ATA",
        kakaoOptions: {
          pfId,
          templateId: params.templateId,
          variables: params.variables,
        },
      },
    };

    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(apiKey, apiSecret),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}`, raw: text.slice(0, 1000) };
    }
    // solapi 는 200 응답이라도 본문에 statusCode 가 들어 있을 수 있음 (내부 오류 케이스)
    try {
      const json = JSON.parse(text) as { statusCode?: string; statusMessage?: string };
      if (json.statusCode && !/^[12]\d{3}$/.test(json.statusCode)) {
        return { success: false, error: json.statusMessage || json.statusCode, raw: text.slice(0, 1000) };
      }
    } catch {
      // 본문이 JSON 아니면 그냥 통과
    }
    return { success: true, raw: text.slice(0, 1000) };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 입차신청 승인 완료 알림톡 */
export async function sendApprovalAlimtalk(params: {
  to: string;
  name: string;
  carNumber: string;
  type: "regular" | "visitor";
  expireDate: string | null;
}): Promise<SolapiResult> {
  const templateId = process.env.SOLAPI_TEMPLATE_APPROVED;
  if (!templateId) return { success: false, error: "SOLAPI_TEMPLATE_APPROVED 미설정" };

  const contactPhone = process.env.SOLAPI_CONTACT_PHONE ?? "";

  // 만료일 표기: 정기는 "별도 안내 시까지" (2999-12-31 그대로 보내면 어색)
  let expireText = params.expireDate ?? "";
  if (params.type === "regular" || expireText === "2999-12-31") {
    expireText = "별도 안내 시까지";
  }

  return sendAlimtalk({
    to: params.to,
    templateId,
    variables: {
      "#{name}": params.name,
      "#{carNumber}": params.carNumber,
      "#{type}": params.type === "regular" ? "정기" : "방문",
      "#{expireDate}": expireText,
      "#{contactPhone}": contactPhone,
    },
  });
}

/** 입차신청 처리결과 (거절) 알림톡 */
export async function sendRejectionAlimtalk(params: {
  to: string;
  name: string;
  carNumber: string;
  reason: string;
}): Promise<SolapiResult> {
  const templateId = process.env.SOLAPI_TEMPLATE_REJECTED;
  if (!templateId) return { success: false, error: "SOLAPI_TEMPLATE_REJECTED 미설정" };

  const contactPhone = process.env.SOLAPI_CONTACT_PHONE ?? "";

  return sendAlimtalk({
    to: params.to,
    templateId,
    variables: {
      "#{name}": params.name,
      "#{carNumber}": params.carNumber,
      "#{reason}": params.reason,
      "#{contactPhone}": contactPhone,
    },
  });
}
