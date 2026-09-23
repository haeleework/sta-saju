import type { SajuChart } from "./chart";
import { analyzeDayMaster } from "./strength";

export const ELEMENT_ORDER = ["목", "화", "토", "금", "수"] as const;
export type Element = typeof ELEMENT_ORDER[number];

export type ChartCell = {
  pillarLabel: string;
  position: "stem" | "branch";
  character: string;
  korean: string;
  element: Element;
};

export function getChartCells(chart: SajuChart): ChartCell[] {
  const stems = chart.pillars.map((pillar) => ({
    pillarLabel: pillar.label,
    position: "stem" as const,
    character: pillar.stem,
    korean: [...pillar.korean][0],
    element: pillar.stemElement as Element,
  }));
  const branches = chart.pillars.map((pillar) => ({
    pillarLabel: pillar.label,
    position: "branch" as const,
    character: pillar.branch,
    korean: [...pillar.korean][1],
    element: pillar.branchElement as Element,
  }));
  return [...stems, ...branches];
}

const generates: Record<Element, Element> = {
  목: "화", 화: "토", 토: "금", 금: "수", 수: "목",
};
const controls: Record<Element, Element> = {
  목: "토", 화: "금", 토: "수", 금: "목", 수: "화",
};

function relationship(day: Element, other: Element): string {
  if (day === other) return "나와 비슷한 힘";
  if (generates[other] === day) return "나를 받쳐 주는 힘";
  if (generates[day] === other) return "생각을 밖으로 표현하는 힘";
  if (controls[day] === other) return "계획하고 자원을 다루는 힘";
  return "규칙과 책임을 마주하는 힘";
}

function pattern(day: Element, leading: Element[]): string {
  const has = (value: string) => leading.some((element) => relationship(day, element) === value);
  if (has("나를 받쳐 주는 힘") && has("생각을 밖으로 표현하는 힘"))
    return "도움을 받거나 배운 것을 자기 말과 행동으로 꺼내는 흐름을 떠올릴 수 있습니다.";
  if (has("생각을 밖으로 표현하는 힘") && has("계획하고 자원을 다루는 힘"))
    return "생각을 표현한 뒤 실제 선택과 자원 관리로 이어가는 흐름을 떠올릴 수 있습니다.";
  if (has("나와 비슷한 힘") && has("규칙과 책임을 마주하는 힘"))
    return "자기 방식과 바깥의 기준 사이에서 균형을 찾는 장면을 떠올릴 수 있습니다.";
  if (has("나와 비슷한 힘") && has("생각을 밖으로 표현하는 힘"))
    return "자기 생각을 가다듬어 말과 행동으로 표현하는 흐름을 떠올릴 수 있습니다.";
  if (has("나를 받쳐 주는 힘") && has("규칙과 책임을 마주하는 힘"))
    return "배우고 준비한 것을 책임 있는 선택으로 잇는 흐름을 떠올릴 수 있습니다.";
  return "이 기운이 일상에서 어떻게 드러나는지 떠올리며 아래의 자세한 풀이를 읽어 보세요.";
}

export function describeElementDistribution(chart: SajuChart): string {
  const day = chart.dayMaster.element as Element;
  const highest = Math.max(...ELEMENT_ORDER.map((element) => chart.elements[element]));
  const leading = ELEMENT_ORDER.filter((element) => chart.elements[element] === highest);
  const relationships = leading.map((element) => `${element}${element === "목" || element === "금" ? "은" : "는"} ${relationship(day, element)}`).join(", ");
  const assessment = analyzeDayMaster(chart);
  const backdrop = assessment.seasonSupport && assessment.roots.length > 0
    ? "태어난 달과 숨은 글자도 일간을 받쳐 주는 단서입니다."
    : !assessment.seasonSupport && assessment.roots.length === 0
      ? "태어난 달과 숨은 글자에는 받침이 적어, 겉의 흐름을 실제 성격으로 단정하면 안 됩니다."
      : "태어난 달과 숨은 글자에는 서로 다른 단서가 있어, 상황에 따라 드러나는 모습도 달라질 수 있습니다.";
  return `나를 대표하는 일간은 ${chart.dayMaster.korean}${day}입니다. 겉으로 보이는 글자에서는 ${leading.join("·")} 기운이 눈에 띕니다. 전통 명리에서는 ${relationships}으로 읽습니다. ${pattern(day, leading)} ${backdrop} 이는 실제 성격이나 미래를 정해 놓은 말이 아닙니다.`;
}
