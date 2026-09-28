import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculate } from "../lib/saju/chart";
import { analyzeAdvancedReading } from "../lib/saju/advanced-reading";
import { calculateFortuneCycles } from "../lib/saju/fortune-cycles";
import {
  areSajuChartsEqual,
  loadAccountReadings,
  saveAccountReading,
} from "../lib/saju/account-reading-storage";
import {
  loadSavedReadings,
  writeSavedReadings,
  type SavedReading,
} from "../lib/saju/reading-storage";

const date = "2005-12-23";
const time = "08:37";
const chart = calculate({ date, time, calendar: "solar", topic: "general", question: "" });
const saved: SavedReading = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  createdAt: "2026-09-28T00:00:00.000Z",
  chart,
  base: {
    summary: "저장된 기본 해석입니다.",
    highlights: ["첫 단서", "둘째 단서"],
    caution: "해석은 참고 자료입니다.",
  },
  topics: {
    career: {
      topic: "career",
      title: "일과 진로",
      reading: "저장된 주제 해석입니다.",
      reflectionQuestion: "어떤 일을 좋아하시나요?",
    },
  },
};

function accountRow(entry: SavedReading) {
  return {
    id: 11,
    source_id: entry.id,
    interpreted_at: entry.createdAt,
    saved_at: "2026-09-28T01:00:00.000Z",
    updated_at: "2026-09-28T01:00:00.000Z",
    schema_version: 1,
    chart: entry.chart,
    base_reading: entry.base,
    topic_readings: entry.topics,
  };
}

function memoryAccountClient() {
  let row: ReturnType<typeof accountRow> | null = null;
  let writes = 0;
  const client = {
    from(table: string) {
      assert.equal(table, "saju_readings");
      return {
        upsert(payload: ReturnType<typeof accountRow>, options: { onConflict: string }) {
          assert.equal(options.onConflict, "user_id,source_id");
          writes += 1;
          row = { ...payload, id: 11, saved_at: "2026-09-28T01:00:00.000Z", updated_at: "2026-09-28T01:00:00.000Z" };
          return this;
        },
        select() { return this; },
        order() { return this; },
        single() { return Promise.resolve({ data: row, error: null }); },
        range() { return Promise.resolve({ data: row ? [row] : [], error: null }); },
      };
    },
  } as unknown as SupabaseClient;
  return { client, writes: () => writes };
}

function componentFunction(name: string): string {
  const source = readFileSync(new URL("../app/saju-form.tsx", import.meta.url), "utf8");
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} 함수가 있어야 합니다`);
  const next = source.indexOf("\n  function ", start + 1);
  const nextAsync = source.indexOf("\n  async function ", start + 1);
  const ends = [next, nextAsync].filter((index) => index !== -1);
  return source.slice(start, Math.min(...ends));
}

test("계정에 저장한 구성과 해석을 다시 읽으면 심화 해석을 복원하고 같은 입력으로 운을 계산한다", async () => {
  const account = memoryAccountClient();
  await saveAccountReading(account.client, saved);
  const reopened = (await loadAccountReadings(account.client)).entries[0];
  assert.ok(reopened);
  assert.deepEqual(reopened.base, saved.base);
  assert.deepEqual(reopened.topics, saved.topics);
  assert.equal(analyzeAdvancedReading(reopened.chart).tenGods.length, 7);

  const recalculated = calculate({ date, time, calendar: "solar", topic: "general", question: "" });
  assert.equal(areSajuChartsEqual(reopened.chart, recalculated), true);
  const fortune = calculateFortuneCycles({ date, time, gender: "female" }, recalculated, 2026);
  assert.equal(fortune.gender, "female");
  assert.ok(fortune.periods.length > 0);
  assert.equal(fortune.annual.length, 10);
  assert.equal(account.writes(), 1);
});

test("다른 사주 구성은 저장된 해석과 연결하지 않는다", () => {
  const different = calculate({ date: "2005-12-24", time, calendar: "solar", topic: "general", question: "" });
  assert.equal(areSajuChartsEqual(saved.chart, different), false);
});

test("브라우저와 계정 저장은 별도이며 계정 저장은 명시적인 한 번의 동작으로만 일어난다", async () => {
  const values = new Map<string, string>();
  const browser = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const account = memoryAccountClient();
  assert.equal(writeSavedReadings(browser, [saved]), true);
  assert.equal(account.writes(), 0);
  await saveAccountReading(account.client, saved);
  assert.equal(account.writes(), 1);
  assert.deepEqual(loadSavedReadings(browser).entries, [saved]);
  assert.equal((await loadAccountReadings(account.client)).entries.length, 1);
});

test("화면은 계정 결과를 열 때 지난 운을 지우고 출생 입력을 요구한다", () => {
  const open = componentFunction("handleOpenAccount");
  assert.match(open, /setChart\(entry\.chart\)/);
  assert.match(open, /setFortune\(null\)/);
  assert.match(open, /setBirthInput\(null\)/);
  assert.match(open, /setCurrentEntry\(\{[^}]*base: entry\.base, topics: entry\.topics/);
  assert.doesNotMatch(open, /calculateFortuneCycles|requestReading|fetch\(/);
});

test("화면은 같은 사주에서 해석을 유지하고 다른 사주에서 해석·주제 선택을 해제한다", () => {
  const submit = componentFunction("handleSubmit");
  assert.match(submit, /calculateFortuneCycles\([\s\S]*gender[\s\S]*calculated/);
  assert.match(submit, /areSajuChartsEqual\(currentEntry\.chart, calculated\)/);
  assert.match(submit, /if \(reopenedEntryMatches && currentEntry\)[\s\S]*else \{\s*setCurrentEntry\(null\)/);
  assert.match(submit, /setSelectedTopic\(null\)/);
  assert.doesNotMatch(submit, /requestReading|fetch\(/);
});

test("계산·재열람 경로는 Gemini를 요청하지 않고 AI 해석 버튼만 기존 요청을 사용한다", () => {
  for (const name of ["handleSubmit", "handleOpenAccount", "handleOpenSaved", "handleSaveAccount"]) {
    assert.doesNotMatch(componentFunction(name), /requestReading|fetch\(/, name);
  }
  assert.match(componentFunction("handleBaseReading"), /requestReading\(\{ \.\.\.birthInput, kind: "base" \}\)/);
  assert.match(componentFunction("handleTopicSelection"), /requestReading\(\{ \.\.\.birthInput, kind: "topic", topic \}\)/);
});
