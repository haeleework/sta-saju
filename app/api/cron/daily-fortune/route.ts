import { timingSafeEqual } from "node:crypto";
import { generateDailyFortune, type DailyProfileRow } from "../../../../lib/saju/daily-fortune-server";
import { DAILY_LIMIT, kstDate } from "../../../../lib/saju/daily-fortune";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || !supplied) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.GEMINI_API_KEY?.trim()) return Response.json({ error: "gemini_key_missing" }, { status: 503 });
  const today = kstDate(new Date());
  const admin = createAdminClient();
  const { error: cleanupError } = await admin.rpc("cleanup_saju_daily_fortunes", { p_today: today });
  if (cleanupError) return Response.json({ error: "cleanup_failed" }, { status: 503 });

  let offset = 0;
  let claimed = 0;
  let ready = 0;
  let failed = 0;
  while (true) {
    const { data: profiles, error } = await admin.from("saju_daily_profiles")
      .select("user_id,birth_date,birth_time,gender,profile_token,profile_version,source_reading_id,created_at")
      .order("created_at", { ascending: true }).order("user_id", { ascending: true })
      .range(offset, offset + 29);
    if (error) return Response.json({ error: "profile_load_failed", claimed, ready, failed }, { status: 503 });
    if (!profiles?.length) break;
    for (let index = 0; index < profiles.length; index += 5) {
      const group = profiles.slice(index, index + 5);
      const results = await Promise.all(group.map((profile) => generateDailyFortune(profile as DailyProfileRow, today)));
      claimed += results.filter((result) => result === "ready" || result === "gemini_failed" || result === "rate_limited" || result === "invalid_response" || result === "save_failed" || result === "profile_changed").length;
      ready += results.filter((result) => result === "ready").length;
      failed += results.filter((result) => result === "gemini_failed" || result === "rate_limited" || result === "invalid_response" || result === "save_failed" || result === "profile_changed").length;
    }
    offset += profiles.length;
    const { data: usage } = await admin.from("saju_daily_usage").select("attempt_count").eq("fortune_date", today).maybeSingle();
    if (profiles.length < 30 || (usage?.attempt_count ?? 0) >= DAILY_LIMIT) break;
  }
  return Response.json({ date: today, claimed, ready, failed }, { headers: { "Cache-Control": "no-store" } });
}
