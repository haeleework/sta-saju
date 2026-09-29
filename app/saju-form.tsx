"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { calculate, InputError, type SajuChart, type SajuInput } from "../lib/saju/chart";
import { describeElementDistribution, ELEMENT_ORDER, getChartCells, type Element } from "../lib/saju/chart-presentation";
import { analyzeAdvancedReading } from "../lib/saju/advanced-reading";
import { analyzeDayMaster } from "../lib/saju/strength";
import {
  calculateFortuneCycles,
  type FortuneCycles,
  type FortuneGender,
  type FortuneRelation,
} from "../lib/saju/fortune-cycles";
import {
  isSajuChart,
  parseBaseReading,
  parseTopicReading,
  READING_TOPICS,
  type BaseReading,
  type ReadingRequest,
  type ReadingTopic,
} from "../lib/saju/reading";
import type { SavedReading } from "../lib/saju/saved-reading";
import {
  ACCOUNT_READING_PAGE_SIZE,
  areSajuChartsEqual,
  deleteAccountReading,
  loadAccountReadings,
  saveAccountReading,
  type AccountSavedReading,
} from "../lib/saju/account-reading-storage";
import { createClient } from "../lib/supabase/client";

const topics = [
  { id: "strength", name: "성격·강점", hint: "나를 이해하는 단서" },
  { id: "relationship", name: "연애·관계", hint: "관계를 바라보는 질문" },
  { id: "career", name: "일·진로", hint: "일의 방향에 대한 고민" },
  { id: "money", name: "재물", hint: "돈과 선택에 관한 관심" },
] as const;

const elementClass: Record<Element, string> = {
  목: "wood", 화: "fire", 토: "earth", 금: "metal", 수: "water",
};

type BirthInput = Pick<SajuInput, "date" | "time">;
type Pending = "base" | "topic" | null;
type AccountPending = "load" | "save" | `delete:${number}` | null;

async function requestReading(input: ReadingRequest): Promise<{ chart: SajuChart; reading: unknown }> {
  let response: Response;
  try {
    response = await fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("해석 서비스에 연결하지 못했습니다. 다시 시도해 주세요.");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("해석 서비스의 응답을 확인할 수 없습니다. 다시 시도해 주세요.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("해석 서비스의 응답을 확인할 수 없습니다.");
  }
  const result = data as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "해석을 만들지 못했습니다. 다시 시도해 주세요.");
  }
  if (!isSajuChart(result.chart)) throw new Error("계산 결과를 확인할 수 없습니다. 다시 시도해 주세요.");
  return { chart: result.chart, reading: result.reading };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "해석을 만들지 못했습니다. 다시 시도해 주세요.";
}

function relationText(relation: FortuneRelation): string {
  return `${relation.element} 기운 · ${relation.label}`;
}

function fortuneDateText(value: string): string {
  const [date, time] = value.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일 ${time}`;
}

function offsetText(offset: FortuneCycles["startOffset"]): string {
  return [
    offset.years && `${offset.years}년`,
    offset.months && `${offset.months}개월`,
    offset.days && `${offset.days}일`,
    offset.hours && `${offset.hours}시간`,
  ].filter(Boolean).join(" ") || "출생 직후";
}

export default function SajuForm({ readingDisabled = false }: { readingDisabled?: boolean }) {
  const [chart, setChart] = useState<SajuChart | null>(null);
  const [fortune, setFortune] = useState<FortuneCycles | null>(null);
  const [birthInput, setBirthInput] = useState<BirthInput | null>(null);
  const [currentEntry, setCurrentEntry] = useState<SavedReading | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<ReadingTopic | null>(null);
  const [accountReadings, setAccountReadings] = useState<AccountSavedReading[]>([]);
  const [aliasDraft, setAliasDraft] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [accountPending, setAccountPending] = useState<AccountPending>("load");
  const [accountHasMore, setAccountHasMore] = useState(false);
  const [accountLoadFailed, setAccountLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [baseError, setBaseError] = useState("");
  const [topicError, setTopicError] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const accountRef = useRef<AccountSavedReading[]>([]);
  const accountRowsReadRef = useRef(0);
  const pendingRef = useRef(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    try {
      const client = createClient();
      void loadAccountReadings(client).then((page) => {
        if (!active) return;
        accountRef.current = page.entries;
        accountRowsReadRef.current = page.rowsRead;
        setAccountReadings(page.entries);
        setAccountHasMore(page.hasMore);
        setAccountLoadFailed(false);
        setAccountNotice(page.invalidCount > 0
          ? `읽을 수 없는 계정 결과 ${page.invalidCount}건은 목록에서 제외했습니다. 원본 자료는 변경하지 않았습니다.`
          : "");
      }).catch(() => {
        if (!active) return;
        setAccountLoadFailed(true);
        setAccountNotice("계정 저장 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
      }).finally(() => {
        if (active) setAccountPending(null);
      });
    } catch {
      setAccountLoadFailed(true);
      setAccountNotice("Supabase 연결 설정을 확인해 주세요.");
      setAccountPending(null);
    }
    return () => { active = false; };
  }, []);

  function updateAccountEntry(entry: AccountSavedReading) {
    const alreadyLoaded = accountRef.current.some((item) => item.databaseId === entry.databaseId);
    const next = [entry, ...accountRef.current.filter((item) => item.databaseId !== entry.databaseId)]
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    if (!alreadyLoaded) accountRowsReadRef.current += 1;
    accountRef.current = next;
    setAccountReadings(next);
  }

  async function handleSaveAccount(entry: SavedReading, automatic = false) {
    if (accountPending) return;
    setAccountPending("save");
    setAccountNotice(automatic ? "새 주제 해석을 계정 저장 결과에 반영하는 중입니다…" : "계정에 저장하는 중입니다…");
    try {
      const aliasToSave = automatic
        ? accountRef.current.find((item) => item.id === entry.id)?.alias ?? null
        : aliasDraft;
      const saved = await saveAccountReading(createClient(), entry, aliasToSave);
      updateAccountEntry(saved);
      if (!automatic) setAliasDraft(saved.alias ?? "");
      setAccountNotice(automatic
        ? "새 주제 해석을 계정 저장 결과에 반영했습니다."
        : "현재 결과를 계정에 저장했습니다. 같은 결과를 다시 저장해도 한 건으로 유지됩니다.");
    } catch (caught) {
      setAccountNotice(caught instanceof Error ? caught.message : "계정에 저장되지 않았습니다. 다시 시도해 주세요.");
    } finally {
      setAccountPending(null);
    }
  }

  async function handleLoadMoreAccountReadings() {
    if (accountPending) return;
    setAccountPending("load");
    setAccountNotice("");
    try {
      const page = await loadAccountReadings(createClient(), accountRowsReadRef.current, ACCOUNT_READING_PAGE_SIZE);
      const known = new Set(accountRef.current.map((entry) => entry.databaseId));
      const next = [...accountRef.current, ...page.entries.filter((entry) => !known.has(entry.databaseId))];
      accountRef.current = next;
      accountRowsReadRef.current += page.rowsRead;
      setAccountReadings(next);
      setAccountHasMore(page.hasMore);
      if (page.invalidCount > 0) {
        setAccountNotice(`읽을 수 없는 계정 결과 ${page.invalidCount}건은 목록에서 제외했습니다. 원본 자료는 변경하지 않았습니다.`);
      }
    } catch (caught) {
      setAccountNotice(caught instanceof Error ? caught.message : "계정 저장 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setAccountPending(null);
    }
  }

  async function handleReloadAccountReadings() {
    if (accountPending) return;
    setAccountPending("load");
    setAccountNotice("");
    try {
      const page = await loadAccountReadings(createClient());
      accountRef.current = page.entries;
      accountRowsReadRef.current = page.rowsRead;
      setAccountReadings(page.entries);
      setAccountHasMore(page.hasMore);
      setAccountLoadFailed(false);
      setAccountNotice(page.invalidCount > 0
        ? `읽을 수 없는 계정 결과 ${page.invalidCount}건은 목록에서 제외했습니다. 원본 자료는 변경하지 않았습니다.`
        : "계정 저장 결과를 다시 불러왔습니다.");
    } catch (caught) {
      setAccountLoadFailed(true);
      setAccountNotice(caught instanceof Error ? caught.message : "계정 저장 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setAccountPending(null);
    }
  }

  function handleOpenAccount(entry: AccountSavedReading) {
    requestSequence.current += 1;
    pendingRef.current = false;
    setPending(null);
    setChart(entry.chart);
    setFortune(null);
    setBirthInput(null);
    setCurrentEntry({ id: entry.id, createdAt: entry.createdAt, chart: entry.chart, base: entry.base, topics: entry.topics });
    setAliasDraft(entry.alias ?? "");
    setSelectedTopic(null);
    setError("");
    setBaseError("");
    setTopicError("");
    setAccountNotice("계정에 저장한 결과를 열었습니다. 새 주제 해석에는 출생 정보를 다시 입력해야 합니다.");
  }

  async function handleDeleteAccount(entry: AccountSavedReading) {
    const label = entry.alias || `${new Date(entry.savedAt).toLocaleString("ko-KR")}에 계정에 저장한 ${entry.chart.pillars[2].korean}일주 결과`;
    if (!window.confirm(`${label}를 계정에서 삭제할까요?`)) return;
    if (accountPending) return;
    setAccountPending(`delete:${entry.databaseId}`);
    setAccountNotice("");
    try {
      await deleteAccountReading(createClient(), entry.databaseId);
      const next = accountRef.current.filter((item) => item.databaseId !== entry.databaseId);
      accountRef.current = next;
      accountRowsReadRef.current = Math.max(0, accountRowsReadRef.current - 1);
      setAccountReadings(next);
      setAccountNotice("선택한 결과를 계정에서 삭제했습니다.");
    } catch (caught) {
      setAccountNotice(caught instanceof Error ? caught.message : "계정 저장 결과를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setAccountPending(null);
    }
  }

  function showEntry(entry: SavedReading) {
    setCurrentEntry(entry);
    setAliasDraft(accountRef.current.find((item) => item.id === entry.id)?.alias ?? "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestSequence.current += 1;
    pendingRef.current = false;
    setPending(null);
    const data = new FormData(event.currentTarget);
    const input: SajuInput = {
      date: String(data.get("date") || ""),
      time: String(data.get("time") || ""),
      calendar: "solar",
      topic: "general",
      question: "",
    };
    const gender = String(data.get("gender") || "") as FortuneGender;
    setFortune(null);
    setBirthInput(null);
    setSelectedTopic(null);
    setBaseError("");
    setTopicError("");

    try {
      const calculated = calculate(input);
      const nextFortune = calculateFortuneCycles(
        { date: input.date, time: input.time, gender },
        calculated,
      );
      const reopenedEntryMatches = currentEntry !== null && areSajuChartsEqual(currentEntry.chart, calculated);
      setChart(calculated);
      setFortune(nextFortune);
      setBirthInput({ date: input.date, time: input.time });
      setSelectedTopic(null);
      if (reopenedEntryMatches && currentEntry) {
        if (accountRef.current.some((entry) => entry.id === currentEntry.id)) {
          setAccountNotice("다시 입력한 정보의 사주 구성이 계정 결과와 같습니다. 새 주제 해석을 이어서 만들 수 있습니다.");
        } else {
          setAccountNotice("현재 화면의 사주 구성과 같습니다. 새 주제 해석을 이어서 만들 수 있습니다.");
        }
      } else {
        setCurrentEntry(null);
        setAliasDraft("");
        setAccountNotice("");
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof InputError ? caught.message : "계산하지 못했습니다. 입력을 확인해 주세요.");
    }
  }

  async function handleBaseReading() {
    if (!birthInput || pendingRef.current || readingDisabled) return;
    pendingRef.current = true;
    const sequence = ++requestSequence.current;
    setPending("base");
    setBaseError("");
    try {
      const response = await requestReading({ ...birthInput, kind: "base" });
      if (sequence !== requestSequence.current) return;
      const base = parseBaseReading(response.reading);
      if (!base) throw new Error("해석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.");
      const entry: SavedReading = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        chart: response.chart,
        base,
        topics: {},
      };
      setChart(response.chart);
      setSelectedTopic(null);
      showEntry(entry);
    } catch (caught) {
      if (sequence === requestSequence.current) setBaseError(message(caught));
    } finally {
      if (sequence === requestSequence.current) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  }

  async function handleTopicSelection(topic: ReadingTopic) {
    if (pendingRef.current) return;
    setSelectedTopic(topic);
    setTopicError("");
    if (!currentEntry) {
      setTopicError("먼저 기본 해석을 만들어 주세요.");
      return;
    }
    if (currentEntry.topics[topic]) return;
    if (readingDisabled) {
      setTopicError("로그인 시험 중에는 새 AI 해석을 만들지 않습니다.");
      return;
    }
    if (!birthInput) {
      setTopicError("새 주제의 해석을 만들려면 생년월일과 출생시간을 다시 입력해 주세요. 저장된 결과는 그대로 남아 있습니다.");
      return;
    }

    pendingRef.current = true;
    const sequence = ++requestSequence.current;
    setPending("topic");
    try {
      const response = await requestReading({ ...birthInput, kind: "topic", topic });
      if (sequence !== requestSequence.current) return;
      const reading = parseTopicReading(response.reading, topic);
      if (!reading) throw new Error("주제 해석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.");
      const updated = { ...currentEntry, topics: { ...currentEntry.topics, [topic]: reading } };
      showEntry(updated);
      if (accountRef.current.some((entry) => entry.id === updated.id)) {
        await handleSaveAccount(updated, true);
      }
    } catch (caught) {
      if (sequence === requestSequence.current) setTopicError(message(caught));
    } finally {
      if (sequence === requestSequence.current) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  }

  const baseReading: BaseReading | null = currentEntry?.base ?? null;
  const selectedReading = selectedTopic ? currentEntry?.topics[selectedTopic] : null;
  const assessment = chart ? analyzeDayMaster(chart) : null;
  const advancedReading = chart ? analyzeAdvancedReading(chart) : null;
  const chartCells = chart ? getChartCells(chart) : [];

  return (
    <div className="journey">
      <section className="step-section" aria-labelledby="input-title">
        <div className="step-heading">
          <span className="step-number">01</span>
          <div>
            <p className="step-kicker">먼저, 기본 정보</p>
            <h2 id="input-title">언제 태어나셨나요?</h2>
          </div>
        </div>
        <div className="input-card">
          <p className="form-intro">양력 생년월일과 태어난 시간을 입력해 주세요. 현재는 출생시간을 아는 경우만 계산할 수 있습니다. 성별은 전통 규칙에 따라 대운의 진행 방향을 정할 때만 사용합니다.</p>
          <form onSubmit={handleSubmit}>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="date">생년월일</label>
                <input id="date" name="date" type="date" min="1990-01-01" required />
                <small>양력 · 1990년 이후</small>
              </div>
              <div className="field">
                <label htmlFor="time">출생시간</label>
                <input id="time" name="time" type="time" required />
                <small>시·분을 선택해 주세요</small>
              </div>
              <div className="field">
                <label htmlFor="gender">성별</label>
                <select id="gender" name="gender" defaultValue="" required>
                  <option value="" disabled>선택해 주세요</option>
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                </select>
                <small>성격을 판단하는 값으로 쓰지 않아요</small>
              </div>
            </div>
            <button className="primary-button" type="submit">
              기본 사주 확인하기 <span aria-hidden="true">→</span>
            </button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </section>

      {chart && (
        <>
          <section className="step-section" aria-labelledby="result-title">
            <div className="step-heading">
              <span className="step-number">02</span>
              <div>
                <p className="step-kicker">계산된 기본 정보</p>
                <h2 id="result-title">나의 사주 구성</h2>
              </div>
            </div>
            <div className="result-card">
              <p className="chart-intro">네 기둥의 윗글자와 아랫글자를 각각 한 칸에 담았습니다. <strong>일주 윗글자</strong>가 나를 대표하는 일간입니다.</p>
              <div className="chart-column-headings" aria-hidden="true">
                {chart.pillars.map((pillar) => <span key={pillar.label}>{pillar.label}</span>)}
              </div>
              <p className="chart-row-label">윗글자 · 천간</p>
              <div className="chart-character-row" aria-label="사주 윗글자 네 칸">
                {chartCells.slice(0, 4).map((cell) => (
                  <div className={`chart-character element-${elementClass[cell.element]}${cell.pillarLabel === "일주" ? " is-day-master" : ""}`} key={`${cell.pillarLabel}-${cell.position}`} aria-label={`${cell.pillarLabel} 윗글자 ${cell.character} ${cell.korean} ${cell.element}`}>
                    <span className="chart-hanja">{cell.character}</span>
                    <span className="chart-hangul">{cell.korean}</span>
                    <span className="chart-element-name">{cell.element}</span>
                  </div>
                ))}
              </div>
              <p className="chart-row-label">아랫글자 · 지지</p>
              <div className="chart-character-row" aria-label="사주 아랫글자 네 칸">
                {chartCells.slice(4).map((cell) => (
                  <div className={`chart-character element-${elementClass[cell.element]}`} key={`${cell.pillarLabel}-${cell.position}`} aria-label={`${cell.pillarLabel} 아랫글자 ${cell.character} ${cell.korean} ${cell.element}`}>
                    <span className="chart-hanja">{cell.character}</span>
                    <span className="chart-hangul">{cell.korean}</span>
                    <span className="chart-element-name">{cell.element}</span>
                  </div>
                ))}
              </div>
              <section className="element-distribution" aria-labelledby="element-distribution-title">
                <h3 id="element-distribution-title">다섯 기운이 보이는 모습</h3>
                <p>오행은 나무·불·흙·쇠·물처럼 서로 다른 성질을 가리킵니다. 막대는 여덟 글자에서 보이는 개수입니다.</p>
                <div className="element-bars">
                  {ELEMENT_ORDER.map((element) => (
                    <div className="element-bar-row" key={element}>
                      <span className="element-bar-label">{element}</span>
                      <div className="element-bar-track" role="meter" aria-label={`${element} 오행`} aria-valuemin={0} aria-valuemax={8} aria-valuenow={chart.elements[element]}>
                        <div className={`element-bar-fill element-${elementClass[element]}`} style={{ width: `${chart.elements[element] / 8 * 100}%` }} />
                      </div>
                      <span className="element-bar-count">{chart.elements[element]}개</span>
                    </div>
                  ))}
                </div>
                <p className="distribution-note">지지의 숨은 글자와 태어난 계절의 가중치는 이 막대에 넣지 않았습니다. 개수만으로 강약이나 성격이 정해지지는 않습니다.</p>
                <div className="distribution-reading">
                  <strong>이 구성을 어떻게 읽을까요?</strong>
                  <p>{describeElementDistribution(chart)}</p>
                </div>
              </section>
              {advancedReading && (
                <section className="advanced-reading" aria-labelledby="advanced-reading-title">
                  <h3 id="advanced-reading-title">글자 관계를 한 걸음 더 보기</h3>
                  <p>십성은 나를 나타내는 <strong>일간</strong>과 다른 글자가 어떤 역할로 만나는지 붙인 열 가지 이름입니다. 여기서는 전문 이름보다 쉬운 뜻을 먼저 읽어 보세요.</p>
                  <div className="day-master-basis">
                    기준 글자 <strong>{advancedReading.dayMaster.character} · {advancedReading.dayMaster.element}</strong> — 태어난 날의 윗글자로, 나를 바라보는 기준입니다.
                  </div>
                  <ul className="ten-god-list" aria-label="일간과 주변 일곱 글자의 십성 관계">
                    {advancedReading.tenGods.map((item) => (
                      <li key={`${item.pillarLabel}-${item.position}`}>
                        <span className="ten-god-position">{item.pillarLabel} {item.position} · {item.character}</span>
                        <strong>{item.easyRole}</strong>
                        <span className="ten-god-name">전문 이름: {item.name}{item.position === "아랫글자" ? ` · 중심 숨은 글자 ${item.basisStem} 기준` : ""}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pair-reading">
                    <h4>어울리거나 부딪히는 글자</h4>
                    <p>합은 서로 연결되는 짝, 충은 서로 다른 방향으로 움직이는 짝이라는 뜻입니다. 좋고 나쁨이나 실제 사건을 정해 주지는 않습니다.</p>
                    {advancedReading.pairRelations.length ? (
                      <ul>
                        {advancedReading.pairRelations.map((relation, index) => (
                          <li key={`${relation.kind}-${relation.first.pillarLabel}-${relation.second.pillarLabel}-${index}`}>
                            <strong>{relation.kind === "지지충" ? "부딪히는 짝" : "어울리는 짝"}</strong>
                            {` · ${relation.first.pillarLabel} ${relation.first.character} + ${relation.second.pillarLabel} ${relation.second.character} — ${relation.easyMeaning}`}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="no-pair">이번 여덟 글자에서는 이 범위에 해당하는 짝을 찾지 못했습니다.</p>}
                  </div>
                  <div className="advanced-summary">
                    <strong>함께 읽으면</strong>
                    <p>{advancedReading.summary}</p>
                  </div>
                </section>
              )}
              {assessment && (
                <details className="assessment" aria-label="일간 뒷받침 계산 근거">
                  <summary>판단에 사용한 계산 근거 살펴보기</summary>
                  <h3>나를 대표하는 글자의 뒷받침</h3>
                  <p>일간은 나를 대표하는 한 글자입니다. 아래는 전통 명리 규칙을 간단히 적용한 첫 판단이며, 성격이나 미래를 확정하지 않습니다.</p>
                  <strong>{assessment.verdict === "supported" ? "받쳐 주는 단서가 많습니다" : assessment.verdict === "unsupported" ? "받쳐 주는 단서가 적습니다" : "단서가 엇갈려 판단을 보류합니다"}</strong>
                  <ul>
                    <li>계절: 태어난 달의 글자가 나타내는 {assessment.seasonElement} 기운은 일간을 {assessment.seasonSupport ? "돕습니다" : "직접 돕지 않습니다"}.</li>
                    <li>뿌리: 땅에 해당하는 네 글자 속의 숨은 재료(지장간)에 같은 오행이 {assessment.roots.length ? `${assessment.roots.map((root) => root.label).join("·")}에서 보입니다` : "보이지 않습니다"}.</li>
                    <li>다른 글자: 일간을 제외한 일곱 글자 중 돕는 쪽 {assessment.visible.support}개, 기운을 쓰는 쪽 {assessment.visible.drain}개, 제어하는 쪽 {assessment.visible.control}개입니다.</li>
                  </ul>
                  <p className="assessment-note">위의 합·충은 별도 단서로 보여주며, 성립 강도까지 판단하지 않아 이 1차 결론을 자동으로 바꾸지는 않습니다.</p>
                </details>
              )}
              <p className="calculation-note">계산 기준: {chart.method}</p>
            </div>
            {fortune && (
              <section className="fortune-card" aria-labelledby="fortune-title">
                <div className="fortune-heading">
                  <div>
                    <p className="step-kicker">시간에 따라 바뀌는 계산값</p>
                    <h3 id="fortune-title">대운과 세운의 흐름</h3>
                  </div>
                  <span className="fortune-direction">{fortune.direction === "forward" ? "순행" : "역행"}</span>
                </div>
                <p><strong>대운</strong>은 약 10년씩 이어지는 큰 흐름이고, <strong>세운</strong>은 한 해씩 바뀌는 흐름입니다. 아래 내용은 계산된 글자와 일간의 기본 오행 관계이며, 실제 사건을 예언하는 말이 아닙니다.</p>
                <div className="fortune-basis">
                  <p><strong>진행 방향:</strong> {fortune.directionReason}</p>
                  <p><strong>첫 대운 시작:</strong> 태어난 뒤 약 {offsetText(fortune.startOffset)}, {fortuneDateText(fortune.firstStartDate)}경(한국 표준시)</p>
                  <p>{fortune.ageMethod}</p>
                </div>
                {fortune.currentPeriod ? (
                  <>
                    <div className="current-fortune">
                      <span>{fortune.referenceYear}년이 속한 대운</span>
                      <strong>{fortune.currentPeriod.ganZhi || "첫 대운 시작 전"} · {fortune.currentPeriod.startYear}–{fortune.currentPeriod.endYear}년</strong>
                      <small>나이 {fortune.currentPeriod.startAge}–{fortune.currentPeriod.endAge}세 · 세는나이 기준</small>
                      {fortune.currentPeriod.stemRelation && fortune.currentPeriod.branchRelation && (
                        <p>윗글자는 {relationText(fortune.currentPeriod.stemRelation)}, 아랫글자는 {relationText(fortune.currentPeriod.branchRelation)}로 읽습니다.</p>
                      )}
                    </div>
                    <div className="annual-fortunes" aria-label="현재 대운의 세운 목록">
                      {fortune.annual.map((year) => (
                        <article className={`annual-fortune${year.year === fortune.referenceYear ? " is-current" : ""}`} key={year.year}>
                          <span>{year.year}년{year.year === fortune.referenceYear ? " · 현재" : ""}</span>
                          <strong>{year.ganZhi}</strong>
                          <small>{year.age}세 · 세는나이</small>
                          <p>윗글자: {relationText(year.stemRelation)}</p>
                          <p>아랫글자: {relationText(year.branchRelation)}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="fortune-unavailable">{fortune.referenceYear}년은 계산된 대운 범위에 포함되지 않습니다.</p>
                )}
                <p className="fortune-note">세운의 해 이름은 입춘을 기준으로 바뀝니다. 위의 십성과 합·충은 대운·세운의 길흉을 정하는 데 사용하지 않았습니다.</p>
              </section>
            )}
          </section>

          <section className="step-section" aria-labelledby="reading-title">
            <div className="step-heading">
              <span className="step-number">03</span>
              <div>
                <p className="step-kicker">Gemini가 작성하는 이야기</p>
                <h2 id="reading-title">쉬운 말로 보는 기본 해석</h2>
              </div>
            </div>
            {!baseReading && (
              <div className="reading-callout">
                <p>{readingDisabled ? "로그인 시험 중에는 Gemini 요청을 보내지 않습니다. 기존 저장 결과는 아래에서 볼 수 있습니다." : "버튼을 누르면 계산된 사주 구성이 Google Gemini로 전송되어 해석 문장이 만들어집니다. 원본 생년월일과 출생시간은 보내지 않습니다."}</p>
                <button className="primary-button" type="button" disabled={readingDisabled || pending !== null || !birthInput} onClick={handleBaseReading}>
                  {readingDisabled ? "해석 만들기 일시 중지" : pending === "base" ? "해석 만드는 중…" : "해석 만들기"}
                </button>
                {!birthInput && <p className="supporting-note">새 해석을 만들려면 출생 정보를 다시 입력해 주세요.</p>}
              </div>
            )}
            {baseError && <p className="error" role="alert">{baseError}</p>}
            {baseReading && (
              <article className="reading-card" aria-label="AI 기본 해석">
                <span className="reading-badge">AI 해석</span>
                <p className="reading-summary">{baseReading.summary}</p>
                <ul>{baseReading.highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>
                <p className="reading-caution">{baseReading.caution}</p>
              </article>
            )}
          </section>

          <section className="step-section" aria-labelledby="topic-title">
            <div className="step-heading">
              <span className="step-number">04</span>
              <div>
                <p className="step-kicker">다음으로 궁금한 것</p>
                <h2 id="topic-title">어떤 이야기를 먼저 보고 싶으세요?</h2>
              </div>
            </div>
            <p className="topic-intro">기본 해석을 만든 뒤 주제를 선택하면 자세한 해석을 볼 수 있습니다.</p>
            <div className="topic-grid" role="group" aria-label="관심 주제 선택">
              {topics.map((topic, index) => (
                <button
                  key={topic.id}
                  type="button"
                  className={`topic-card${selectedTopic === topic.id ? " is-selected" : ""}`}
                  aria-pressed={selectedTopic === topic.id}
                  disabled={pending !== null}
                  onClick={() => handleTopicSelection(topic.id)}
                >
                  <span className="topic-index">0{index + 1}</span>
                  <span className="topic-name">{topic.name}</span>
                  <span className="topic-hint">{topic.hint}</span>
                  <span className="topic-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            {pending === "topic" && <p className="loading-note" role="status">{selectedTopic && READING_TOPICS[selectedTopic]} 해석을 만드는 중입니다…</p>}
            {topicError && <p className="error" role="alert">{topicError}</p>}
            {selectedReading && (
              <article className="topic-preview" aria-label="AI 주제별 해석">
                <span className="reading-badge">AI 해석 · {READING_TOPICS[selectedReading.topic]}</span>
                <h3>{selectedReading.title}</h3>
                <p>{selectedReading.reading}</p>
                <p className="reflection-question">생각해 볼 질문: {selectedReading.reflectionQuestion}</p>
              </article>
            )}
          </section>
        </>
      )}

      <section className="step-section" aria-labelledby="account-saved-title">
        <div className="step-heading">
          <span className="step-number">05</span>
          <div>
            <p className="step-kicker">내 계정에 저장</p>
            <h2 id="account-saved-title">다른 기기에서도 다시 보기</h2>
          </div>
        </div>
        <p className="topic-intro">현재 보고 있는 결과를 계정에 직접 저장해 주세요. 저장하지 않은 결과는 화면을 떠나면 다시 볼 수 없습니다.</p>
        {currentEntry && (
          <>
            <div className="field"><label htmlFor="reading-alias">이 결과의 별칭 (선택)</label><input id="reading-alias" type="text" maxLength={30} value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder="예: 내 사주, 친구 사주" /><small>실명 대신 알아보기 쉬운 이름을 써도 됩니다. 해석 생성에는 사용하지 않습니다.</small></div>
            <button className="account-save-button" type="button" disabled={accountPending !== null} onClick={() => handleSaveAccount(currentEntry)}>
              {accountPending === "save" ? "계정에 저장하는 중…" : accountReadings.some((entry) => entry.id === currentEntry.id) ? "계정 저장 결과 업데이트" : "현재 결과를 계정에 저장"}
            </button>
          </>
        )}
        {accountNotice && <p className="storage-notice" role="status">{accountNotice}</p>}
        {accountPending === "load" && accountReadings.length === 0 ? (
          <div className="empty-saved" role="status">계정 저장 결과를 불러오는 중입니다…</div>
        ) : accountReadings.length === 0 ? (
          <div className="empty-saved">
            {accountLoadFailed ? "계정 저장 결과를 불러오지 못했습니다." : "아직 계정에 저장한 해석이 없습니다."}
            {accountLoadFailed && <button className="inline-retry-button" type="button" onClick={handleReloadAccountReadings}>다시 불러오기</button>}
          </div>
        ) : (
          <>
            <ul className="saved-list">
              {accountReadings.map((entry) => (
                <li key={entry.databaseId}>
                  <div>
                    <strong>{entry.alias || `${entry.chart.pillars[2].korean}일주`}</strong>
                    <span>{entry.chart.pillars[2].korean}일주 · {new Date(entry.savedAt).toLocaleString("ko-KR")} 계정 저장</span>
                  </div>
                  <div className="saved-actions">
                    <button type="button" disabled={accountPending !== null} onClick={() => handleOpenAccount(entry)}>열기</button>
                    <button type="button" disabled={accountPending !== null} onClick={() => handleDeleteAccount(entry)}>{accountPending === `delete:${entry.databaseId}` ? "삭제 중…" : "삭제"}</button>
                  </div>
                </li>
              ))}
            </ul>
            {accountHasMore && <button className="load-more-button" type="button" disabled={accountPending !== null} onClick={handleLoadMoreAccountReadings}>계정 결과 더 보기</button>}
            {accountLoadFailed && <button className="load-more-button" type="button" disabled={accountPending !== null} onClick={handleReloadAccountReadings}>처음부터 다시 불러오기</button>}
          </>
        )}
      </section>

    </div>
  );
}
