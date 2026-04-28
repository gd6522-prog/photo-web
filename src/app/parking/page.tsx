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
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: -0.5,
            color: "#ffffff",
            lineHeight: 1.2,
          }}
        >
          한익스프레스
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 16,
            fontWeight: 700,
            color: "#9fb3c7",
          }}
        >
          차량 입차신청
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
