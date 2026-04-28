import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "한익스프레스 차량 입차신청",
  description: "한익스프레스 외부인 차량 입차신청",
};

export default function ParkingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(40rem 40rem at 0% 0%, rgba(15,118,110,0.18), transparent 60%)," +
          "radial-gradient(40rem 40rem at 100% 100%, rgba(22,78,109,0.22), transparent 60%)," +
          "linear-gradient(180deg, #0b1220 0%, #050a14 100%)",
        color: "#e6eef7",
        fontFamily:
          "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {children}
    </div>
  );
}
