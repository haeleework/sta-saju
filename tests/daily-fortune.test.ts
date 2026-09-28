import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDailyFortunePrompt,
  calculateDailyFortuneFacts,
  isAfterDailyStart,
  kstDate,
  parseDailyFortune,
} from "../lib/saju/daily-fortune";

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
  const prompt = buildDailyFortunePrompt(result);
  assert.match(prompt, /대운[\s\S]*세운[\s\S]*일운/);
  assert.doesNotMatch(prompt, /2005-12-23|08:37|male|female/);
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
