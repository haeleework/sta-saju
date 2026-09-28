import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../app/api/daily-fortune/profile/route.ts", import.meta.url), "utf8");
const fortune = readFileSync(new URL("../app/api/daily-fortune/route.ts", import.meta.url), "utf8");
const cron = readFileSync(new URL("../app/api/cron/daily-fortune/route.ts", import.meta.url), "utf8");
const generator = readFileSync(new URL("../lib/saju/daily-fortune-server.ts", import.meta.url), "utf8");

test("프로필 조회·등록·삭제는 로그인 확인 후 자신의 행만 대상으로 한다", () => {
  assert.match(profile, /auth\.getUser\(\)/);
  assert.match(profile, /if \(!uid\) return reply\([^\n]+401\)/g);
  assert.match(profile, /from\("saju_daily_profiles"\)[\s\S]+?\.eq\("user_id", uid\)/);
  assert.match(profile, /admin\.rpc\("delete_saju_daily_profile", \{ p_user_id: uid \}\)/);
  assert.match(profile, /admin\.rpc\("save_saju_daily_profile"/);
  assert.match(profile, /body\.length > 1024/);
  assert.doesNotMatch(profile, /NEXT_PUBLIC_SUPABASE_SECRET|service_role/);
});

test("계정 저장 결과 가져오기는 로그인 계정 소유권과 차트 일치를 검사한다", () => {
  assert.match(profile, /from\("saju_readings"\)[\s\S]+?\.eq\("user_id", uid\)\.eq\("id", input\.sourceReadingId\)/);
  assert.match(profile, /areSajuChartsEqual\(source\.chart, chart\)/);
  assert.match(profile, /sourceReadingId = source\.id/);
});

test("오늘 운세 조회는 자신의 오늘 결과만 읽고 프로필 토큰·버전이 다르면 감춘다", () => {
  assert.match(fortune, /auth\.getUser\(\)/);
  assert.match(fortune, /if \(authError \|\| !auth\.user\).*401/);
  assert.match(fortune, /kstDate\(new Date\(\)\)/);
  assert.match(fortune, /from\("saju_daily_fortunes"\)[\s\S]+?\.eq\("user_id", uid\)\.eq\("fortune_date", today\)/);
  assert.match(fortune, /row\.profile_version !== profile\.profile_version/);
  assert.match(fortune, /row\.profile_token !== profile\.profile_token/);
  assert.match(fortune, /parseDailyFortune\(row\.result\)/);
  assert.doesNotMatch(fortune, /generateDailyFortune|fetch\(/);
});

test("예약 API는 비밀값 없거나 다르면 거부하고 인증 뒤에만 계정 전체를 읽는다", () => {
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /if \(!authorized\(request\)\) return Response\.json\([^\n]+401/);
  assert.ok(cron.indexOf("if (!authorized(request))") < cron.indexOf("createAdminClient()"));
  assert.match(cron, /cleanup_saju_daily_fortunes/);
  assert.match(cron, /range\(offset, offset \+ 29\)/);
});

test("Gemini 요청은 DB 선점에 성공한 후에만 시작하고 실패 문장을 꾸며내지 않는다", () => {
  assert.match(generator, /admin\.rpc\("claim_saju_daily_fortune"/);
  assert.ok(generator.indexOf("claim !== \"claimed\"") < generator.indexOf("fetch(geminiUrl"));
  assert.match(generator, /parseDailyFortune\(JSON\.parse\(output\)\)/);
  assert.match(generator, /admin\.rpc\("complete_saju_daily_fortune"/);
  assert.match(generator, /p_profile_token: profile\.profile_token/);
  assert.match(generator, /if \(saveError \|\| saved !== true\) return "profile_changed"/);
});
