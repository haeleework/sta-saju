import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "../app/page";
import SajuForm from "../app/saju-form";

test("처음에는 양력 날짜와 출생시간을 입력하는 단계만 보인다", () => {
  const html = renderToStaticMarkup(createElement(SajuForm));

  assert.match(html, /<input[^>]*id="date"[^>]*type="date"[^>]*required/);
  assert.match(html, /<input[^>]*id="time"[^>]*type="time"[^>]*required/);
  assert.match(html, /type="submit"[^>]*>기본 사주 확인하기/);
  assert.match(html, /현재는 출생시간을/);
  assert.doesNotMatch(html, /나의 사주 구성/);
  assert.doesNotMatch(html, /관심 주제 선택/);
});

test("로그인 확인 전 첫 화면은 사주 입력·계산·저장 목록을 렌더하지 않는다", () => {
  const html = renderToStaticMarkup(createElement(Page));

  assert.match(html, /AI 해석 베타/);
  assert.match(html, /로그인 상태를 확인하는 중입니다/);
  assert.doesNotMatch(html, /id="date"|id="time"|기본 사주 확인하기/);
  assert.doesNotMatch(html, /지난 해석 다시 보기|이 브라우저에만 저장됩니다/);
});

test("로그인 시험 모드에서만 구글 로그인 영역을 보여준다", () => {
  const previous = process.env.AUTH_TEST_MODE;
  try {
    process.env.AUTH_TEST_MODE = "true";
    const testMode = renderToStaticMarkup(createElement(Page));
    assert.match(testMode, /구글 로그인 시험/);
    assert.match(testMode, /로그인 상태를 확인하는 중입니다/);
    assert.doesNotMatch(testMode, /id="date"|id="time"|지난 해석 다시 보기/);

    process.env.AUTH_TEST_MODE = "false";
    const normalMode = renderToStaticMarkup(createElement(Page));
    assert.doesNotMatch(normalMode, /구글 로그인 시험/);
    assert.match(normalMode, /로그인 상태를 확인하는 중입니다/);
  } finally {
    if (previous === undefined) delete process.env.AUTH_TEST_MODE;
    else process.env.AUTH_TEST_MODE = previous;
  }
});
