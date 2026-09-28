import SajuForm from "./saju-form";
import LoginTestPanel from "./login-test-panel";

export default function Page() {
  const authTestMode = process.env.AUTH_TEST_MODE === "true";
  return (
    <main className="site-shell">
      <LoginTestPanel authTestMode={authTestMode}>
        <header className="page-header">
          <span className="eyebrow">나를 알아가는 첫 번째 페이지</span>
          <h1>
            사주를 계산하고,
            <br />
            궁금한 방향을 골라보세요.
          </h1>
          <p className="intro">
            생년월일과 출생시간으로 기본 사주를 확인하고, AI 해석을 읽은 뒤 더
            살펴보고 싶은 주제를 선택해 보세요.
          </p>
          <p className="prototype-note">
            해석은 참고와 자기 성찰을 위한 내용입니다. 미래를 확정하거나 중요한
            결정을 대신하지 않습니다.
          </p>
        </header>
        <SajuForm readingDisabled={authTestMode} />
        <footer className="site-footer">
          <span>나의 결 · AI 해석 베타</span>
          <span>{authTestMode ? "로그인 시험 중에는 Gemini 해석 요청을 보내지 않습니다." : "성공한 해석은 이 브라우저에 남고, 선택한 현재 결과만 계정에 따로 저장할 수 있습니다."}</span>
        </footer>
      </LoginTestPanel>
    </main>
  );
}
