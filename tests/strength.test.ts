import test from "node:test";
import assert from "node:assert/strict";
import { type Pillar, type SajuChart } from "../lib/saju/chart";
import { analyzeDayMaster } from "../lib/saju/strength";

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

test("월지의 대표 오행이 일간과 같거나 일간을 생하면 계절 도움으로 계산한다", () => {
  assert.equal(analyzeDayMaster(chart("丙午", "甲寅", "甲子", "丁酉")).seasonSupport, true);
  assert.equal(analyzeDayMaster(chart("丙午", "壬亥", "甲子", "丁酉")).seasonSupport, true);
  assert.equal(analyzeDayMaster(chart("丙午", "丁巳", "甲子", "丁酉")).seasonSupport, false);
});

test("지장간에 일간과 같은 오행이 있는 지지만 뿌리로 찾는다", () => {
  const result = analyzeDayMaster(chart("丙辰", "庚申", "甲子", "丙亥"));
  assert.deepEqual(result.roots.map((root: { branch: string }) => root.branch), ["辰", "亥"]);
  assert.ok(result.roots[0].hiddenStems.includes("乙"));
  assert.ok(result.roots[1].hiddenStems.includes("甲"));
});

test("겉으로 드러난 일곱 오행만 일간과의 관계로 분류한다", () => {
  // 일간 甲은 제외한다. 년·월·시 천간과 네 지지: 목/수/화/토/금/수/목.
  const result = analyzeDayMaster(chart("乙酉", "壬亥", "甲寅", "丙辰"));
  assert.deepEqual(result.visible, { support: 4, drain: 2, control: 1 });
  assert.equal(result.visible.support + result.visible.drain + result.visible.control, 7);
});

test("계절·뿌리·겉 오행 세 신호가 모두 도움일 때만 supported", () => {
  const result = analyzeDayMaster(chart("甲寅", "壬亥", "甲寅", "癸子"));
  assert.equal(result.seasonSupport, true);
  assert.ok(result.roots.length > 0);
  assert.equal(result.visible.support, 7);
  assert.equal(result.verdict, "supported");
  assert.ok(result.reasons.length > 0);
});

test("계절·뿌리·겉 오행 세 신호가 모두 도움 없음일 때만 unsupported", () => {
  const result = analyzeDayMaster(chart("丙午", "庚申", "甲午", "戊酉"));
  assert.equal(result.seasonSupport, false);
  assert.equal(result.roots.length, 0);
  assert.equal(result.visible.support, 0);
  assert.equal(result.verdict, "unsupported");
});

test("세 신호가 엇갈리면 강약을 단정하지 않고 mixed", () => {
  const result = analyzeDayMaster(chart("丙午", "壬亥", "甲午", "戊酉"));
  assert.equal(result.seasonSupport, true);
  assert.ok(result.roots.length > 0);
  assert.ok(result.visible.support < 4);
  assert.equal(result.verdict, "mixed");
});
