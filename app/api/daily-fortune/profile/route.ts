import { calculate, InputError } from "../../../../lib/saju/chart";
import { areSajuChartsEqual } from "../../../../lib/saju/account-reading-storage";
import { isAfterDailyStart, kstDate } from "../../../../lib/saju/daily-fortune";
import { generateDailyFortune, type DailyProfileRow } from "../../../../lib/saju/daily-fortune-server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function userId(): Promise<string | null> {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user?.id ?? null;
  } catch { return null; }
}

export async function GET() {
  const uid = await userId();
  if (!uid) return reply({ error: "로그인해 주세요." }, 401);
  try {
    const { data, error } = await createAdminClient().from("saju_daily_profiles")
      .select("birth_date,birth_time,gender,profile_version,source_reading_id,created_at")
      .eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return reply({ profile: data });
  } catch { return reply({ error: "내 사주 정보를 불러오지 못했습니다." }, 503); }
}

export async function PUT(request: Request) {
  const uid = await userId();
  if (!uid) return reply({ error: "로그인해 주세요." }, 401);
  let input: { date?: unknown; time?: unknown; gender?: unknown; sourceReadingId?: unknown };
  try {
    const body = await request.text();
    if (body.length > 1024) return reply({ error: "입력 내용이 너무 깁니다." }, 413);
    input = JSON.parse(body);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch { return reply({ error: "입력 내용을 확인해 주세요." }, 400); }
  if (typeof input.date !== "string" || typeof input.time !== "string" || (input.gender !== "male" && input.gender !== "female")) {
    return reply({ error: "생년월일·출생시간·성별을 확인해 주세요." }, 400);
  }
  let chart;
  try {
    chart = calculate({ date: input.date, time: input.time, calendar: "solar", topic: "general", question: "" });
  } catch (error) {
    return reply({ error: error instanceof InputError ? error.message : "사주를 계산하지 못했습니다." }, 400);
  }

  const admin = createAdminClient();
  let sourceReadingId: number | null = null;
  if (input.sourceReadingId !== undefined && input.sourceReadingId !== null) {
    if (typeof input.sourceReadingId !== "number" || !Number.isSafeInteger(input.sourceReadingId) || input.sourceReadingId < 1) {
      return reply({ error: "가져올 저장 결과를 확인해 주세요." }, 400);
    }
    const { data: source, error } = await admin.from("saju_readings")
      .select("id,chart").eq("user_id", uid).eq("id", input.sourceReadingId).maybeSingle();
    if (error || !source || !areSajuChartsEqual(source.chart, chart)) {
      return reply({ error: "선택한 저장 결과와 입력한 출생 정보의 사주 8글자가 일치하지 않습니다." }, 400);
    }
    sourceReadingId = source.id;
  }

  const { data: existing, error: readError } = await admin.from("saju_daily_profiles")
    .select("user_id,birth_date,birth_time,gender,profile_token,profile_version,source_reading_id,created_at")
    .eq("user_id", uid).maybeSingle();
  if (readError) return reply({ error: "내 사주 정보를 확인하지 못했습니다." }, 503);
  const { data: saved, error: saveError } = await admin.rpc("save_saju_daily_profile", {
    p_user_id: uid,
    p_birth_date: input.date,
    p_birth_time: input.time,
    p_gender: input.gender,
    p_source_reading_id: sourceReadingId,
    p_chart: chart,
  });
  if (saveError || !saved) return reply({ error: "내 사주 정보를 저장하지 못했습니다." }, 503);

  const firstRegistration = !existing && (saved as DailyProfileRow).profile_version === 1;
  const unchanged = existing?.profile_token === (saved as DailyProfileRow).profile_token &&
    existing?.profile_version === (saved as DailyProfileRow).profile_version;
  const generation = firstRegistration && isAfterDailyStart(new Date())
    ? await generateDailyFortune(saved as DailyProfileRow, kstDate(new Date()))
    : firstRegistration ? "waiting_for_nine" : unchanged ? "unchanged" : "updated";
  return reply({ profile: saved, generation });
}

export async function DELETE() {
  const uid = await userId();
  if (!uid) return reply({ error: "로그인해 주세요." }, 401);
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("delete_saju_daily_profile", { p_user_id: uid });
    if (error) throw error;
    return reply({ deleted: true });
  } catch { return reply({ error: "내 사주 정보를 삭제하지 못했습니다." }, 503); }
}
