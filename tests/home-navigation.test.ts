import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthView } from "../app/login-test-panel";
import ServiceHome from "../app/service-home";

const authProps = {
  email: "reader@example.com",
  notice: "",
  busy: false,
  authTestMode: false,
  onSignIn: () => {},
  onSignOut: () => {},
  onHome: () => {},
  children: createElement("div", { id: "private-content" }, "비공개 콘텐츠"),
};

test("로그인 중인 상단 브랜드는 홈 이동 버튼이고 비로그인 화면에는 버튼이 아니다", () => {
  const signedIn = renderToStaticMarkup(createElement(AuthView, { ...authProps, state: "signed-in" }));
  const signedOut = renderToStaticMarkup(createElement(AuthView, { ...authProps, state: "signed-out" }));

  assert.match(signedIn, /<button[^>]*class="brand brand-home"[^>]*aria-label="나의 결 홈으로"[^>]*>나의 결<\/button>/);
  assert.match(signedIn, /id="private-content"/);
  assert.doesNotMatch(signedOut, /brand-home|id="private-content"/);
  assert.match(signedOut, /Google로 로그인/);
});

test("서비스 내부의 홈 버튼은 선택 화면으로 전환하고 두 서비스 화면 모두에 표시된다", () => {
  const onViewChange = () => {};
  const home = renderToStaticMarkup(createElement(ServiceHome, { readingDisabled: false, view: "home", onViewChange }));
  const daily = renderToStaticMarkup(createElement(ServiceHome, { readingDisabled: false, view: "daily", onViewChange }));
  const saju = renderToStaticMarkup(createElement(ServiceHome, { readingDisabled: false, view: "saju", onViewChange }));
  const source = readFileSync(new URL("../app/service-home.tsx", import.meta.url), "utf8");

  assert.match(home, /오늘의 운세 보기[\s\S]*사주 보기/);
  assert.doesNotMatch(home, /← 홈으로/);
  assert.match(daily, /← 홈으로/);
  assert.match(saju, /← 홈으로/);
  assert.doesNotMatch(`${daily}${saju}`, /← 선택 화면/);
  assert.match(source, /onClick=\{\(\) => onViewChange\("home"\)\}>← 홈으로/);
});

test("상단 브랜드와 서비스 선택 화면이 같은 홈 상태를 사용한다", () => {
  const shell = readFileSync(new URL("../app/service-shell.tsx", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../app/login-test-panel.tsx", import.meta.url), "utf8");

  assert.match(shell, /useState<ServiceView>\("home"\)/);
  assert.match(shell, /<LoginTestPanel[^>]*onHome=\{\(\) => setView\("home"\)\}/);
  assert.match(shell, /<ServiceHome[^>]*view=\{view\} onViewChange=\{setView\}/);
  assert.match(auth, /<button className="brand brand-home" type="button" onClick=\{onHome\}/);
});
