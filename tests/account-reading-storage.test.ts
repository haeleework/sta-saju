import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountReadingStorageError,
  areSajuChartsEqual,
  deleteAccountReading,
  loadAccountReadings,
  normalizeReadingAlias,
  parseAccountReadingRow,
  saveAccountReading,
} from "../lib/saju/account-reading-storage";
import { calculate } from "../lib/saju/chart";
import type { SavedReading } from "../lib/saju/saved-reading";

const sourceId = "123e4567-e89b-42d3-a456-426614174000";
const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "general",
  question: "",
});
const base = {
  summary: "차분하게 살펴볼 수 있습니다.",
  highlights: ["첫 번째 관점입니다.", "두 번째 관점입니다."],
  caution: "이 해석만으로 삶을 단정할 수 없습니다.",
};
const career = {
  topic: "career" as const,
  title: "일과 진로",
  reading: "나에게 맞는 업무 환경을 생각해 보세요.",
  reflectionQuestion: "어떤 일을 할 때 몰입하나요?",
};
const saved: SavedReading = {
  id: sourceId,
  createdAt: "2026-09-23T01:00:00.000Z",
  chart,
  base,
  topics: { career },
};
const validRow = {
  id: 7,
  source_id: sourceId,
  interpreted_at: saved.createdAt,
  saved_at: "2026-09-23T02:00:00.000Z",
  updated_at: "2026-09-23T03:00:00.000Z",
  schema_version: 1,
  chart,
  base_reading: base,
  topic_readings: { career },
};

type MockResult = { data: unknown; error: unknown };
type Operation = { name: string; args: unknown[] };

class QueryBuilder {
  constructor(
    private readonly result: MockResult,
    readonly operations: Operation[],
  ) {}

  select(...args: unknown[]) {
    this.operations.push({ name: "select", args });
    return this;
  }

  order(...args: unknown[]) {
    this.operations.push({ name: "order", args });
    return this;
  }

  range(...args: unknown[]): Promise<MockResult> {
    this.operations.push({ name: "range", args });
    return Promise.resolve(this.result);
  }

  upsert(...args: unknown[]) {
    this.operations.push({ name: "upsert", args });
    return this;
  }

  single(): Promise<MockResult> {
    this.operations.push({ name: "single", args: [] });
    return Promise.resolve(this.result);
  }

  eq(...args: unknown[]) {
    this.operations.push({ name: "eq", args });
    return this;
  }

  maybeSingle(): Promise<MockResult> {
    this.operations.push({ name: "maybeSingle", args: [] });
    return Promise.resolve(this.result);
  }

  delete() {
    this.operations.push({ name: "delete", args: [] });
    return this;
  }
}

function mockClient(...results: MockResult[]) {
  const calls: Array<{ table: string; operations: Operation[] }> = [];
  let resultIndex = 0;
  const client = {
    from(table: string) {
      const operations: Operation[] = [];
      calls.push({ table, operations });
      const result = results[resultIndex++];
      assert.ok(result, `mock result ${resultIndex} should exist`);
      return new QueryBuilder(result, operations);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("사주 차트는 중첩 객체의 키 순서가 달라도 같은 계산 결과로 비교한다", () => {
  const reorderedChart = {
    elementMethod: chart.elementMethod,
    dayMaster: {
      element: chart.dayMaster.element,
      korean: chart.dayMaster.korean,
      character: chart.dayMaster.character,
    },
    elements: {
      수: chart.elements.수,
      금: chart.elements.금,
      토: chart.elements.토,
      화: chart.elements.화,
      목: chart.elements.목,
    },
    pillars: chart.pillars.map((pillar) => ({
      branchElement: pillar.branchElement,
      stemElement: pillar.stemElement,
      branch: pillar.branch,
      stem: pillar.stem,
      korean: pillar.korean,
      text: pillar.text,
      label: pillar.label,
    })),
    engine: chart.engine,
    method: chart.method,
  };

  assert.equal(areSajuChartsEqual(chart, reorderedChart), true);
  assert.equal(areSajuChartsEqual(reorderedChart, chart), true);
});

test("실제로 다른 사주 차트와 잘못된 입력은 같은 결과로 보지 않는다", () => {
  const differentChart = calculate({
    date: "2005-12-24",
    time: "08:37",
    calendar: "solar",
    topic: "general",
    question: "",
  });

  assert.equal(areSajuChartsEqual(chart, differentChart), false);
  assert.equal(areSajuChartsEqual(chart, { fake: true }), false);
  assert.equal(areSajuChartsEqual(null, chart), false);
  assert.equal(areSajuChartsEqual(null, null), false);
});

test("계정 저장 행은 검증한 뒤 앱의 SavedReading 형식으로 바꾼다", () => {
  assert.deepEqual(parseAccountReadingRow(validRow), {
    databaseId: 7,
    id: sourceId,
    createdAt: saved.createdAt,
    savedAt: validRow.saved_at,
    updatedAt: validRow.updated_at,
    alias: null,
    chart,
    base,
    topics: { career },
  });
});

test("계정 저장 행의 별칭을 읽고, 기존 별칭 없는 행은 그대로 연다", () => {
  assert.equal(parseAccountReadingRow(validRow)?.alias, null);
  assert.equal(parseAccountReadingRow({ ...validRow, alias: null })?.alias, null);
  assert.equal(parseAccountReadingRow({ ...validRow, alias: "내 사주" })?.alias, "내 사주");
});

test("별칭은 공백을 정리하고 비울 수 있지만 긴 값과 제어 문자는 거부한다", () => {
  assert.equal(normalizeReadingAlias("  내 사주  "), "내 사주");
  assert.equal(normalizeReadingAlias("   "), null);
  assert.equal(normalizeReadingAlias("😀".repeat(30)), "😀".repeat(30));
  for (const alias of ["가".repeat(31), "😀".repeat(31), "첫째\n둘째", "첫째\t둘째"]) {
    assert.throws(() => normalizeReadingAlias(alias), AccountReadingStorageError);
  }
  for (const alias of [" 별칭", "별칭 ", "", "첫째\n둘째", "가".repeat(31)]) {
    assert.equal(parseAccountReadingRow({ ...validRow, alias }), null);
  }
});

test("잘못된 계정 저장 행과 주제 자료는 거부한다", () => {
  const invalidRows = [
    null,
    [],
    { ...validRow, id: 0 },
    { ...validRow, id: 1.5 },
    { ...validRow, source_id: "not-a-uuid" },
    { ...validRow, schema_version: 2 },
    { ...validRow, interpreted_at: "not-a-date" },
    { ...validRow, saved_at: "not-a-date" },
    { ...validRow, updated_at: "not-a-date" },
    { ...validRow, chart: { fake: true } },
    { ...validRow, base_reading: { ...base, summary: " " } },
    { ...validRow, topic_readings: [] },
    { ...validRow, topic_readings: { unknown: career } },
    { ...validRow, topic_readings: { career: { ...career, topic: "money" } } },
  ];

  for (const row of invalidRows) assert.equal(parseAccountReadingRow(row), null);
});

test("목록은 최신 저장순 페이지를 요청하고 손상 행만 제외한다", async () => {
  const invalidRow = { ...validRow, id: 8, base_reading: null };
  const secondRow = { ...validRow, id: 9, source_id: "223e4567-e89b-42d3-a456-426614174000" };
  const { client, calls } = mockClient({ data: [validRow, invalidRow, secondRow], error: null });

  const page = await loadAccountReadings(client, 40, 3);

  assert.deepEqual(page.entries.map((entry) => entry.databaseId), [7, 9]);
  assert.equal(page.invalidCount, 1);
  assert.equal(page.hasMore, true);
  assert.equal(page.rowsRead, 3);
  assert.equal(calls[0].table, "saju_readings");
  assert.deepEqual(calls[0].operations.find((operation) => operation.name === "order")?.args,
    ["saved_at", { ascending: false }]);
  assert.deepEqual(calls[0].operations.find((operation) => operation.name === "range")?.args, [40, 42]);
});

test("목록 조회 실패는 빈 목록으로 숨기지 않고 재시도 가능한 오류로 알린다", async () => {
  const { client } = mockClient({ data: null, error: { message: "offline" } });
  await assert.rejects(
    loadAccountReadings(client),
    (error: unknown) => error instanceof AccountReadingStorageError && /불러오지 못했습니다/.test(error.message),
  );
});

test("같은 source_id 저장은 사용자별 유일 키 upsert로 멱등 처리한다", async () => {
  const updatedRow = { ...validRow, updated_at: "2026-09-23T04:00:00.000Z" };
  const { client, calls } = mockClient(
    { data: validRow, error: null },
    { data: updatedRow, error: null },
  );

  const first = await saveAccountReading(client, saved);
  const second = await saveAccountReading(client, saved);

  assert.equal(first.databaseId, 7);
  assert.equal(second.databaseId, 7);
  for (const call of calls) {
    const upsert = call.operations.find((operation) => operation.name === "upsert");
    assert.ok(upsert);
    assert.deepEqual(upsert.args[1], {
      onConflict: "user_id,source_id",
      defaultToNull: false,
    });
    assert.deepEqual(upsert.args[0], {
      source_id: sourceId,
      interpreted_at: saved.createdAt,
      schema_version: 1,
      chart,
      base_reading: base,
      topic_readings: { career },
    });
    assert.equal("user_id" in (upsert.args[0] as Record<string, unknown>), false);
  }
});

test("별칭 저장·수정·비우기를 계정 행 한 건의 upsert에 전달한다", async () => {
  const { client, calls } = mockClient(
    { data: { ...validRow, alias: "내 사주" }, error: null },
    { data: { ...validRow, alias: "가족 사주" }, error: null },
    { data: { ...validRow, alias: null }, error: null },
  );

  assert.equal((await saveAccountReading(client, saved, "  내 사주  ")).alias, "내 사주");
  assert.equal((await saveAccountReading(client, saved, "가족 사주")).alias, "가족 사주");
  assert.equal((await saveAccountReading(client, saved, "")).alias, null);

  assert.deepEqual(calls.map((call) =>
    (call.operations.find((operation) => operation.name === "upsert")?.args[0] as Record<string, unknown>).alias,
  ), ["내 사주", "가족 사주", null]);
});

test("잘못된 별칭은 데이터베이스에 요청하기 전에 거부한다", async () => {
  const { client, calls } = mockClient();
  await assert.rejects(saveAccountReading(client, saved, "첫째\n둘째"), AccountReadingStorageError);
  assert.equal(calls.length, 0);
});

test("자동 주제 갱신은 이미 저장한 별칭을 다시 전달한다", () => {
  const source = readFileSync(new URL("../app/saju-form.tsx", import.meta.url), "utf8");
  assert.match(source, /automatic\s*\?\s*accountRef\.current\.find\(\(item\)\s*=>\s*item\.id\s*===\s*entry\.id\)\?\.alias/);
  assert.match(source, /saveAccountReading\(createClient\(\),\s*entry,\s*aliasToSave\)/);
});

test("저장 응답이 불확실하면 source_id로 다시 읽어 성공 여부를 확인한다", async () => {
  const { client, calls } = mockClient(
    { data: null, error: { message: "response lost" } },
    { data: validRow, error: null },
  );

  const result = await saveAccountReading(client, saved);

  assert.equal(result.databaseId, 7);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].operations.find((operation) => operation.name === "eq")?.args,
    ["source_id", sourceId]);
});

test("별칭 변경 요청이 실패하고 옛 행만 재조회되면 성공으로 표시하지 않는다", async () => {
  const { client, calls } = mockClient(
    { data: null, error: { message: "request failed" } },
    { data: { ...validRow, alias: "옛 별칭" }, error: null },
  );

  await assert.rejects(
    saveAccountReading(client, saved, "새 별칭"),
    (error: unknown) => error instanceof AccountReadingStorageError && /저장되지 않았습니다/.test(error.message),
  );
  assert.equal(calls.length, 2);
  assert.equal((calls[0].operations.find((operation) => operation.name === "upsert")?.args[0] as Record<string, unknown>).alias, "새 별칭");
});

test("주제 해석 갱신 요청이 실패하고 이전 내용만 재조회되면 성공으로 표시하지 않는다", async () => {
  const { client } = mockClient(
    { data: null, error: { message: "request failed" } },
    { data: { ...validRow, alias: "내 사주", topic_readings: {} }, error: null },
  );

  await assert.rejects(
    saveAccountReading(client, saved, "내 사주"),
    (error: unknown) => error instanceof AccountReadingStorageError && /저장되지 않았습니다/.test(error.message),
  );
});

test("저장 실패·잘못된 식별자·손상 성공 응답은 성공으로 표시하지 않는다", async () => {
  const failed = mockClient(
    { data: null, error: { message: "offline" } },
    { data: null, error: { message: "offline" } },
  );
  await assert.rejects(
    saveAccountReading(failed.client, saved),
    (error: unknown) => error instanceof AccountReadingStorageError && /저장되지 않았습니다/.test(error.message),
  );

  const untouched = mockClient();
  await assert.rejects(
    saveAccountReading(untouched.client, { ...saved, id: "legacy-local-id" }),
    (error: unknown) => error instanceof AccountReadingStorageError && /식별자/.test(error.message),
  );
  assert.equal(untouched.calls.length, 0);

  const malformed = mockClient({ data: { ...validRow, schema_version: 99 }, error: null });
  await assert.rejects(
    saveAccountReading(malformed.client, saved),
    (error: unknown) => error instanceof AccountReadingStorageError && /형식/.test(error.message),
  );
});

test("삭제는 데이터베이스 id 한 건을 지정하고 실제 삭제 행이 없으면 실패한다", async () => {
  const success = mockClient({ data: { id: 7 }, error: null });
  await deleteAccountReading(success.client, 7);
  assert.deepEqual(success.calls[0].operations.map((operation) => operation.name),
    ["delete", "eq", "select", "maybeSingle"]);
  assert.deepEqual(success.calls[0].operations.find((operation) => operation.name === "eq")?.args, ["id", 7]);

  for (const result of [
    { data: null, error: null },
    { data: null, error: { message: "denied" } },
  ]) {
    const failed = mockClient(result);
    await assert.rejects(
      deleteAccountReading(failed.client, 7),
      (error: unknown) => error instanceof AccountReadingStorageError && /삭제하지 못했습니다/.test(error.message),
    );
  }
});

test("마이그레이션은 사용자 소유권 RLS, anon 차단, 중복 방지 제약을 선언한다", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/202609230001_create_saju_readings.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /unique\s*\(\s*user_id\s*,\s*source_id\s*\)/i);
  assert.match(sql, /alter table public\.saju_readings enable row level security/i);
  assert.match(sql, /revoke all on table public\.saju_readings from anon/i);
  assert.match(sql, /revoke all on sequence public\.saju_readings_id_seq from anon/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.saju_readings to authenticated/i);

  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`create policy[\\s\\S]+?for ${operation}[\\s\\S]+?to authenticated`, "i"));
  }
  assert.match(sql, /for select[\s\S]+?using\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
  assert.match(sql, /for insert[\s\S]+?with check\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
  assert.match(sql, /for update[\s\S]+?using\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)[\s\S]+?with check\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
  assert.match(sql, /for delete[\s\S]+?using\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
});

test("별칭 마이그레이션은 기존 행을 보존하며 길이와 제어 문자 제약을 건다", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260929051636_reading_alias.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /alter table public\.saju_readings\s+add column if not exists alias text/i);
  assert.match(sql, /alias is null/i);
  assert.match(sql, /char_length\(alias\) between 1 and 30/i);
  assert.match(sql, /alias = btrim\(alias\)/i);
  assert.match(sql, /alias !~ '\[\[:cntrl:\]\]'/i);
  assert.doesNotMatch(sql, /update public\.saju_readings/i);
});
