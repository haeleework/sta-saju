import type { SajuChart } from "./chart";

type Element = "목" | "화" | "토" | "금" | "수";
type Polarity = "양" | "음";

export type TenGodName =
  | "비견" | "겁재" | "식신" | "상관" | "편재"
  | "정재" | "편관" | "정관" | "편인" | "정인";

export type TenGodEntry = {
  pillarLabel: string;
  position: "윗글자" | "아랫글자";
  character: string;
  basisStem: string;
  name: TenGodName;
  easyRole: string;
};

export type PairRelation = {
  kind: "천간합" | "지지합" | "지지충";
  first: { pillarLabel: string; character: string };
  second: { pillarLabel: string; character: string };
  easyMeaning: string;
};

export type AdvancedReading = {
  dayMaster: { character: string; element: string };
  tenGods: TenGodEntry[];
  pairRelations: PairRelation[];
  summary: string;
};

export type DailySignals = {
  stemRole: TenGodEntry;
  branchRole: TenGodEntry;
  natalPairs: PairRelation[];
};

const stemTraits: Record<string, { element: Element; polarity: Polarity }> = {
  甲: { element: "목", polarity: "양" }, 乙: { element: "목", polarity: "음" },
  丙: { element: "화", polarity: "양" }, 丁: { element: "화", polarity: "음" },
  戊: { element: "토", polarity: "양" }, 己: { element: "토", polarity: "음" },
  庚: { element: "금", polarity: "양" }, 辛: { element: "금", polarity: "음" },
  壬: { element: "수", polarity: "양" }, 癸: { element: "수", polarity: "음" },
};

// 지장간 배열에서 첫 번째인 본기입니다. lunar-javascript@1.7.7 표와 맞춥니다.
const branchMainStem: Record<string, string> = {
  子: "癸", 丑: "己", 寅: "甲", 卯: "乙", 辰: "戊", 巳: "丙",
  午: "丁", 未: "己", 申: "庚", 酉: "辛", 戌: "戊", 亥: "壬",
};

const generates: Record<Element, Element> = {
  목: "화", 화: "토", 토: "금", 금: "수", 수: "목",
};
const controls: Record<Element, Element> = {
  목: "토", 화: "금", 토: "수", 금: "목", 수: "화",
};

export const TEN_GOD_EASY_ROLES: Record<TenGodName, string> = {
  비견: "나와 비슷한 방식으로 함께하는 힘",
  겁재: "같은 목표를 두고 나누거나 겨루는 힘",
  식신: "생각과 재능을 차분히 밖으로 보여주는 힘",
  상관: "내 생각을 뚜렷하게 표현하고 바꾸려는 힘",
  편재: "넓은 기회와 자원을 빠르게 다루는 힘",
  정재: "익숙한 자원과 결과를 꾸준히 관리하는 힘",
  편관: "압박 속에서 결단하고 책임지는 힘",
  정관: "규칙과 약속을 지키며 책임지는 힘",
  편인: "새로운 관점으로 배우고 도움받는 힘",
  정인: "익숙한 지식과 돌봄을 받아들이는 힘",
};

function tenGod(dayStem: string, otherStem: string): TenGodName {
  const day = stemTraits[dayStem];
  const other = stemTraits[otherStem];
  if (!day || !other) throw new Error("십성을 계산할 수 없는 천간입니다.");
  const samePolarity = day.polarity === other.polarity;
  if (day.element === other.element) return samePolarity ? "비견" : "겁재";
  if (generates[day.element] === other.element) return samePolarity ? "식신" : "상관";
  if (controls[day.element] === other.element) return samePolarity ? "편재" : "정재";
  if (controls[other.element] === day.element) return samePolarity ? "편관" : "정관";
  return samePolarity ? "편인" : "정인";
}

function pairKey(first: string, second: string): string {
  return [...[first, second]].sort().join("");
}

const stemCombinations = new Set(["甲己", "乙庚", "丙辛", "丁壬", "戊癸"].map(([a, b]) => pairKey(a, b)));
const branchCombinations = new Set(["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"].map(([a, b]) => pairKey(a, b)));
const branchClashes = new Set(["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"].map(([a, b]) => pairKey(a, b)));

function findPairs(
  chart: SajuChart,
  position: "stem" | "branch",
  pairs: Set<string>,
  kind: PairRelation["kind"],
): PairRelation[] {
  const found: PairRelation[] = [];
  for (let firstIndex = 0; firstIndex < chart.pillars.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < chart.pillars.length; secondIndex += 1) {
      const firstPillar = chart.pillars[firstIndex];
      const secondPillar = chart.pillars[secondIndex];
      const firstCharacter = firstPillar[position];
      const secondCharacter = secondPillar[position];
      if (!pairs.has(pairKey(firstCharacter, secondCharacter))) continue;
      found.push({
        kind,
        first: { pillarLabel: firstPillar.label, character: firstCharacter },
        second: { pillarLabel: secondPillar.label, character: secondCharacter },
        easyMeaning: kind === "지지충"
          ? "두 글자가 서로 다른 방향으로 움직이는 단서"
          : "두 글자가 서로 연결되는 단서",
      });
    }
  }
  return found;
}

function describeSummary(tenGods: TenGodEntry[], pairs: PairRelation[]): string {
  const groups = [
    { names: ["비견", "겁재"], text: "함께하고 겨루는 힘" },
    { names: ["식신", "상관"], text: "생각을 밖으로 표현하는 힘" },
    { names: ["편재", "정재"], text: "기회와 결과를 관리하는 힘" },
    { names: ["편관", "정관"], text: "규칙과 책임을 다루는 힘" },
    { names: ["편인", "정인"], text: "배우고 도움을 받아들이는 힘" },
  ];
  const counts = groups
    .map((group) => ({ ...group, count: tenGods.filter((item) => group.names.includes(item.name)).length }))
    .filter((group) => group.count > 0)
    .sort((a, b) => b.count - a.count);
  const leading = counts.filter((group) => group.count === counts[0]?.count).map((group) => group.text);
  const roleText = leading.length
    ? `일곱 글자에서는 ${leading.join("과 ")}에 해당하는 역할이 비교적 자주 보입니다.`
    : "주변 글자의 역할을 한 가지로 묶어 말하기 어렵습니다.";
  const pairText = pairs.length
    ? `글자 사이에서는 연결되는 짝 ${pairs.filter((item) => item.kind !== "지지충").length}개와 서로 다른 방향을 가리키는 짝 ${pairs.filter((item) => item.kind === "지지충").length}개를 찾았습니다.`
    : "이번 여덟 글자에서는 이 범위에 해당하는 짝을 찾지 못했습니다.";
  return `${roleText} ${pairText} 이것은 전통 규칙으로 살펴본 가능성이며, 실제 성격이나 일을 정해 주는 결론은 아닙니다.`;
}

export function analyzeAdvancedReading(chart: SajuChart): AdvancedReading {
  const dayStem = chart.pillars[2].stem;
  const tenGods: TenGodEntry[] = [];
  chart.pillars.forEach((pillar, index) => {
    if (index !== 2) {
      const name = tenGod(dayStem, pillar.stem);
      tenGods.push({
        pillarLabel: pillar.label, position: "윗글자", character: pillar.stem,
        basisStem: pillar.stem, name, easyRole: TEN_GOD_EASY_ROLES[name],
      });
    }
    const basisStem = branchMainStem[pillar.branch];
    const name = tenGod(dayStem, basisStem);
    tenGods.push({
      pillarLabel: pillar.label, position: "아랫글자", character: pillar.branch,
      basisStem, name, easyRole: TEN_GOD_EASY_ROLES[name],
    });
  });
  const pairRelations = [
    ...findPairs(chart, "stem", stemCombinations, "천간합"),
    ...findPairs(chart, "branch", branchCombinations, "지지합"),
    ...findPairs(chart, "branch", branchClashes, "지지충"),
  ];
  return {
    dayMaster: { character: dayStem, element: chart.dayMaster.element },
    tenGods,
    pairRelations,
    summary: describeSummary(tenGods, pairRelations),
  };
}

export function analyzeDailySignals(chart: SajuChart, dailyGanZhi: string): DailySignals {
  const [stem, branch, ...extra] = [...dailyGanZhi];
  const branchBasis = branchMainStem[branch];
  if (!stemTraits[stem] || !branchBasis || extra.length) {
    throw new Error("오늘의 십성과 글자 관계를 계산할 수 없습니다.");
  }
  const dayStem = chart.pillars[2]?.stem;
  if (!stemTraits[dayStem]) throw new Error("태어난 날의 중심 글자를 확인할 수 없습니다.");
  const stemName = tenGod(dayStem, stem);
  const branchName = tenGod(dayStem, branchBasis);
  const natalPairs: PairRelation[] = [];
  for (const pillar of chart.pillars) {
    const candidates: { kind: PairRelation["kind"]; daily: string; natal: string; pairs: Set<string> }[] = [
      { kind: "천간합", daily: stem, natal: pillar.stem, pairs: stemCombinations },
      { kind: "지지합", daily: branch, natal: pillar.branch, pairs: branchCombinations },
      { kind: "지지충", daily: branch, natal: pillar.branch, pairs: branchClashes },
    ];
    for (const candidate of candidates) {
      if (!candidate.pairs.has(pairKey(candidate.daily, candidate.natal))) continue;
      natalPairs.push({
        kind: candidate.kind,
        first: { pillarLabel: "오늘", character: candidate.daily },
        second: { pillarLabel: pillar.label, character: candidate.natal },
        easyMeaning: candidate.kind === "지지충"
          ? "두 글자가 서로 다른 방향으로 움직이는 단서"
          : "두 글자가 서로 연결되는 단서",
      });
    }
  }
  return {
    stemRole: { pillarLabel: "오늘", position: "윗글자", character: stem, basisStem: stem, name: stemName, easyRole: TEN_GOD_EASY_ROLES[stemName] },
    branchRole: { pillarLabel: "오늘", position: "아랫글자", character: branch, basisStem: branchBasis, name: branchName, easyRole: TEN_GOD_EASY_ROLES[branchName] },
    natalPairs,
  };
}
