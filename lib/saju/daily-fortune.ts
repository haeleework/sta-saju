import lunar from "lunar-javascript";
import { calculate, type SajuChart } from "./chart";
import { calculateFortuneCycles, type FortuneGender, type FortunePeriod, type AnnualFortune, type FortuneRelation } from "./fortune-cycles";
import { analyzeDailySignals, type DailySignals } from "./advanced-reading";

const { Solar } = lunar;
type Element = "목" | "화" | "토" | "금" | "수";
const stems = [..."甲乙丙丁戊己庚辛壬癸"];
const branches = [..."子丑寅卯辰巳午未申酉戌亥"];
const stemElements: Element[] = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const branchElements: Element[] = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
const generates: Record<Element, Element> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const controls: Record<Element, Element> = { 목: "토", 화: "금", 토: "수", 금: "목", 수: "화" };

export type DailyProfileInput = { date: string; time: string; gender: FortuneGender };
export const DAILY_LIMIT = 30;
export type DailyFortuneTopic = { reading: string; tip: string };
export type DailyFortuneDetails = Record<"work" | "people" | "money" | "pace", DailyFortuneTopic>;
export type DailyFortuneClue = { id: string; title: string; why: string; reference: string; action: string; evidence: string };
export type DailyFortuneReading = { summary: string; reason?: string; action?: string; details?: DailyFortuneDetails; clues?: DailyFortuneClue[] };
export type SelectedDailyClue = { id: string; evidence: string };
export type DailyFortuneFacts = {
  fortuneDate: string;
  chart: SajuChart;
  period: FortunePeriod | null;
  annual: AnnualFortune | null;
  dailyGanZhi: string;
  dailyStemRelation: FortuneRelation;
  dailyBranchRelation: FortuneRelation;
  dailySignals: DailySignals;
};

export function kstDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isAfterDailyStart(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour >= 9;
}

function elementOf(char: string): Element {
  const stem = stems.indexOf(char);
  if (stem >= 0) return stemElements[stem];
  const branch = branches.indexOf(char);
  if (branch >= 0) return branchElements[branch];
  throw new Error("오늘의 기운을 계산하지 못했습니다.");
}

function relation(day: Element, other: Element): FortuneRelation {
  if (day === other) return { element: other, label: "나와 비슷한 힘" };
  if (generates[other] === day) return { element: other, label: "나를 받쳐 주는 힘" };
  if (generates[day] === other) return { element: other, label: "생각을 밖으로 표현하는 힘" };
  if (controls[day] === other) return { element: other, label: "계획하고 자원을 다루는 힘" };
  return { element: other, label: "규칙과 책임을 마주하는 힘" };
}

export function calculateDailyFortuneFacts(profile: DailyProfileInput, fortuneDate: string): DailyFortuneFacts {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fortuneDate)) throw new Error("오늘 날짜를 확인할 수 없습니다.");
  const [year, month, day] = fortuneDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("오늘 날짜를 확인할 수 없습니다.");
  }
  const chart = calculate({ date: profile.date, time: profile.time, calendar: "solar", topic: "general", question: "" });
  const cycles = calculateFortuneCycles(profile, chart, year);
  const annual = cycles.annual.find((item) => item.year === year) ?? null;
  const dailyGanZhi = Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar().getDayInGanZhiExact();
  const [stem, branch] = [...dailyGanZhi];
  const dayElement = chart.dayMaster.element as Element;
  return {
    fortuneDate,
    chart,
    period: cycles.currentPeriod,
    annual,
    dailyGanZhi,
    dailyStemRelation: relation(dayElement, elementOf(stem)),
    dailyBranchRelation: relation(dayElement, elementOf(branch)),
    dailySignals: analyzeDailySignals(chart, dailyGanZhi),
  };
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

export function parseDailyFortune(value: unknown, requireDetails = false): DailyFortuneReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const summary = cleanText(item.summary);
  if (!summary) return null;
  if (item.clues !== undefined) {
    if (!Array.isArray(item.clues) || item.clues.length < 2 || item.clues.length > 3) return null;
    const clues: DailyFortuneClue[] = [];
    for (const raw of item.clues) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const clue = raw as Record<string, unknown>;
      const values = ["id", "title", "why", "reference", "action", "evidence"].map((key) => cleanText(clue[key]));
      if (values.some((text) => !text)) return null;
      const [id, title, why, reference, action, evidence] = values as string[];
      if (clues.some((entry) => entry.id === id)) return null;
      clues.push({ id, title, why, reference, action, evidence });
    }
    return { summary, clues };
  }
  const reason = cleanText(item.reason);
  const action = cleanText(item.action);
  if (!summary || !reason || !action) return null;
  const result: DailyFortuneReading = { summary, reason, action };
  if (item.details === undefined) return requireDetails ? null : result;
  if (!item.details || typeof item.details !== "object" || Array.isArray(item.details)) return null;
  const detailValues = item.details as Record<string, unknown>;
  const details = {} as DailyFortuneDetails;
  for (const key of ["work", "people", "money", "pace"] as const) {
    const topic = detailValues[key];
    if (!topic || typeof topic !== "object" || Array.isArray(topic)) return null;
    const reading = cleanText((topic as Record<string, unknown>).reading);
    const tip = cleanText((topic as Record<string, unknown>).tip);
    if (!reading || !tip || (requireDetails && reading.length < 15)) return null;
    details[key] = { reading, tip };
  }
  result.details = details;
  return result;
}

export function selectDailyClues(facts: DailyFortuneFacts): SelectedDailyClue[] {
  const { stemRole, branchRole, natalPairs } = facts.dailySignals;
  const selected = [{ id: "stem-role", evidence: `오늘 천간 ${stemRole.character}의 십성은 ${stemRole.name}: ${stemRole.easyRole}.` }];
  if (stemRole.name !== branchRole.name) {
    selected.push({ id: "branch-role", evidence: `오늘 지지 ${branchRole.character}의 본기 ${branchRole.basisStem}의 십성은 ${branchRole.name}: ${branchRole.easyRole}.` });
  } else {
    selected[0].evidence += ` 오늘 지지 ${branchRole.character}의 본기 ${branchRole.basisStem}도 같은 ${branchRole.name}입니다.`;
    selected.push({ id: "background", evidence: `오늘의 역할 ${stemRole.name}(${stemRole.easyRole})을 긴 배경과 함께 봅니다. 대운 ${facts.period?.ganZhi || "없음"}: ${facts.period?.stemRelation?.label || "해당 정보 없음"}. 세운 ${facts.annual?.ganZhi || "없음"}: ${facts.annual?.stemRelation.label || "해당 정보 없음"}. 긴 흐름은 오늘의 사건을 뜻하지 않습니다.` });
  }
  // 충을 먼저, 다음은 합. 같은 종류의 여러 위치는 한 단서로 묶습니다.
  const pairKind = (["지지충", "천간합", "지지합"] as const).find((kind) => natalPairs.some((pair) => pair.kind === kind));
  if (pairKind) {
    selected.push({ id: "natal-pair", evidence: natalPairs.filter((pair) => pair.kind === pairKind).map((pair) => `오늘 ${pair.first.character}와 ${pair.second.pillarLabel} ${pair.second.character}: ${pair.kind}, ${pair.easyMeaning}`).join(". ") });
  }
  return selected;
}

export function parseGeneratedDailyFortune(value: unknown, facts: DailyFortuneFacts): DailyFortuneReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const selected = selectDailyClues(facts);
  if (!Array.isArray(item.clues) || item.clues.length !== selected.length) return null;
  const enriched = item.clues.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const clue = raw as Record<string, unknown>;
    return clue.id === selected[index].id ? { ...clue, evidence: selected[index].evidence } : null;
  });
  return parseDailyFortune({ summary: item.summary, clues: enriched });
}

export function buildDailyFortunePrompt(facts: DailyFortuneFacts): string {
  return [
    "당신은 사주를 처음 보는 초등학생도 이해할 수 있게 쉬운 존댓말로 설명합니다.",
    "아래 계산 사실만 근거로 오늘 실제로 참고할 만한 해석을 작성하세요. 계산값을 다시 만들거나 제공하지 않은 합·충·형·해·파, 삼합을 지어내지 마세요.",
    "JSON 형식으로 쉬운 한국어를 작성하세요. summary는 오늘의 핵심 2문장, clues는 아래 선택된 단서를 같은 개수·순서·id로 해석한 배열입니다.",
    "각 clue에 id, title(쉬운 제목), why(왜 주목할 만한지 2~3문장), reference(오늘 어떤 실제 상황에 참고할지 2~3문장), action(오늘 해볼 구체적 행동 1문장)을 작성하세요. evidence는 서버가 붙이므로 출력하지 마세요.",
    "고정된 생활 분야를 억지로 채우지 말고 선택된 단서마다 가장 관련 있는 상황을 설명하세요. 같은 의미나 행동을 여러 단서에서 반복하지 마세요. background는 오늘의 단서를 대운·세운과 연결하는 맥락으로만 설명하세요.",
    "대운과 세운은 긴 배경이며 오늘의 십성·합충과 구별하세요. 합·충은 사건 확정이 아닌 전통적인 참고 단서입니다. 돈벌이·손실, 질병·컨디션을 예언하거나 투자·의료 결정을 지시하지 마세요.",
    `한국 날짜: ${facts.fortuneDate}`,
    `선택된 단서: ${JSON.stringify(selectDailyClues(facts))}`,
    `태어난 날의 중심 글자: ${facts.chart.dayMaster.character}(${facts.chart.dayMaster.korean}, ${facts.chart.dayMaster.element})`,
    `사주 8글자: ${facts.chart.pillars.map((item) => item.text).join(" ")}`,
    `대운(약 10년 흐름): ${facts.period?.ganZhi ?? "해당 기간 없음"}, 위 글자 ${facts.period?.stemRelation?.label ?? "정보 없음"}, 아래 글자 ${facts.period?.branchRelation?.label ?? "정보 없음"}`,
    `세운(올해 흐름): ${facts.annual?.ganZhi ?? "해당 기간 없음"}, 위 글자 ${facts.annual?.stemRelation.label ?? "정보 없음"}, 아래 글자 ${facts.annual?.branchRelation.label ?? "정보 없음"}`,
    `일운(오늘 흐름): ${facts.dailyGanZhi}, 위 글자 ${facts.dailyStemRelation.label}, 아래 글자 ${facts.dailyBranchRelation.label}`,
    `오늘 윗글자 십성: ${facts.dailySignals.stemRole.name}(${facts.dailySignals.stemRole.easyRole})`,
    `오늘 아랫글자 본기 ${facts.dailySignals.branchRole.basisStem}의 십성: ${facts.dailySignals.branchRole.name}(${facts.dailySignals.branchRole.easyRole})`,
    `오늘과 태어난 사주의 글자 관계: ${facts.dailySignals.natalPairs.length ? facts.dailySignals.natalPairs.map((pair) => `${pair.kind} ${pair.first.character}-${pair.second.pillarLabel} ${pair.second.character}(${pair.easyMeaning})`).join(", ") : "이 범위의 천간합·지지합·지지충 없음"}`,
  ].join("\n");
}
