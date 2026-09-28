import lunar from "lunar-javascript";
import { calculate, type SajuChart } from "./chart";
import { calculateFortuneCycles, type FortuneGender, type FortunePeriod, type AnnualFortune, type FortuneRelation } from "./fortune-cycles";

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
export type DailyFortuneReading = { summary: string; reason: string; action: string };
export type DailyFortuneFacts = {
  fortuneDate: string;
  chart: SajuChart;
  period: FortunePeriod | null;
  annual: AnnualFortune | null;
  dailyGanZhi: string;
  dailyStemRelation: FortuneRelation;
  dailyBranchRelation: FortuneRelation;
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
  };
}

export function parseDailyFortune(value: unknown): DailyFortuneReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!["summary", "reason", "action"].every((key) => typeof item[key] === "string" && (item[key] as string).trim().length > 0 && (item[key] as string).length <= 500)) return null;
  return {
    summary: (item.summary as string).trim(),
    reason: (item.reason as string).trim(),
    action: (item.action as string).trim(),
  };
}

export function buildDailyFortunePrompt(facts: DailyFortuneFacts): string {
  return [
    "당신은 사주를 처음 보는 초등학생도 이해할 수 있게 쉬운 존댓말로 설명합니다.",
    "아래 계산 사실을 바꾸지 말고 오늘의 참고용 해석을 작성하세요. 미래 사건을 단정하거나 건강·금전 결정을 지시하지 마세요.",
    "JSON으로 summary(오늘의 관점), reason(계산 근거를 쉬운 말로), action(오늘 해볼 작은 행동)을 각각 1~2문장으로 작성하세요.",
    `한국 날짜: ${facts.fortuneDate}`,
    `태어난 날의 중심 글자: ${facts.chart.dayMaster.character}(${facts.chart.dayMaster.korean}, ${facts.chart.dayMaster.element})`,
    `사주 8글자: ${facts.chart.pillars.map((item) => item.text).join(" ")}`,
    `대운(약 10년 흐름): ${facts.period?.ganZhi ?? "해당 기간 없음"}`,
    `세운(올해 흐름): ${facts.annual?.ganZhi ?? "해당 기간 없음"}`,
    `일운(오늘 흐름): ${facts.dailyGanZhi}, 위 글자 ${facts.dailyStemRelation.label}, 아래 글자 ${facts.dailyBranchRelation.label}`,
  ].join("\n");
}
