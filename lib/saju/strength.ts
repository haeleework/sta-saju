import type { SajuChart } from "./chart";

type Element = "목" | "화" | "토" | "금" | "수";

export type DayMasterAssessment = {
  seasonElement: Element;
  seasonSupport: boolean;
  roots: { label: string; branch: string; hiddenStems: string[] }[];
  visible: { support: number; drain: number; control: number };
  verdict: "supported" | "unsupported" | "mixed";
  reasons: string[];
};

const stemElements: Record<string, Element> = {
  甲: "목", 乙: "목", 丙: "화", 丁: "화", 戊: "토", 己: "토",
  庚: "금", 辛: "금", 壬: "수", 癸: "수",
};

// lunar-javascript@1.7.7의 LunarUtil.ZHI_HIDE_GAN 표와 같은 순서입니다.
const hiddenStems: Record<string, string[]> = {
  子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"],
  卯: ["乙"], 辰: ["戊", "乙", "癸"], 巳: ["丙", "庚", "戊"],
  午: ["丁", "己"], 未: ["己", "丁", "乙"], 申: ["庚", "壬", "戊"],
  酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"],
};

const generates: Record<Element, Element> = {
  목: "화", 화: "토", 토: "금", 금: "수", 수: "목",
};
const controls: Record<Element, Element> = {
  목: "토", 화: "금", 토: "수", 금: "목", 수: "화",
};

function relation(day: Element, other: Element): keyof DayMasterAssessment["visible"] {
  if (day === other || generates[other] === day) return "support";
  if (controls[other] === day) return "control";
  return "drain";
}

export function analyzeDayMaster(chart: SajuChart): DayMasterAssessment {
  const day = chart.dayMaster.element as Element;
  const seasonElement = chart.pillars[1].branchElement as Element;
  const seasonSupport = relation(day, seasonElement) === "support";
  const roots = chart.pillars.flatMap((pillar) => {
    const matching = (hiddenStems[pillar.branch] ?? [])
      .filter((stem) => stemElements[stem] === day);
    return matching.length ? [{ label: pillar.label, branch: pillar.branch, hiddenStems: matching }] : [];
  });
  const visible: DayMasterAssessment["visible"] = { support: 0, drain: 0, control: 0 };
  chart.pillars.forEach((pillar, index) => {
    if (index !== 2) visible[relation(day, pillar.stemElement as Element)]++;
    visible[relation(day, pillar.branchElement as Element)]++;
  });
  const visibleSupport = visible.support > visible.drain + visible.control;
  const signals = [seasonSupport, roots.length > 0, visibleSupport];
  const verdict = signals.every(Boolean)
    ? "supported"
    : signals.every((signal) => !signal)
      ? "unsupported"
      : "mixed";
  return {
    seasonElement,
    seasonSupport,
    roots,
    visible,
    verdict,
    reasons: [
      `태어난 달의 대표 오행은 ${seasonElement}, 일간의 오행은 ${day}입니다. 두 오행은 ${seasonSupport ? "돕는 관계" : "직접 돕지 않는 관계"}로 분류했습니다.`,
      roots.length > 0
        ? `네 지지 중 ${roots.map((root) => root.label).join("·")}에 일간과 같은 오행의 지장간이 있습니다.`
        : "네 지지의 지장간에서 일간과 같은 오행을 찾지 못했습니다.",
      `일간을 제외한 보이는 7글자 중 도움 ${visible.support}개, 기운을 쓰는 쪽 ${visible.drain}개, 제어하는 쪽 ${visible.control}개입니다.`,
    ],
  };
}
