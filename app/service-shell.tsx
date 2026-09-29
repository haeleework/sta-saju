"use client";

import { useState } from "react";
import LoginTestPanel from "./login-test-panel";
import ServiceHome, { type ServiceView } from "./service-home";

export default function ServiceShell({ authTestMode }: { authTestMode: boolean }) {
  const [view, setView] = useState<ServiceView>("home");

  return (
    <LoginTestPanel authTestMode={authTestMode} onHome={() => setView("home")}>
      <ServiceHome readingDisabled={authTestMode} view={view} onViewChange={setView} />
      <footer className="site-footer">
        <span>나의 결 · AI 해석 베타</span>
        <span>{authTestMode ? "로그인 시험 중에는 Gemini 해석 요청을 보내지 않습니다." : "해석 결과를 나중에 다시 보려면 계정에 저장해 주세요."}</span>
      </footer>
    </LoginTestPanel>
  );
}
