import Link from "next/link";

export default function ParkingHome() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
        gap: 32,
      }}
    >
      <div style={{ textAlign: "center" }}>
        {/*
          PNG 캔버스 1205x245 인데 컨텐츠가 x=188~1204 에 있어 자연스럽게 가운데가 어긋난다.
          wrapper 로 visible 영역을 컨텐츠 1017px 만큼만 잡고, 그 안에서 이미지를 1205/1017=118.49%
          크기로 띄운 뒤 -188/1017=-18.49% 만큼 좌측으로 당겨 컨텐츠를 정확히 가운데 정렬.
        */}
        <div
          style={{
            display: "inline-block",
            width: 260,
            maxWidth: "78vw",
            overflow: "hidden",
            lineHeight: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hanex-logo.png"
            alt="한익스프레스"
            style={{ width: "118.49%", marginLeft: "-18.49%", height: "auto", display: "block" }}
          />
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 17,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: 2,
          }}
        >
          화성센터
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Link
          href="/parking/regular"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 96,
            borderRadius: 16,
            background: "linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 22,
            textDecoration: "none",
            boxShadow: "0 14px 30px rgba(15,118,110,0.35)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          정기 신청
        </Link>

        <Link
          href="/parking/visitor"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 96,
            borderRadius: 16,
            background: "linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 22,
            textDecoration: "none",
            boxShadow: "0 14px 30px rgba(30,58,138,0.40)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          방문 신청
        </Link>
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "#64748b",
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        신청 후 관리자 승인이 필요합니다.
        <br />
        결과는 추후 안내됩니다.
      </div>
    </div>
  );
}
