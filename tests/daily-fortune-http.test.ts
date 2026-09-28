import test from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../lib/saju/daily-fortune-http";

async function withResponse(response: Response, assertion: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response;
  try {
    await assertion();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("정상 JSON 응답은 본문을 돌려준다", async () => {
  await withResponse(Response.json({ profile: { gender: "female" } }), async () => {
    assert.deepEqual(await requestJson("/api/daily-fortune/profile"), { profile: { gender: "female" } });
  });
});

test("서버가 반환한 JSON 오류 문구를 보여준다", async () => {
  await withResponse(Response.json({ error: "입력 정보를 확인해 주세요." }, { status: 400 }), async () => {
    await assert.rejects(requestJson("/api/daily-fortune/profile"), /입력 정보를 확인해 주세요/);
  });
});

for (const [name, response] of [
  ["빈 응답", new Response(null, { status: 504 })],
  ["HTML 오류 화면", new Response("<html>Gateway Timeout</html>", { status: 502, headers: { "Content-Type": "text/html" } })],
] as const) {
  test(`${name}은 JSON 파싱 오류나 서버 원문 대신 이해할 수 있는 안내를 보여준다`, async () => {
    await withResponse(response, async () => {
      await assert.rejects(requestJson("/api/daily-fortune/profile"), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /응답|다시|처리|저장|연결/);
        assert.doesNotMatch(error.message, /Unexpected end of JSON input|Failed to execute|<html>/);
        return true;
      });
    });
  });
}
