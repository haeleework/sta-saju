import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?auth=error", requestUrl.origin));

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase 연결 설정이 없습니다.");
    const response = NextResponse.redirect(new URL("/?auth=success", requestUrl.origin));
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/?auth=error", requestUrl.origin));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?auth=error", requestUrl.origin));
  }
}
