import "server-only";
import { createAdminClient } from "../supabase/admin";
import { buildDailyFortunePrompt, calculateDailyFortuneFacts, kstDate, parseDailyFortune, type DailyProfileInput } from "./daily-fortune";
import { READING_MODEL } from "./reading";

export type DailyProfileRow = {
  user_id: string;
  birth_date: string;
  birth_time: string;
  gender: "male" | "female";
  profile_token: string;
  profile_version: number;
  source_reading_id: number | null;
  created_at: string;
};

const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${READING_MODEL}:generateContent`;
const dailySchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    reason: { type: "STRING" },
    action: { type: "STRING" },
  },
  required: ["summary", "reason", "action"],
};

export async function generateDailyFortune(profile: DailyProfileRow, today = kstDate(new Date())): Promise<string> {
  const admin = createAdminClient();
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return "missing_key";

  let facts;
  try {
    const input: DailyProfileInput = {
      date: profile.birth_date,
      time: profile.birth_time.slice(0, 5),
      gender: profile.gender,
    };
    facts = calculateDailyFortuneFacts(input, today);
  } catch {
    return "calculation_failed";
  }

  const { data: claim, error: claimError } = await admin.rpc("claim_saju_daily_fortune", {
    p_user_id: profile.user_id,
    p_fortune_date: today,
    p_profile_token: profile.profile_token,
    p_profile_version: profile.profile_version,
  });
  if (claimError) return "claim_failed";
  if (claim !== "claimed") return typeof claim === "string" ? claim : "claim_failed";

  let result = null;
  let errorCode = "gemini_failed";
  try {
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildDailyFortunePrompt(facts) }] }],
        generationConfig: {
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: dailySchema } },
          maxOutputTokens: 1024,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) {
      errorCode = upstream.status === 429 ? "rate_limited" : "gemini_failed";
    } else {
      const body = await upstream.json();
      const output = body?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: unknown }) => part.text)
        .filter((part: unknown): part is string => typeof part === "string")
        .join("");
      result = output ? parseDailyFortune(JSON.parse(output)) : null;
      if (!result) errorCode = "invalid_response";
    }
  } catch {
    errorCode = "gemini_failed";
  }

  const { data: saved, error: saveError } = await admin.rpc("complete_saju_daily_fortune", {
    p_user_id: profile.user_id,
    p_fortune_date: today,
    p_profile_token: profile.profile_token,
    p_profile_version: profile.profile_version,
    p_result: result,
    p_error_code: result ? null : errorCode,
  });
  if (saveError || saved !== true) return "profile_changed";
  return result ? "ready" : errorCode;
}
