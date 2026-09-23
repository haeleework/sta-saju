import { calculate, InputError } from "../../../lib/saju/chart";
import { createClient } from "../../../lib/supabase/server";
import {
  baseSchema,
  buildReadingPrompt,
  hasReadingConflict,
  isReadingTopic,
  parseBaseReading,
  parseTopicReading,
  READING_MODEL,
  topicSchema,
  type ReadingRequest,
} from "../../../lib/saju/reading";

export const runtime = "nodejs";

const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${READING_MODEL}:generateContent`;

function failure(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function parseRequest(value: unknown): ReadingRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.date !== "string" || typeof data.time !== "string") return null;
  if (data.kind === "base") return { date: data.date, time: data.time, kind: "base" };
  if (data.kind === "topic" && isReadingTopic(data.topic)) {
    return { date: data.date, time: data.time, kind: "topic", topic: data.topic };
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  return handleReadingRequest(request, async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      return !error && Boolean(data.user);
    } catch {
      return false;
    }
  });
}

export async function handleReadingRequest(request: Request, verifyUser: () => Promise<boolean>): Promise<Response> {
  if (!(await verifyUser())) return failure("로그인한 뒤 다시 시도해 주세요.", 401);
  if (process.env.AUTH_TEST_MODE === "true") {
    return failure("로그인 시험 중에는 AI 해석을 만들지 않습니다.", 503);
  }
  let input: ReadingRequest | null;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return failure("요청 내용이 너무 깁니다.", 413);
    input = parseRequest(JSON.parse(raw));
  } catch {
    return failure("입력 내용을 확인해 주세요.", 400);
  }
  if (!input) return failure("입력 내용을 확인해 주세요.", 400);

  let chart;
  try {
    chart = calculate({ date: input.date, time: input.time, calendar: "solar", topic: "general", question: "" });
  } catch (error) {
    return failure(error instanceof InputError ? error.message : "사주를 계산하지 못했습니다.", 400);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return failure("Gemini API 키가 설정되지 않았습니다.", 503);

  let upstream: Response;
  try {
    upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildReadingPrompt(chart, input) }] }],
        generationConfig: {
          responseFormat: {
            text: {
              mimeType: "APPLICATION_JSON",
              schema: input.kind === "base" ? baseSchema : topicSchema,
            },
          },
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return failure("해석 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 504);
  }

  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) return failure("Gemini API 키 설정을 확인해 주세요.", 502);
    if (upstream.status === 429) return failure("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    return failure("해석 서비스가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.", 503);
  }

  try {
    const response = await upstream.json();
    const output = response?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: unknown }) => part.text)
      .filter((part: unknown): part is string => typeof part === "string")
      .join("");
    if (!output) return failure("해석 결과를 확인할 수 없습니다. 다시 시도해 주세요.", 502);
    const parsed: unknown = JSON.parse(output);
    const reading = input.kind === "base"
      ? parseBaseReading(parsed)
      : parseTopicReading(parsed, input.topic);
    if (!reading) return failure("해석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
    if (hasReadingConflict(chart, reading)) return failure("계산 결과와 맞지 않는 해석이 생성됐습니다. 다시 시도해 주세요.", 502);
    return Response.json({ chart, reading }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("해석 결과를 확인할 수 없습니다. 다시 시도해 주세요.", 502);
  }
}
