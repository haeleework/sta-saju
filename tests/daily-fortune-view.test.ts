import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthView } from "../app/login-test-panel";
import ServiceHome from "../app/service-home";
import DailyFortunePanel from "../app/daily-fortune-panel";

const home = createElement(ServiceHome, { readingDisabled: false });
const authProps = {
  email: "reader@example.com",
  notice: "",
  busy: false,
  authTestMode: false,
  onSignIn: () => {},
  onSignOut: () => {},
  children: home,
};

test("로그인한 첫 화면은 오늘의 운세와 사주 보기 두 선택지를 보여준다", () => {
  const html = renderToStaticMarkup(createElement(AuthView, { ...authProps, state: "signed-in" }));

  assert.match(html, /reader@example\.com/);
  assert.match(html, /class="service-choices"[\s\S]*오늘의 운세 보기[\s\S]*사주 보기/);
  assert.doesNotMatch(html, /id="daily-date"|id="date"|내 사주 정보를 먼저 입력해주세요!/);
});

test("로그아웃하면 서비스 선택 화면 자체가 렌더되지 않는다", () => {
  const html = renderToStaticMarkup(createElement(AuthView, { ...authProps, state: "signed-out" }));

  assert.match(html, /Google로 로그인/);
  assert.doesNotMatch(html, /class="service-choices"|오늘의 운세 보기|사주 보기/);
});

test("오늘의 운세 화면은 프로필 조회 중 안내를 렌더하고 등록 팝업은 결과 확인 뒤 표시한다", () => {
  const html = renderToStaticMarkup(createElement(DailyFortunePanel));
  const source = readFileSync(new URL("../app/daily-fortune-panel.tsx", import.meta.url), "utf8");

  assert.match(html, /id="daily-title"[\s\S]*내 사주 정보를 확인하는 중입니다/);
  assert.doesNotMatch(html, /role="dialog"|id="daily-date"|오늘의 운세 확인하기/);
  assert.match(source, /if \(!item\) setShowDialog\(true\)/);
  assert.match(source, /showDialog && !loading && \([\s\S]*role="dialog" aria-modal="true"[\s\S]*내 사주 정보를 먼저 입력해주세요!/);
  assert.match(source, /직접 입력[\s\S]*저장된 사주 결과에서 가져오기[\s\S]*닫기/);
});

test("직접 입력 화면에는 양력 날짜·시간·성별 필수 정보와 계정 저장 안내가 있다", () => {
  const source = readFileSync(new URL("../app/daily-fortune-panel.tsx", import.meta.url), "utf8");

  assert.match(source, /formOpen && !loading && \([\s\S]*<form[\s\S]*id="daily-date" type="date"[^>]*required/);
  assert.match(source, /id="daily-time" type="time"[^>]*required/);
  assert.match(source, /id="daily-gender"[\s\S]*여성[\s\S]*남성/);
  assert.match(source, /<label htmlFor="daily-gender">성별<\/label>/);
  assert.doesNotMatch(source, /대운 계산 기준 성별/);
  assert.match(source, /계정 DB에 보관하며, 언제든 수정·삭제할 수 있습니다/);
  assert.match(source, /내 사주로 저장하기/);
});

test("저장 결과 가져오기는 계정 저장 목록을 읽고 직접 입력 전환을 제공한다", () => {
  const source = readFileSync(new URL("../app/daily-fortune-panel.tsx", import.meta.url), "utf8");

  assert.match(source, /loadAccountReadings\(createClient\(\)\)/);
  assert.match(source, /<select id="daily-saved"[\s\S]*required>/);
  assert.match(source, /saved\.map\(/);
  assert.match(source, /직접 입력으로 바꾸기/);
  assert.match(source, /sourceReadingId: mode === "saved" \? Number\(selectedId\) : null/);
});

test("생성 중 상태는 요청한 대기 문구를 보여주고 자동으로 상태를 다시 확인한다", () => {
  const source = readFileSync(new URL("../app/daily-fortune-panel.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(status === "processing"\) return "오늘의 운세를 가져오는 중이에요\. 순서대로 준비 중이니 잠시만 기다려 주세요\.";/);
  assert.match(source, /fortune\?\.status !== "processing" && fortune\?\.status !== "pending"/);
  assert.match(source, /window\.setInterval\(\(\) => \{ void refreshFortune\(\); \}, 5000\)/);
  assert.match(source, /className="daily-status" role="status"[\s\S]*statusText\(fortune\?\.status \?\? "pending"\)/);
});

test("생성 실패 상태는 요청한 실패 문구를 보여주고 준비된 결과처럼 표시하지 않는다", () => {
  const source = readFileSync(new URL("../app/daily-fortune-panel.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(status === "failed"\) return "오늘의 운세를 준비하는 데 문제가 생겼어요\. 잠시 후 다시 확인해 주세요\.";/);
  assert.match(source, /fortune\?\.status === "ready" && fortune\.fortune \? \([\s\S]*오늘의 운세 확인하기[\s\S]*\) : \([\s\S]*className="daily-status" role="status"/);
});
