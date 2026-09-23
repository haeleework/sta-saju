"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "../lib/supabase/client";

type LoginState = "loading" | "signed-out" | "signed-in";

type AuthViewProps = {
  state: LoginState;
  email: string;
  notice: string;
  busy: boolean;
  authTestMode: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  children: ReactNode;
};

export function AuthView({ state, email, notice, busy, authTestMode, onSignIn, onSignOut, children }: AuthViewProps) {
  return (
    <>
      <nav className="topbar" aria-label="서비스 및 계정">
        <div className="topbar-brand">
          <span className="brand">나의 결</span>
          <span className="prototype-tag">AI 해석 베타</span>
        </div>
        {state === "signed-in" && (
          <div className="topbar-account" aria-label="로그인 계정">
            <span className="account-email" title={email}>{email || "구글 계정"}</span>
            <button type="button" onClick={onSignOut} disabled={busy}>로그아웃</button>
          </div>
        )}
      </nav>
      {state === "signed-in" && notice && <p className="account-notice" role="alert">{notice}</p>}
      {state === "signed-in" ? children : (
        <section className="login-test-panel" aria-labelledby="login-test-title">
          <div>
            <p className="step-kicker">{authTestMode ? "AI 사용 비용 없는 시험" : "서비스 시작"}</p>
            <h2 id="login-test-title">{authTestMode ? "구글 로그인 시험" : "구글 계정으로 시작하기"}</h2>
            <p>{authTestMode ? "로그인 후 사주 계산을 시험할 수 있습니다. Gemini 해석 요청은 막았습니다." : "사주 서비스를 이용하려면 먼저 구글 계정으로 로그인해 주세요."}</p>
          </div>
          {state === "loading" ? (
            <p role="status">로그인 상태를 확인하는 중입니다…</p>
          ) : (
            <button type="button" onClick={onSignIn} disabled={busy}>Google로 로그인</button>
          )}
          {notice && <p className="error" role="alert">{notice}</p>}
        </section>
      )}
    </>
  );
}

export default function LoginTestPanel({ authTestMode, children }: { authTestMode: boolean; children: ReactNode }) {
  const [state, setState] = useState<LoginState>("loading");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("auth") === "error") {
      setNotice("구글 로그인이 완료되지 않았습니다. 다시 시도해 주세요.");
    }
    try {
      const supabase = createClient();
      void supabase.auth.getUser().then(({ data, error }) => {
        if (!active) return;
        if (error && error.name !== "AuthSessionMissingError") setNotice("로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
        setEmail(data.user?.email ?? "");
        setState(data.user ? "signed-in" : "signed-out");
      }).catch(() => {
        if (!active) return;
        setNotice("로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
        setState("signed-out");
      });
      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (!active) return;
        if (event === "SIGNED_OUT") {
          setEmail("");
          setState("signed-out");
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          window.setTimeout(() => {
            void supabase.auth.getUser().then(({ data, error }) => {
              if (!active) return;
              if (error || !data.user) {
                setEmail("");
                setState("signed-out");
              } else {
                setEmail(data.user.email ?? "");
                setState("signed-in");
              }
            }).catch(() => {
              if (!active) return;
              setEmail("");
              setState("signed-out");
              setNotice("로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
            });
          }, 0);
        }
      });
      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      setNotice("Supabase 연결 설정을 확인해 주세요.");
      setState("signed-out");
      return () => { active = false; };
    }
  }, []);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setNotice("구글 로그인을 시작하지 못했습니다. Supabase의 Google 설정을 확인해 주세요.");
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setEmail("");
      setState("signed-out");
      setNotice("이 브라우저에서 로그아웃했습니다.");
    } catch {
      setNotice("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return <AuthView state={state} email={email} notice={notice} busy={busy} authTestMode={authTestMode} onSignIn={signIn} onSignOut={signOut}>{children}</AuthView>;
}
