import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("오늘의 운세 DB 연결 설정이 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
