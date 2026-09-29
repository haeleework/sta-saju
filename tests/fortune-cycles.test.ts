import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculate } from "../lib/saju/chart";
import {
  calculateFortuneCycles,
  type FortuneGender,
} from "../lib/saju/fortune-cycles";
import { buildReadingPrompt } from "../lib/saju/reading";

const time = "08:37";

function cycles(date: string, gender: FortuneGender, referenceYear = 2026) {
  const chart = calculate({ date, time, calendar: "solar", topic: "general", question: "" });
  return {
    chart,
    fortune: calculateFortuneCycles({ date, time, gender }, chart, referenceYear),
  };
}

test("양년과 음년 모두 남녀에 따라 순행·역행이 반전된다", () => {
  const yangMale = cycles("2004-12-23", "male");
  const yangFemale = cycles("2004-12-23", "female");
  assert.equal(yangMale.chart.pillars[0].stem, "甲");
  assert.equal(yangMale.fortune.direction, "forward");
  assert.equal(yangFemale.fortune.direction, "backward");

  const yinMale = cycles("2005-12-23", "male");
  const yinFemale = cycles("2005-12-23", "female");
  assert.equal(yinMale.chart.pillars[0].stem, "乙");
  assert.equal(yinMale.fortune.direction, "backward");
  assert.equal(yinFemale.fortune.direction, "forward");
});

test("sect=1 기준 첫 대운 오프셋과 시작 시각이 알려진 기준값과 일치한다", () => {
  const backward = cycles("2005-12-23", "male").fortune;
  assert.deepEqual(backward.startOffset, { years: 5, months: 4, days: 0, hours: 0 });
  assert.equal(backward.firstStartDate, "2011-04-23 08:37");

  const forward = cycles("2005-12-23", "female").fortune;
  assert.deepEqual(forward.startOffset, { years: 4, months: 6, days: 0, hours: 0 });
  assert.equal(forward.firstStartDate, "2010-06-23 08:37");
  assert.match(forward.ageMethod, /3일=1년.*sect=1/);
});

test("대운 경계 연도는 앞뒤 기간에 한 번씩만 속하고 각 대운은 세운 10개를 가진다", () => {
  const endBoundary = cycles("2005-12-23", "male", 2020).fortune;
  assert.deepEqual(
    [endBoundary.currentPeriod?.ganZhi, endBoundary.currentPeriod?.startYear, endBoundary.currentPeriod?.endYear],
    ["丁亥", 2011, 2020],
  );
  assert.equal(endBoundary.annual.length, 10);
  assert.deepEqual(endBoundary.annual[0], {
    year: 2011,
    age: 7,
    ganZhi: "辛卯",
    stemRelation: { element: "금", label: "나와 비슷한 힘" },
    branchRelation: { element: "목", label: "계획하고 자원을 다루는 힘" },
  });
  assert.deepEqual(
    [endBoundary.annual.at(-1)?.year, endBoundary.annual.at(-1)?.age, endBoundary.annual.at(-1)?.ganZhi],
    [2020, 16, "庚子"],
  );

  const nextBoundary = cycles("2005-12-23", "male", 2021).fortune;
  assert.deepEqual(
    [nextBoundary.currentPeriod?.ganZhi, nextBoundary.currentPeriod?.startYear, nextBoundary.currentPeriod?.endYear],
    ["丙戌", 2021, 2030],
  );
  assert.equal(nextBoundary.annual.length, 10);
  assert.deepEqual(
    nextBoundary.annual.map(({ year, age, ganZhi }) => [year, age, ganZhi]),
    [
      [2021, 17, "辛丑"], [2022, 18, "壬寅"], [2023, 19, "癸卯"],
      [2024, 20, "甲辰"], [2025, 21, "乙巳"], [2026, 22, "丙午"],
      [2027, 23, "丁未"], [2028, 24, "戊申"], [2029, 25, "己酉"],
      [2030, 26, "庚戌"],
    ],
  );
});

test("허용되지 않은 성별과 기준 연도는 계산하지 않는다", () => {
  const date = "2005-12-23";
  const chart = calculate({ date, time, calendar: "solar", topic: "general", question: "" });
  assert.throws(
    () => calculateFortuneCycles({ date, time, gender: "other" as FortuneGender }, chart),
    /성별을 선택해 주세요/,
  );
  assert.throws(
    () => calculateFortuneCycles({ date, time, gender: "male" }, chart, 2026.5),
    /기준 연도/,
  );
});

test("UI는 성별을 필수로 받고 대운·세운과 현재 기준 연도를 쉬운 말로 설명한다", () => {
  const source = readFileSync(new URL("../app/saju-form.tsx", import.meta.url), "utf8");
  assert.match(source, /<select id="gender" name="gender"[^>]*required>/);
  assert.match(source, /성별은 전통 규칙에 따라 대운의 진행 방향을 정할 때만 사용합니다/);
  assert.match(source, /대운<\/strong>은 약 10년씩 이어지는 큰 흐름/);
  assert.match(source, /세운<\/strong>은 한 해씩 바뀌는 흐름/);
  assert.match(source, /fortune\.referenceYear}년이 속한 대운/);
  assert.match(source, /year\.year === fortune\.referenceYear \? " · 현재"/);
  assert.match(source, /실제 사건을 예언하는 말이 아닙니다/);
});

test("Gemini 프롬프트에는 원본 생년월일시·성별을 넣지 않는다", () => {
  const date = "2005-12-23";
  const { chart } = cycles(date, "male");
  const prompt = buildReadingPrompt(chart, { date, time, kind: "base" });
  assert.doesNotMatch(prompt, /2005-12-23|08:37|male|female/);
});
