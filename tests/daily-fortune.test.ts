import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDailyFortunePrompt,
  calculateDailyFortuneFacts,
  isAfterDailyStart,
  kstDate,
  parseDailyFortune,
  parseGeneratedDailyFortune,
  selectDailyClues,
} from "../lib/saju/daily-fortune";
import { analyzeDailySignals } from "../lib/saju/advanced-reading";
import type { SajuChart } from "../lib/saju/chart";

test("한국 날짜는 서버의 UTC 날짜와 무관하게 자정에서 바뀐다", () => {
  assert.equal(kstDate(new Date("2026-09-28T14:59:59.000Z")), "2026-09-28");
  assert.equal(kstDate(new Date("2026-09-28T15:00:00.000Z")), "2026-09-29");
});

test("첫 등록 즉시 생성은 한국 시간 오전 9시부터 시작한다", () => {
  assert.equal(isAfterDailyStart(new Date("2026-09-28T23:59:59.000Z")), false);
  assert.equal(isAfterDailyStart(new Date("2026-09-28T00:00:00.000Z")), true);
  assert.equal(isAfterDailyStart(new Date("2026-09-28T00:59:59.000Z")), true);
  assert.equal(isAfterDailyStart(new Date("2026-09-28T15:00:00.000Z")), false);
});

test("오늘 운세 문장은 공백이나 손상된 형식이면 저장하지 않는다", () => {
  assert.equal(parseDailyFortune(null), null);
  assert.equal(parseDailyFortune([]), null);
  assert.equal(parseDailyFortune({ summary: "", reason: "이유", action: "행동" }), null);
  assert.equal(parseDailyFortune({ summary: "요약", reason: " ", action: "행동" }), null);
  assert.equal(parseDailyFortune({ summary: "요약", reason: "이유", action: 123 }), null);
});

test("정상적인 오늘 운세 문장은 표시할 세 항목으로 정리한다", () => {
  assert.deepEqual(
    parseDailyFortune({ summary: " 오늘의 관점 ", reason: " 계산 근거 ", action: " 작은 행동 " }),
    { summary: "오늘의 관점", reason: "계산 근거", action: "작은 행동" },
  );
});

test("새 상세 결과는 네 생활 영역이 모두 있어야 저장하고 옛 결과는 조회할 수 있다", () => {
  const legacy = { summary: " 오늘의 관점 ", reason: " 계산 근거 ", action: " 작은 행동 " };
  assert.equal(parseDailyFortune(legacy, true), null);
  const topic = { reading: "오늘의 계산 단서를 참고하며 할 일을 차분히 나눠 보세요.", tip: "먼저 할 일 하나를 적어 보세요." };
  const complete = { ...legacy, details: { work: topic, people: topic, money: topic, pace: topic } };
  assert.equal(parseDailyFortune(complete, true)?.details?.work.reading, topic.reading);
  assert.equal(parseDailyFortune({ ...complete, details: { ...complete.details, money: { reading: " ", tip: topic.tip } } }, true), null);
  assert.equal(parseDailyFortune({ ...complete, details: { work: topic, people: topic, money: topic } }, true), null);
  assert.deepEqual(parseDailyFortune(legacy), { summary: "오늘의 관점", reason: "계산 근거", action: "작은 행동" });
});

test("오늘의 십성은 같은 오행이라도 음양에 따라 달라지고 태어난 글자와 합충을 찾는다", () => {
  const chart = {
    pillars: [
      { label: "년주", stem: "己", branch: "子" },
      { label: "월주", stem: "乙", branch: "丑" },
      { label: "일주", stem: "甲", branch: "寅" },
      { label: "시주", stem: "庚", branch: "亥" },
    ],
  } as SajuChart;
  const first = analyzeDailySignals(chart, "丙午");
  const second = analyzeDailySignals(chart, "丁未");
  assert.equal(first.stemRole.name, "식신");
  assert.equal(second.stemRole.name, "상관");
  assert.ok(first.natalPairs.some((pair) => pair.kind === "지지충" && pair.second.pillarLabel === "년주"));
  assert.ok(second.natalPairs.some((pair) => pair.kind === "지지충" && pair.second.pillarLabel === "월주"));
  assert.throws(() => analyzeDailySignals(chart, "없는날"), /계산/);
});

test("오늘 운세의 계산 근거에 원국·현재 대운·2026년 세운·당일 일운이 함께 들어간다", () => {
  const result = calculateDailyFortuneFacts(
    { date: "2005-12-23", time: "08:37", gender: "male" },
    "2026-09-28",
  );

  assert.equal(result.fortuneDate, "2026-09-28");
  assert.equal(result.chart.pillars.length, 4);
  assert.equal(result.period?.ganZhi, "丙戌");
  assert.equal(result.annual?.year, 2026);
  assert.match(result.dailyGanZhi, /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
  assert.ok(result.dailyStemRelation.label);
  assert.ok(result.dailyBranchRelation.label);
  assert.ok(result.dailySignals.stemRole.name);
  assert.ok(result.dailySignals.branchRole.name);
  const prompt = buildDailyFortunePrompt(result);
  assert.match(prompt, /대운[\s\S]*세운[\s\S]*일운/);
  assert.match(prompt, /오늘 윗글자 십성:[\s\S]*오늘과 태어난 사주의 글자 관계:/);
  assert.match(prompt, /선택된 단서:/);
  assert.doesNotMatch(prompt, /details의 work/);
  assert.doesNotMatch(prompt, /2005-12-23|08:37|male|female/);
});

test("선택한 단서만 생성하며 AI가 계산 근거를 바꾸거나 다른 단서를 추가할 수 없다", () => {
  const facts = calculateDailyFortuneFacts({ date: "2005-12-23", time: "08:37", gender: "male" }, "2026-09-30");
  const selected = selectDailyClues(facts);
  assert.equal(selected.length, 3);
  const value = { summary: "오늘의 핵심", clues: selected.map(({ id }) => ({ id, title: "제목", why: "이유", reference: "참고할 상황", action: "행동", evidence: "AI가 만든 근거" })) };
  const parsed = parseGeneratedDailyFortune(value, facts);
  assert.equal(parsed?.clues?.[0].evidence, selected[0].evidence);
  assert.equal(parseGeneratedDailyFortune({ ...value, clues: value.clues.slice(0, 2) }, facts), null);
  assert.equal(parseGeneratedDailyFortune({ ...value, clues: value.clues.map((clue) => ({ ...clue, id: "unknown" })) }, facts), null);
  assert.equal(parseDailyFortune({ summary: "핵심", clues: [parsed!.clues![0], parsed!.clues![0]] }), null);
});

test("합충이 없으면 두 단서만 쓰고 같은 역할은 합쳐 긴 흐름과의 맥락을 고른다", () => {
  const facts = calculateDailyFortuneFacts({ date: "2005-12-23", time: "08:37", gender: "male" }, "2026-09-30");
  facts.dailySignals.natalPairs = [];
  assert.deepEqual(selectDailyClues(facts).map((clue) => clue.id), ["stem-role", "branch-role"]);
  facts.dailySignals.branchRole = { ...facts.dailySignals.branchRole, name: facts.dailySignals.stemRole.name };
  assert.deepEqual(selectDailyClues(facts).map((clue) => clue.id), ["stem-role", "background"]);
});

test("존재하지 않는 날짜로는 일운을 계산하지 않는다", () => {
  assert.throws(
    () => calculateDailyFortuneFacts({ date: "2005-12-23", time: "08:37", gender: "male" }, "2026-02-30"),
    /날짜/,
  );
});

test("마이그레이션은 계정별 프로필·운세 격리와 하루 한 건을 DB에서 강제한다", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260928073640_daily_fortune.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /create table (?:if not exists )?public\.saju_daily_profiles/i);
  assert.match(sql, /create table (?:if not exists )?public\.saju_daily_fortunes/i);
  assert.match(sql, /(?:unique|primary key)\s*\(\s*user_id\s*,\s*fortune_date\s*\)/i);
  for (const table of ["saju_daily_profiles", "saju_daily_fortunes"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`create policy[\\s\\S]+?on public\\.${table} for select to authenticated[\\s\\S]+?auth\\.uid\\(\\)[\\s\\S]+?= user_id`, "i"));
  }
  assert.match(sql, /revoke all on public\.saju_daily_profiles, public\.saju_daily_fortunes, public\.saju_daily_usage from anon, authenticated/i);
  assert.match(sql, /grant select on public\.saju_daily_profiles, public\.saju_daily_fortunes to authenticated/i);
  assert.match(sql, /create (?:or replace )?function public\.claim_saju_daily_fortune/i);
  assert.match(sql, /create function public\.claim_saju_daily_fortune[\s\S]+?from public\.saju_daily_profiles where user_id = p_user_id for update[\s\S]+?from public\.saju_daily_usage[\s\S]+?for update/i);
  assert.match(sql, /revoke all on function public\.claim_saju_daily_fortune[\s\S]+?from public/i);
  assert.match(sql, /grant execute on function public\.claim_saju_daily_fortune[\s\S]+?to service_role/i);
  assert.match(sql, /create function public\.save_saju_daily_profile[\s\S]+?pg_catalog\.pg_advisory_xact_lock[\s\S]+?profile_version \+ 1/i);
  assert.match(sql, /create function public\.complete_saju_daily_fortune[\s\S]+?profile_token = p_profile_token[\s\S]+?for update[\s\S]+?row_count[\s\S]+?v_changed = 1/i);
  assert.match(sql, /create function public\.delete_saju_daily_profile[\s\S]+?pg_catalog\.pg_advisory_xact_lock/i);
  for (const name of ["save_saju_daily_profile", "complete_saju_daily_fortune", "delete_saju_daily_profile"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}[\\s\\S]+?from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+?to service_role`, "i"));
  }
});

test("호출 선점과 자동 정리는 30회 상한과 지난 운세 삭제를 명시한다", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260928073640_daily_fortune.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /create (?:or replace )?function public\.cleanup_saju_daily_fortunes/i);
  assert.match(sql, /delete from public\.saju_daily_fortunes/i);
  assert.match(sql, /gemini_attempted_at/i);
  assert.match(sql, /30/);
  assert.match(sql, /on conflict\s*\(\s*user_id\s*,\s*fortune_date\s*\)/i);
});

test("저장 결과 출처 외래 키에는 NULL을 제외한 조회 인덱스를 둔다", () => {
  const schema = readFileSync(
    new URL("../supabase/migrations/20260928073640_daily_fortune.sql", import.meta.url),
    "utf8",
  );
  const index = readFileSync(
    new URL("../supabase/migrations/20260928073911_daily_fortune_source_index.sql", import.meta.url),
    "utf8",
  );

  assert.match(schema, /source_reading_id\s+bigint\s+references\s+public\.saju_readings\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/i);
  assert.match(index, /create\s+index\s+(?:if\s+not\s+exists\s+)?\w+\s+on\s+public\.saju_daily_profiles\s*\(\s*source_reading_id\s*\)\s+where\s+source_reading_id\s+is\s+not\s+null\s*;/i);
});
