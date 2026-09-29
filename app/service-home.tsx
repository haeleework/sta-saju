"use client";

import SajuForm from "./saju-form";
import DailyFortunePanel from "./daily-fortune-panel";

export type ServiceView = "home" | "daily" | "saju";

export default function ServiceHome({ readingDisabled, view, onViewChange }: { readingDisabled: boolean; view: ServiceView; onViewChange: (view: ServiceView) => void }) {
  return (
    <>
      {view !== "home" && <div className="service-nav"><button type="button" onClick={() => onViewChange("home")}>← 홈으로</button><button type="button" onClick={() => onViewChange(view === "daily" ? "saju" : "daily")}>{view === "daily" ? "사주 보기" : "오늘의 운세 보기"}</button></div>}
      {view === "home" && <section className="service-home"><p className="eyebrow">나의 결 · 서비스 선택</p><h1>오늘은 무엇을<br />살펴볼까요?</h1><p className="intro">매일의 흐름을 가볍게 보거나, 내 사주를 자세히 읽어보세요.</p><div className="service-choices"><button type="button" onClick={() => onViewChange("daily")}><span>01 · 매일의 힌트</span><strong>오늘의 운세 보기</strong><small>등록한 내 사주로 오늘의 흐름 확인</small><b>→</b></button><button type="button" onClick={() => onViewChange("saju")}><span>02 · 깊이 알아보기</span><strong>사주 보기</strong><small>생년월일시로 사주 구성과 해석 확인</small><b>→</b></button></div></section>}
      {view === "daily" && <DailyFortunePanel />}
      {view === "saju" && <><header className="page-header"><span className="eyebrow">나를 알아가는 첫 번째 페이지</span><h1>사주를 계산하고,<br />궁금한 방향을 골라보세요.</h1><p className="intro">생년월일과 출생시간으로 기본 사주를 확인하고, AI 해석을 읽은 뒤 더 살펴보고 싶은 주제를 선택해 보세요.</p><p className="prototype-note">해석은 참고와 자기 성찰을 위한 내용입니다. 미래를 확정하거나 중요한 결정을 대신하지 않습니다.</p></header><SajuForm readingDisabled={readingDisabled} /></>}
    </>
  );
}
