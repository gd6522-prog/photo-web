// 루트("/")는 middleware.ts에서 서버사이드 리다이렉트 처리됩니다.
// 쿠키가 없으면 /login, 있으면 /admin으로 즉시 이동하므로
// 이 페이지가 실제로 렌더링될 일은 없습니다.
export default function Home() {
  return null;
}