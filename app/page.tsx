import LoginTestPanel from "./login-test-panel";
import ServiceHome from "./service-home";

export default function Page() {
  const authTestMode = process.env.AUTH_TEST_MODE === "true";
  return (
    <main className="site-shell">
      <LoginTestPanel authTestMode={authTestMode}>
        <ServiceHome readingDisabled={authTestMode} />
        <footer className="site-footer">
          <span>나의 결 · AI 해석 베타</span>
          <span>{authTestMode ? "로그인 시험 중에는 Gemini 해석 요청을 보내지 않습니다." : "성공한 해석은 이 브라우저에 남고, 선택한 현재 결과만 계정에 따로 저장할 수 있습니다."}</span>
        </footer>
      </LoginTestPanel>
    </main>
  );
}
