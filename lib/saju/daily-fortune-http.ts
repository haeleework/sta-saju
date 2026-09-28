export async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const raw = await response.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(response.ok
      ? "서버 응답을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요."
      : "서버 응답이 중단되었습니다. 저장 여부를 다시 확인해 주세요.");
  }
  const body = data as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "요청을 처리하지 못했습니다.");
  return body;
}
