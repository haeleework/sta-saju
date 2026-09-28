import { DAILY_LIMIT, kstDate, parseDailyFortune } from "../../../lib/saju/daily-fortune";
import { createAdminClient } from "../../../lib/supabase/admin";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const client = await createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "로그인해 주세요." }, { status: 401 });
  const uid = auth.user.id;
  const today = kstDate(new Date());
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("saju_daily_profiles")
    .select("profile_token,profile_version").eq("user_id", uid).maybeSingle();
  if (profileError) return Response.json({ error: "오늘의 운세를 불러오지 못했습니다." }, { status: 503 });
  if (!profile) return Response.json({ status: "no_profile", fortuneDate: today }, { headers: { "Cache-Control": "no-store" } });

  const { data: row, error } = await admin.from("saju_daily_fortunes")
    .select("profile_token,profile_version,status,result,error_code,gemini_attempted_at")
    .eq("user_id", uid).eq("fortune_date", today).maybeSingle();
  if (error) return Response.json({ error: "오늘의 운세를 불러오지 못했습니다." }, { status: 503 });
  if (row && (row.profile_version !== profile.profile_version || row.profile_token !== profile.profile_token)) {
    return Response.json({ status: "stale", fortuneDate: today }, { headers: { "Cache-Control": "no-store" } });
  }
  if (row?.status === "ready") {
    const fortune = parseDailyFortune(row.result);
    if (fortune) return Response.json({ status: "ready", fortuneDate: today, fortune }, { headers: { "Cache-Control": "no-store" } });
  }
  if (row?.status === "processing" && row.gemini_attempted_at &&
    Date.now() - Date.parse(row.gemini_attempted_at) > 120000) {
    return Response.json({ status: "failed", fortuneDate: today }, { headers: { "Cache-Control": "no-store" } });
  }
  if (row) return Response.json({ status: row.status, fortuneDate: today }, { headers: { "Cache-Control": "no-store" } });

  const { data: usage } = await admin.from("saju_daily_usage")
    .select("attempt_count").eq("fortune_date", today).maybeSingle();
  return Response.json({ status: (usage?.attempt_count ?? 0) >= DAILY_LIMIT ? "limited" : "pending", fortuneDate: today }, { headers: { "Cache-Control": "no-store" } });
}
