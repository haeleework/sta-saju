import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculate } from "../lib/saju/chart";
import {
  describeElementDistribution,
  getChartCells,
} from "../lib/saju/chart-presentation";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  calendar: "solar",
  topic: "general",
});

test("사주 8글자를 년·월·일·시의 윗줄 다음 아랫줄로 배치한다", () => {
  assert.deepEqual(getChartCells(chart), [
    { pillarLabel: "년주", position: "stem", character: "乙", korean: "을", element: "목" },
    { pillarLabel: "월주", position: "stem", character: "戊", korean: "무", element: "토" },
    { pillarLabel: "일주", position: "stem", character: "辛", korean: "신", element: "금" },
    { pillarLabel: "시주", position: "stem", character: "壬", korean: "임", element: "수" },
    { pillarLabel: "년주", position: "branch", character: "酉", korean: "유", element: "금" },
    { pillarLabel: "월주", position: "branch", character: "子", korean: "자", element: "수" },
    { pillarLabel: "일주", position: "branch", character: "巳", korean: "사", element: "화" },
    { pillarLabel: "시주", position: "branch", character: "辰", korean: "진", element: "토" },
  ]);
});

test("오행 통계는 다섯 항목을 모두 유지하고 합계가 8이다", () => {
  assert.deepEqual(chart.elements, { 목: 1, 화: 1, 토: 2, 금: 2, 수: 2 });
  assert.equal(Object.values(chart.elements).reduce((total, count) => total + count, 0), 8);

  const zeroChart = calculate({
    date: "1999-06-07", time: "09:11", calendar: "solar", topic: "general",
  });
  assert.deepEqual(Object.keys(zeroChart.elements), ["목", "화", "토", "금", "수"]);
  assert.equal(Object.values(zeroChart.elements).reduce((total, count) => total + count, 0), 8);
  assert.ok(Object.values(zeroChart.elements).some((count) => count === 0));
});

test("통계 아래 풀이는 일간과 두드러진 오행 관계를 말하고 판단 보류만 남기지 않는다", () => {
  const explanation = describeElementDistribution(chart);
  assert.ok(explanation.trim().length >= 30);
  assert.match(explanation, /금/); // 이 사례의 일간 辛은 금입니다.
  assert.match(explanation, /토|수/); // 두드러진 오행 중 일간과 관계가 있는 재료입니다.
  assert.doesNotMatch(explanation.trim(), /^(모른다|판단 보류)[.!。]?$/);
});

test("화면은 2×4 글자 칸과 다섯 가로막대, 풀이를 계산 근거보다 먼저 표시한다", () => {
  const form = readFileSync(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  assert.match(form, /chartCells\.slice\(0, 4\)/);
  assert.match(form, /chartCells\.slice\(4\)/);
  assert.match(form, /chart-hanja/);
  assert.match(form, /chart-hangul/);
  assert.match(css, /\.chart-character-row\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);

  assert.match(form, /ELEMENT_ORDER\.map\(\(element\)/);
  assert.match(form, /role="meter"/);
  assert.match(form, /aria-valuenow=\{chart\.elements\[element\]\}/);
  assert.match(form, /describeElementDistribution\(chart\)/);
  assert.ok(form.indexOf("describeElementDistribution(chart)") < form.indexOf("className=\"assessment\""));
  for (const element of ["wood", "fire", "earth", "metal", "water"]) {
    assert.match(css, new RegExp(`\\.chart-character\\.element-${element}\\s*\\{`));
    assert.match(css, new RegExp(`\\.element-bar-fill\\.element-${element}\\s*\\{`));
  }
});
