"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { loadAccountReadings, type AccountSavedReading } from "../lib/saju/account-reading-storage";
import { createClient } from "../lib/supabase/client";
import type { DailyFortuneReading } from "../lib/saju/daily-fortune";
import { requestJson } from "../lib/saju/daily-fortune-http";

type Profile = {
  birth_date: string;
  birth_time: string;
  gender: "male" | "female";
  source_reading_id: number | null;
};
type FortuneState = { status: string; fortuneDate?: string; fortune?: DailyFortuneReading };
type Mode = "direct" | "saved";

function statusText(status: string): string {
  if (status === "pending") return "오늘의 운세를 오전 9시부터 순서대로 준비합니다.";
  if (status === "processing") return "오늘의 운세를 가져오는 중이에요. 순서대로 준비 중이니 잠시만 기다려 주세요.";
  if (status === "limited") return "오늘의 운세 생성 한도에 도달했습니다. 내일 다시 확인해 주세요.";
  if (status === "stale") return "내 사주 정보가 바뀌어 이전 운세를 보여주지 않습니다. 새 정보의 운세는 내일부터 준비됩니다.";
  if (status === "failed") return "오늘의 운세를 준비하는 데 문제가 생겼어요. 잠시 후 다시 확인해 주세요.";
  return "오늘의 운세를 확인할 수 없습니다.";
}

export default function DailyFortunePanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fortune, setFortune] = useState<FortuneState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("direct");
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [gender, setGender] = useState<"male" | "female">("female");
  const [selectedId, setSelectedId] = useState("");
  const [saved, setSaved] = useState<AccountSavedReading[]>([]);
  const [savedHasMore, setSavedHasMore] = useState(false);
  const [savedRowsRead, setSavedRowsRead] = useState(0);
  const [savedNotice, setSavedNotice] = useState("");
  const [showResult, setShowResult] = useState(false);

  const refreshFortune = useCallback(async () => {
    try {
      const result = await requestJson("/api/daily-fortune");
      setFortune(result as FortuneState);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "오늘의 운세를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestJson("/api/daily-fortune/profile").then(async (result) => {
      if (!active) return;
      const item = result.profile as Profile | null;
      setProfile(item);
      if (!item) setShowDialog(true);
      else await refreshFortune();
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? error.message : "내 사주 정보를 불러오지 못했습니다.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshFortune]);

  useEffect(() => {
    if (fortune?.status !== "processing" && fortune?.status !== "pending") return;
    const timer = window.setInterval(() => { void refreshFortune(); }, 5000);
    return () => window.clearInterval(timer);
  }, [fortune?.status, refreshFortune]);

  async function openForm(nextMode: Mode, isEdit = false) {
    setMode(nextMode);
    setEditing(isEdit);
    setFormOpen(true);
    setNotice("");
    setShowDialog(false);
    if (isEdit && profile) {
      setDate(profile.birth_date);
      setTime(profile.birth_time.slice(0, 5));
      setGender(profile.gender);
    }
    if (nextMode === "saved") {
      setSelectedId("");
      setSaved([]);
      setSavedNotice("계정에 저장한 결과를 확인하는 중입니다…");
      try {
        const page = await loadAccountReadings(createClient());
        setSaved(page.entries);
        setSavedHasMore(page.hasMore);
        setSavedRowsRead(page.rowsRead);
        setSavedNotice(page.entries.length
          ? "결과를 고르면 사주 8글자를 가져옵니다. 과거 결과에는 출생 정보 원본이 없어, 대운 계산에 필요한 생년월일시와 성별은 다시 입력해야 합니다."
          : page.invalidCount
            ? "저장된 결과가 있지만 현재 형식으로 읽을 수 없습니다. 직접 입력해 주세요."
            : "이 계정에 저장된 사주 결과가 없습니다. 사주 보기에서 결과를 계정에 저장했는지 확인하거나 직접 입력해 주세요.");
      } catch { setSavedNotice("저장된 결과를 불러오지 못했습니다. 직접 입력을 이용해 주세요."); }
    }
  }

  async function loadMoreSaved() {
    try {
      const page = await loadAccountReadings(createClient(), savedRowsRead);
      setSaved((current) => [...current, ...page.entries]);
      setSavedHasMore(page.hasMore);
      setSavedRowsRead((current) => current + page.rowsRead);
    } catch { setSavedNotice("추가 저장 결과를 불러오지 못했습니다. 다시 시도해 주세요."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("내 사주를 저장하고 오늘의 운세 상태를 확인하고 있습니다…");
    try {
      const result = await requestJson("/api/daily-fortune/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time, gender, sourceReadingId: mode === "saved" ? Number(selectedId) : null }),
      });
      setProfile(result.profile as Profile);
      setEditing(false);
      setFormOpen(false);
      setShowDialog(false);
      setShowResult(false);
      await refreshFortune();
      setNotice(result.generation === "waiting_for_nine"
        ? "내 사주를 저장했습니다. 오전 9시부터 오늘의 운세를 준비합니다."
        : result.generation === "limited"
          ? "내 사주를 저장했지만 오늘의 운세 생성 한도에 도달했습니다."
          : result.generation === "missing_key" || result.generation === "claim_failed" || result.generation === "calculation_failed"
            ? "내 사주는 저장됐지만 오늘의 운세 생성 설정을 확인해야 합니다."
            : "내 사주를 저장했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "내 사주를 저장하지 못했습니다.";
      try {
        const check = await requestJson("/api/daily-fortune/profile");
        const current = check.profile as Profile | null;
        const selectedSource = mode === "saved" ? Number(selectedId) : null;
        if (current && current.birth_date === date && current.birth_time.slice(0, 5) === time &&
          current.gender === gender && current.source_reading_id === selectedSource) {
          setProfile(current);
          setEditing(false);
          setFormOpen(false);
          setShowDialog(false);
          setShowResult(false);
          await refreshFortune();
          setNotice("내 사주는 저장됐습니다. 오늘의 운세 상태를 확인해 주세요.");
          return;
        }
      } catch { /* The status check is best-effort; keep the original error. */ }
      setNotice(message);
    } finally { setBusy(false); }
  }

  async function removeProfile() {
    if (!window.confirm("내 사주 정보와 저장된 오늘 운세 내용을 삭제할까요? 일반 사주 해석 저장 결과는 남습니다.")) return;
    setBusy(true);
    try {
      await requestJson("/api/daily-fortune/profile", { method: "DELETE" });
      setProfile(null);
      setFortune(null);
      setShowResult(false);
      setShowDialog(true);
      setFormOpen(false);
      setNotice("내 사주 정보를 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "삭제하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <section className="daily-page" aria-labelledby="daily-title">
      <p className="eyebrow">오늘의 운세</p>
      <h1 id="daily-title">오늘을 읽는<br />작은 힌트</h1>
      <p className="intro">내 사주를 바탕으로 긴 흐름과 올해, 오늘의 흐름을 함께 살펴봅니다.</p>
      {notice && <p className="account-notice" role="status">{notice}</p>}
      {loading && <p role="status">내 사주 정보를 확인하는 중입니다…</p>}

      {showDialog && !loading && (
        <div className="daily-dialog-backdrop">
          <div className="daily-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-dialog-title">
            <h2 id="daily-dialog-title">내 사주 정보를 먼저 입력해주세요!</h2>
            <p>매일 운세를 만들 기준 정보가 필요합니다. 양력 생년월일·출생시간·성별은 내 계정에 저장됩니다.</p>
            <div className="daily-actions">
              <button type="button" onClick={() => void openForm("direct")}>직접 입력</button>
              <button type="button" onClick={() => void openForm("saved")}>저장된 사주 결과에서 가져오기</button>
              <button type="button" onClick={() => setShowDialog(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {!profile && !showDialog && !loading && !formOpen && (
        <div className="result-card daily-card"><p>등록된 내 사주 정보가 없습니다.</p><button type="button" onClick={() => setShowDialog(true)}>내 사주 등록하기</button></div>
      )}

      {formOpen && !loading && (
        <form className="input-card daily-form" onSubmit={(event) => void submit(event)}>
          <h2>{editing ? "내 사주 정보 수정" : "내 사주 정보 등록"}</h2>
          {mode === "saved" && (
            <div className="field">
              <label htmlFor="daily-saved">계정에 저장한 사주 결과</label>
              <select id="daily-saved" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>
                <option value="">결과 선택</option>
                {saved.map((entry) => <option key={entry.databaseId} value={entry.databaseId}>{new Date(entry.createdAt).toLocaleDateString("ko-KR")} · {entry.chart.pillars.map((item) => item.text).join(" ")}</option>)}
              </select>
              <small role="status">{savedNotice}</small>
              {savedHasMore && <button type="button" className="daily-text-button" onClick={() => void loadMoreSaved()}>저장 결과 더 보기</button>}
              <button type="button" className="daily-text-button" onClick={() => { setMode("direct"); setSelectedId(""); }}>직접 입력으로 바꾸기</button>
            </div>
          )}
          {(mode === "direct" || selectedId) && <div className="field-grid">
            <div className="field"><label htmlFor="daily-date">양력 생년월일</label><input id="daily-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="field"><label htmlFor="daily-time">출생시간</label><input id="daily-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></div>
            <div className="field"><label htmlFor="daily-gender">성별</label><select id="daily-gender" value={gender} onChange={(event) => setGender(event.target.value as "male" | "female")}><option value="female">여성</option><option value="male">남성</option></select></div>
          </div>}
          <p className="prototype-note">입력 정보는 매일 운세 계산을 위해 계정 DB에 보관하며, 언제든 수정·삭제할 수 있습니다.</p>
          <button className="primary-button" type="submit" disabled={busy || (mode === "saved" && !selectedId)}>내 사주로 저장하기 <span>→</span></button>
          <button className="daily-text-button" type="button" onClick={() => { setEditing(false); setFormOpen(false); setDate(""); setTime(""); }}>취소</button>
        </form>
      )}

      {profile && !formOpen && (
        <div className="result-card daily-card">
          <div className="daily-card-head"><div><p className="step-kicker">등록된 내 사주</p><h2>{profile.birth_date} · {profile.birth_time.slice(0, 5)}</h2><p>성별: {profile.gender === "male" ? "남성" : "여성"}</p></div><div className="daily-actions"><button type="button" onClick={() => void openForm("direct", true)}>수정</button><button type="button" onClick={() => void removeProfile()} disabled={busy}>삭제</button></div></div>
          {fortune?.status === "ready" && fortune.fortune ? (
            <>
              <button className="primary-button" type="button" onClick={() => setShowResult((value) => !value)}>{showResult ? "운세 닫기" : "오늘의 운세 확인하기"}<span>→</span></button>
              {showResult && <div className="daily-result"><p className="step-kicker">{fortune.fortuneDate} · 오늘의 운세</p><h3>{fortune.fortune.summary}</h3><p><strong>이렇게 읽었어요</strong><br />{fortune.fortune.reason}</p><p><strong>오늘 해볼 일</strong><br />{fortune.fortune.action}</p><small>사주 해석은 참고와 자기 성찰을 위한 내용이며, 미래를 확정하지 않습니다.</small></div>}
            </>
          ) : (
            <div className="daily-status" role="status"><p>{statusText(fortune?.status ?? "pending")}</p><button type="button" onClick={() => void refreshFortune()}>상태 다시 확인</button></div>
          )}
        </div>
      )}
    </section>
  );
}
