import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import {
  buildReadingPrompt,
  hasReadingConflict,
  parseBaseReading,
  parseTopicReading,
  READING_MODEL,
} from "../lib/saju/reading";
import { handleReadingRequest } from "../app/api/reading/route";

const date = "2005-12-23";
const time = "08:37";
const chart = calculate({ date, time, calendar: "solar", topic: "general", question: "" });
const base = {
  summary: "차분하게 살펴볼 수 있습니다.",
  highlights: ["첫 번째 관점입니다.", "두 번째 관점입니다."],
  caution: "이 해석만으로 삶을 단정할 수 없습니다.",
};
const topic = {
  topic: "career" as const,
  title: "일과 진로",
  reading: "나에게 맞는 업무 환경을 생각해 보세요.",
  reflectionQuestion: "어떤 일을 할 때 몰입하나요?",
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/reading", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function authenticatedPost(input: Request): Promise<Response> {
  return handleReadingRequest(input, async () => true);
}

async function withGeminiMock(
  mock: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalTestMode = process.env.AUTH_TEST_MODE;
  globalThis.fetch = mock;
  process.env.GEMINI_API_KEY = "test-secret-key";
  delete process.env.AUTH_TEST_MODE;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalTestMode === undefined) delete process.env.AUTH_TEST_MODE;
    else process.env.AUTH_TEST_MODE = originalTestMode;
  }
}

function geminiResponse(value: unknown): Response {
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

test("기본·주제 해석은 필수 자료형, 빈 문자열, 길이, 주제 일치를 검사한다", () => {
  assert.deepEqual(parseBaseReading(base), base);
  assert.equal(parseBaseReading({ ...base, summary: " " }), null);
  assert.equal(parseBaseReading({ ...base, summary: "x".repeat(701) }), null);
  assert.equal(parseBaseReading({ ...base, highlights: ["하나"] }), null);
  assert.equal(parseBaseReading({ ...base, highlights: ["하나", 2] }), null);
  assert.deepEqual(parseTopicReading(topic, "career"), topic);
  assert.equal(parseTopicReading(topic, "money"), null);
  assert.equal(parseTopicReading({ ...topic, reading: " " }, "career"), null);
});

test("Gemini 프롬프트에는 계산값만 있고 원본 날짜·시간·키는 없다", () => {
  const prompt = buildReadingPrompt(chart, { date, time, kind: "topic", topic: "career" });
  assert.match(prompt, /관심 주제 '일·진로'/);
  assert.match(prompt, /계산 결과:/);
  assert.match(prompt, /"advancedReading":/);
  assert.match(prompt, /"tenGods":/);
  assert.match(prompt, /"pairRelations":/);
  assert.match(prompt, /값을 다시 계산하거나 제공하지 않은 삼합·방합·천간충·형·해·파를 만들어내지 마세요/);
  assert.match(prompt, /합을 다른 오행으로 변했다고 단정하거나 합·충을 실제 사건 예언으로 쓰지 마세요/);
  assert.doesNotMatch(prompt, /2005-12-23|08:37|test-secret-key|GEMINI_API_KEY/);
});

test("명시적으로 잘못 적은 년·월·일·시주와 오행 개수를 검출한다", () => {
  assert.equal(hasReadingConflict(chart, { ...base, summary: "년주는 갑자입니다." }), true);
  assert.equal(hasReadingConflict(chart, { ...base, highlights: ["월주는 갑자입니다.", "다른 관점입니다."] }), true);
  assert.equal(hasReadingConflict(chart, { ...topic, reading: "일주는 갑자입니다." }), true);
  assert.equal(hasReadingConflict(chart, { ...topic, reading: "시주는 갑자입니다." }), true);
  assert.equal(hasReadingConflict(chart, { ...base, summary: "목은 3개입니다." }), true);
  assert.equal(hasReadingConflict(chart, { ...topic, reading: "화가 4개입니다." }), true);
});

test("실제 계산값을 적었거나 숫자를 명시하지 않은 해석은 허용한다", () => {
  assert.equal(hasReadingConflict(chart, { ...base, summary: "년주는 을유이고 목은 1개입니다." }), false);
  assert.equal(hasReadingConflict(chart, { ...topic, reading: "일주는 신사, 시주는 임진입니다. 금은 2개입니다." }), false);
  assert.equal(hasReadingConflict(chart, { ...base, summary: "목 기운을 살펴볼 수 있습니다." }), false);
  assert.equal(hasReadingConflict(chart, { ...topic, reading: "올해는 새로운 방향을 생각해 볼 수 있습니다." }), false);
});

test("API는 계산값을 서버에서 만들고 모델·형식을 지정하며 민감값을 응답하지 않는다", async () => {
  await withGeminiMock(async (input, init) => {
    assert.match(String(input), new RegExp(`/${READING_MODEL}:generateContent$`));
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-secret-key");
    const sent = String(init?.body);
    assert.equal(JSON.parse(sent).generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
    assert.match(sent, /계산 결과/);
    assert.doesNotMatch(sent, /2005-12-23|08:37|test-secret-key/);
    return geminiResponse(base);
  }, async () => {
    const response = await authenticatedPost(request({ date, time, kind: "base", chart: { fake: true } }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.reading, base);
    assert.deepEqual(body.chart, chart);
    assert.doesNotMatch(JSON.stringify(body), /2005-12-23|08:37|test-secret-key/);
  });
});

test("API는 잘못된 입력과 키 누락 때 Gemini를 호출하지 않는다", async () => {
  await withGeminiMock(async () => {
    assert.fail("Gemini 호출이 없어야 합니다");
  }, async () => {
    assert.equal((await authenticatedPost(request({ date: "2005-02-30", time, kind: "base" }))).status, 400);
    assert.equal((await authenticatedPost(request({ date, time, kind: "topic", topic: "invalid" }))).status, 400);
    delete process.env.GEMINI_API_KEY;
    const response = await authenticatedPost(request({ date, time, kind: "base" }));
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /test-secret-key/);
  });
});

test("비로그인 요청은 기본·주제 해석 모두 401이며 Gemini를 호출하지 않는다", async () => {
  let fetchCalls = 0;
  await withGeminiMock(async () => {
    fetchCalls += 1;
    return geminiResponse(base);
  }, async () => {
    for (const body of [
      { date, time, kind: "base" },
      { date, time, kind: "topic", topic: "career" },
    ]) {
      const response = await handleReadingRequest(request(body), async () => false);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "로그인한 뒤 다시 시도해 주세요.");
    }
    assert.equal(fetchCalls, 0);
  });
});

test("로그인 시험 모드에서는 직접 API 요청도 Gemini를 호출하지 않는다", async () => {
  let fetchCalls = 0;
  await withGeminiMock(async () => {
    fetchCalls += 1;
    return geminiResponse(base);
  }, async () => {
    process.env.AUTH_TEST_MODE = "true";
    for (const body of [
      { date, time, kind: "base" },
      { date, time, kind: "topic", topic: "career" },
    ]) {
      const response = await authenticatedPost(request(body));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "로그인 시험 중에는 AI 해석을 만들지 않습니다.");
    }
    assert.equal(fetchCalls, 0);

    process.env.AUTH_TEST_MODE = "false";
    const normal = await authenticatedPost(request({ date, time, kind: "base" }));
    assert.equal(normal.status, 200);
    assert.equal(fetchCalls, 1);
  });
});

test("API는 주제 불일치·빈 응답·잘못된 JSON을 실패로 처리한다", async () => {
  for (const upstream of [
    geminiResponse({ ...topic, topic: "money" }),
    Response.json({ candidates: [{ content: { parts: [{ text: "" }] } }] }),
    Response.json({ candidates: [{ content: { parts: [{ text: "{" }] } }] }),
  ]) {
    await withGeminiMock(async () => upstream, async () => {
      const response = await authenticatedPost(request({ date, time, kind: "topic", topic: "career" }));
      assert.equal(response.status, 502);
      assert.equal("reading" in await response.json(), false);
    });
  }
});

test("API는 Gemini 제한·인증·연결 실패를 구분하고 재시도 성공을 허용한다", async () => {
  for (const [status, expected] of [[429, 429], [403, 502], [500, 503]] as const) {
    await withGeminiMock(async () => new Response(null, { status }), async () => {
      assert.equal((await authenticatedPost(request({ date, time, kind: "base" }))).status, expected);
    });
  }
  await withGeminiMock(async () => { throw new Error("network unavailable"); }, async () => {
    assert.equal((await authenticatedPost(request({ date, time, kind: "base" }))).status, 504);
  });
  await withGeminiMock(async () => geminiResponse(base), async () => {
    assert.equal((await authenticatedPost(request({ date, time, kind: "base" }))).status, 200);
  });
});
