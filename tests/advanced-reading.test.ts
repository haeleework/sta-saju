import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeAdvancedReading, type TenGodName } from "../lib/saju/advanced-reading";
import { type Pillar, type SajuChart } from "../lib/saju/chart";

const stemElements: Record<string, string> = {
  甲: "목", 乙: "목", 丙: "화", 丁: "화", 戊: "토", 己: "토",
  庚: "금", 辛: "금", 壬: "수", 癸: "수",
};
const branchElements: Record<string, string> = {
  子: "수", 丑: "토", 寅: "목", 卯: "목", 辰: "토", 巳: "화",
  午: "화", 未: "토", 申: "금", 酉: "금", 戌: "토", 亥: "수",
};

function chart(...texts: [string, string, string, string]): SajuChart {
  const labels = ["년주", "월주", "일주", "시주"];
  const pillars: Pillar[] = texts.map((value, index) => {
    const [stem, branch] = [...value];
    return {
      label: labels[index], text: value, korean: value, stem, branch,
      stemElement: stemElements[stem], branchElement: branchElements[branch],
    };
  });
  const elements: SajuChart["elements"] = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const pillar of pillars) {
    elements[pillar.stemElement as keyof typeof elements]++;
    elements[pillar.branchElement as keyof typeof elements]++;
  }
  return {
    pillars, elements,
    dayMaster: { character: pillars[2].stem, korean: pillars[2].stem, element: pillars[2].stemElement },
    method: "test", engine: "test", elementMethod: "test",
  };
}

test("甲 일간과 열 천간의 음양·오행 관계에서 십성 10종을 모두 구분한다", () => {
  const expected: Record<string, TenGodName> = {
    甲: "비견", 乙: "겁재", 丙: "식신", 丁: "상관", 戊: "편재",
    己: "정재", 庚: "편관", 辛: "정관", 壬: "편인", 癸: "정인",
  };

  for (const [otherStem, name] of Object.entries(expected)) {
    const result = analyzeAdvancedReading(chart(`${otherStem}子`, "丙辰", "甲午", "戊戌"));
    const yearStem = result.tenGods.find((item) => item.pillarLabel === "년주" && item.position === "윗글자");
    assert.equal(yearStem?.name, name, `${otherStem}은 ${name}이어야 합니다`);
    assert.ok(yearStem?.easyRole.length, `${name}의 쉬운 역할 설명이 있어야 합니다`);
  }
});

test("지지 십성은 대표 오행이 아니라 lunar-javascript 표의 본기를 기준으로 계산한다", () => {
  const expected: Record<string, { basisStem: string; name: TenGodName }> = {
    子: { basisStem: "癸", name: "정인" }, 丑: { basisStem: "己", name: "정재" },
    寅: { basisStem: "甲", name: "비견" }, 卯: { basisStem: "乙", name: "겁재" },
    辰: { basisStem: "戊", name: "편재" }, 巳: { basisStem: "丙", name: "식신" },
    午: { basisStem: "丁", name: "상관" }, 未: { basisStem: "己", name: "정재" },
    申: { basisStem: "庚", name: "편관" }, 酉: { basisStem: "辛", name: "정관" },
    戌: { basisStem: "戊", name: "편재" }, 亥: { basisStem: "壬", name: "편인" },
  };

  for (const [branch, relation] of Object.entries(expected)) {
    const result = analyzeAdvancedReading(chart(`丙${branch}`, "戊辰", "甲午", "庚戌"));
    const yearBranch = result.tenGods.find((item) => item.pillarLabel === "년주" && item.position === "아랫글자");
    assert.equal(yearBranch?.basisStem, relation.basisStem, `${branch}의 본기`);
    assert.equal(yearBranch?.name, relation.name, `${branch}의 본기 십성`);
  }
});

test("천간오합·지지육합·지지육충의 모든 표준 짝을 찾는다", () => {
  const cases = [
    ...["甲己", "乙庚", "丙辛", "丁壬", "戊癸"].map((pair) => ({ kind: "천간합", pair })),
    ...["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"].map((pair) => ({ kind: "지지합", pair })),
    ...["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"].map((pair) => ({ kind: "지지충", pair })),
  ] as const;

  for (const { kind, pair } of cases) {
    const [first, second] = [...pair];
    const input = kind === "천간합"
      ? chart(`${first}辰`, `${second}辰`, "甲辰", "甲辰")
      : chart(`甲${first}`, `甲${second}`, "甲辰", "甲辰");
    const found = analyzeAdvancedReading(input).pairRelations.some((relation) =>
      relation.kind === kind && relation.first.character === first && relation.second.character === second);
    assert.equal(found, true, `${kind} ${pair}을 찾아야 합니다`);
  }
});

test("관계가 없으면 빈 목록이며 같은 짝이 여러 위치에 있으면 위치별 조합을 모두 남긴다", () => {
  assert.deepEqual(analyzeAdvancedReading(chart("甲辰", "甲辰", "甲辰", "甲辰")).pairRelations, []);

  const duplicated = analyzeAdvancedReading(chart("甲子", "己丑", "甲子", "己丑")).pairRelations;
  const stemPairs = duplicated.filter((relation) => relation.kind === "천간합");
  const branchPairs = duplicated.filter((relation) => relation.kind === "지지합");
  assert.equal(stemPairs.length, 4);
  assert.equal(branchPairs.length, 4);
  assert.deepEqual(stemPairs.map((relation) => `${relation.first.pillarLabel}-${relation.second.pillarLabel}`), [
    "년주-월주", "년주-시주", "월주-일주", "일주-시주",
  ]);
  assert.deepEqual(branchPairs.map((relation) => `${relation.first.pillarLabel}-${relation.second.pillarLabel}`), [
    "년주-월주", "년주-시주", "월주-일주", "일주-시주",
  ]);
});

test("심화 화면은 기존 8글자·오행 풀이 뒤에 일곱 글자와 쉬운 합·충 설명을 보여준다", () => {
  const form = readFileSync(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const advancedStart = form.indexOf("className=\"advanced-reading\"");

  assert.ok(form.indexOf("className=\"chart-visual\"") < advancedStart);
  assert.ok(form.indexOf("describeElementDistribution(chart)") < advancedStart);
  assert.ok(advancedStart < form.indexOf("className=\"assessment\""));
  assert.match(form, /일간과 주변 일곱 글자의 십성 관계/);
  assert.match(form, /전문 이름보다 쉬운 뜻을 먼저/);
  assert.match(form, /합은 서로 연결되는 짝, 충은 서로 다른 방향으로 움직이는 짝/);
  assert.match(form, /좋고 나쁨이나 실제 사건을 정해 주지는 않습니다/);
  assert.match(form, /이번 여덟 글자에서는 이 범위에 해당하는 짝을 찾지 못했습니다/);

  const result = analyzeAdvancedReading(chart("乙酉", "戊子", "辛巳", "壬辰"));
  assert.equal(result.tenGods.length, 7);
  assert.equal(result.tenGods.some((item) => item.pillarLabel === "일주" && item.position === "윗글자"), false);
});
