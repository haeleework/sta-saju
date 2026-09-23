import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthView } from "../app/login-test-panel";

const child = createElement("div", { id: "saju-content" }, "사주 콘텐츠");
const common = {
  email: "reader@example.com",
  notice: "",
  busy: false,
  authTestMode: false,
  onSignIn: () => {},
  onSignOut: () => {},
  children: child,
};

test("로그인 후 상단바에 계정과 로그아웃이 보이고 로그인 카드는 사라진다", () => {
  const html = renderToStaticMarkup(createElement(AuthView, { ...common, state: "signed-in" }));
  assert.match(html, /<nav[^>]*class="topbar"[^>]*>[\s\S]*reader@example\.com[\s\S]*로그아웃[\s\S]*<\/nav>/);
  assert.match(html, /id="saju-content"/);
  assert.doesNotMatch(html, /class="login-test-panel"|Google로 로그인|구글 로그인 시험|로그인됨:/);
});

test("로그아웃 상태에서는 이전 계정과 사주 콘텐츠가 숨고 로그인 카드가 보인다", () => {
  const html = renderToStaticMarkup(createElement(AuthView, { ...common, state: "signed-out" }));
  assert.match(html, /class="login-test-panel"/);
  assert.match(html, /Google로 로그인/);
  assert.doesNotMatch(html, /reader@example\.com|로그아웃|id="saju-content"|사주 콘텐츠/);
});

test("인증 확인 중에는 로그인 버튼과 사주 콘텐츠가 없고 기다림을 안내한다", () => {
  const html = renderToStaticMarkup(createElement(AuthView, { ...common, state: "loading" }));
  assert.match(html, /로그인 상태를 확인하는 중입니다/);
  assert.doesNotMatch(html, /Google로 로그인|reader@example\.com|로그아웃|id="saju-content"/);
});

test("시험 모드 로그인 전에는 시험 안내를 보이고 로그인 후에는 상단바만 유지한다", () => {
  const signedOut = renderToStaticMarkup(createElement(AuthView, { ...common, state: "signed-out", authTestMode: true }));
  assert.match(signedOut, /구글 로그인 시험/);
  const signedIn = renderToStaticMarkup(createElement(AuthView, { ...common, state: "signed-in", authTestMode: true }));
  assert.match(signedIn, /reader@example\.com/);
  assert.doesNotMatch(signedIn, /구글 로그인 시험|class="login-test-panel"/);
});
