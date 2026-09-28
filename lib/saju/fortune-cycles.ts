import lunar from "lunar-javascript";
import { validateInput, type SajuChart, type SajuInput } from "./chart";

const { Solar } = lunar;

export type FortuneGender = "male" | "female";
type Element = "목" | "화" | "토" | "금" | "수";

export type FortuneRelation = {
  element: Element;
  label: string;
};

export type FortunePeriod = {
  index: number;
  ganZhi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  stemRelation: FortuneRelation | null;
  branchRelation: FortuneRelation | null;
};

export type AnnualFortune = {
  year: number;
  age: number;
  ganZhi: string;
  stemRelation: FortuneRelation;
  branchRelation: FortuneRelation;
};

export type FortuneCycles = {
  gender: FortuneGender;
  direction: "forward" | "backward";
  directionReason: string;
  startOffset: { years: number; months: number; days: number; hours: number };
  firstStartDate: string;
  ageMethod: string;
  periods: FortunePeriod[];
  currentPeriod: FortunePeriod | null;
  annual: AnnualFortune[];
  referenceYear: number;
};

const stems = [..."甲乙丙丁戊己庚辛壬癸"];
const branches = [..."子丑寅卯辰巳午未申酉戌亥"];
const stemElements: Element[] = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const branchElements: Element[] = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
const generates: Record<Element, Element> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const controls: Record<Element, Element> = { 목: "토", 화: "금", 토: "수", 금: "목", 수: "화" };

function elementOf(character: string): Element {
  const stemIndex = stems.indexOf(character);
  if (stemIndex >= 0) return stemElements[stemIndex];
  const branchIndex = branches.indexOf(character);
  if (branchIndex >= 0) return branchElements[branchIndex];
  throw new Error("운의 오행을 확인할 수 없습니다.");
}

function relation(day: Element, other: Element): FortuneRelation {
  if (day === other) return { element: other, label: "나와 비슷한 힘" };
  if (generates[other] === day) return { element: other, label: "나를 받쳐 주는 힘" };
  if (generates[day] === other) return { element: other, label: "생각을 밖으로 표현하는 힘" };
  if (controls[day] === other) return { element: other, label: "계획하고 자원을 다루는 힘" };
  return { element: other, label: "규칙과 책임을 마주하는 힘" };
}

function relations(ganZhi: string, day: Element): Pick<FortunePeriod, "stemRelation" | "branchRelation"> {
  if ([...ganZhi].length !== 2) return { stemRelation: null, branchRelation: null };
  return {
    stemRelation: relation(day, elementOf([...ganZhi][0])),
    branchRelation: relation(day, elementOf([...ganZhi][1])),
  };
}

function kstTermSolar(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const chinaTime = new Date(Date.UTC(year, month - 1, day, hour - 1, minute));
  return Solar.fromYmdHms(
    chinaTime.getUTCFullYear(),
    chinaTime.getUTCMonth() + 1,
    chinaTime.getUTCDate(),
    chinaTime.getUTCHours(),
    minute,
    0,
  );
}

function yearGanZhi(year: number): string {
  return Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar().getYearInGanZhiExact();
}

function formatSolarDate(solar: { toYmdHms(): string }): string {
  return solar.toYmdHms().slice(0, 16);
}

export function calculateFortuneCycles(
  raw: Pick<SajuInput, "date" | "time"> & { gender: FortuneGender },
  chart: SajuChart,
  referenceYear = new Date().getFullYear(),
): FortuneCycles {
  const input = validateInput({
    date: raw.date,
    time: raw.time,
    calendar: "solar",
    topic: "general",
    question: "",
  });
  if (raw.gender !== "male" && raw.gender !== "female") {
    throw new Error("대운 방향 계산에 사용할 성별을 선택해 주세요.");
  }
  if (!Number.isInteger(referenceYear)) throw new Error("기준 연도를 확인할 수 없습니다.");

  const birthYear = Number(input.date.slice(0, 4));
  const dayElement = chart.dayMaster.element as Element;
  const eightChar = kstTermSolar(input.date, input.time).getLunar().getEightChar();
  const yun = eightChar.getYun(raw.gender === "male" ? 1 : 0, 1);
  const startInKst = yun.getStartSolar().nextHour(1);
  const firstStartYear = startInKst.getYear();
  const rawPeriods = yun.getDaYun(11);

  const periods = rawPeriods.map((period, index): FortunePeriod => {
    const startYear = index === 0 ? birthYear : firstStartYear + (index - 1) * 10;
    const endYear = index === 0 ? firstStartYear - 1 : startYear + 9;
    const ganZhi = period.getGanZhi();
    return {
      index,
      ganZhi,
      startYear,
      endYear,
      startAge: startYear - birthYear + 1,
      endAge: endYear - birthYear + 1,
      ...relations(ganZhi, dayElement),
    };
  }).filter((period) => period.endYear >= period.startYear);

  const currentPeriod = periods.find(
    (period) => referenceYear >= period.startYear && referenceYear <= period.endYear,
  ) ?? null;
  const annual = currentPeriod
    ? Array.from(
        { length: currentPeriod.endYear - currentPeriod.startYear + 1 },
        (_, index): AnnualFortune => {
          const year = currentPeriod.startYear + index;
          const ganZhi = yearGanZhi(year);
          const itemRelations = relations(ganZhi, dayElement);
          if (!itemRelations.stemRelation || !itemRelations.branchRelation) {
            throw new Error("세운의 오행 관계를 확인할 수 없습니다.");
          }
          return {
            year,
            age: year - birthYear + 1,
            ganZhi,
            stemRelation: itemRelations.stemRelation,
            branchRelation: itemRelations.branchRelation,
          };
        },
      )
    : [];

  const yearStem = chart.pillars[0].stem;
  const yangYear = stems.indexOf(yearStem) % 2 === 0;
  const forward = yun.isForward();
  return {
    gender: raw.gender,
    direction: forward ? "forward" : "backward",
    directionReason: `${yearStem}은 ${yangYear ? "양" : "음"}의 윗글자이고, ${raw.gender === "male" ? "남성" : "여성"} 기준이라 ${forward ? "순행" : "역행"}합니다.`,
    startOffset: {
      years: yun.getStartYear(),
      months: yun.getStartMonth(),
      days: yun.getStartDay(),
      hours: yun.getStartHour(),
    },
    firstStartDate: formatSolarDate(startInKst),
    ageMethod: "첫 대운 시작 나이는 절기까지의 거리를 3일=1년으로 바꾸는 기본 환산법(sect=1)으로 계산했습니다.",
    periods,
    currentPeriod,
    annual,
    referenceYear,
  };
}
