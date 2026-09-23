import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/auth/callback/route";

test("인증 코드가 없거나 외부 이동 주소가 있어도 앱 내부 오류 화면으로 돌아온다", async () => {
  const request = new NextRequest(
    "http://localhost:3000/auth/callback?next=https%3A%2F%2Fevil.example%2Fcollect",
  );
  const response = await GET(request);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3000/?auth=error");
});
