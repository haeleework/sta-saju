import type { SajuChart } from "./chart";
import { analyzeAdvancedReading } from "./advanced-reading";
import { analyzeDayMaster } from "./strength";

export const READING_MODEL = "gemini-3.5-flash-lite";

export const READING_TOPICS = {
  strength: "성격·강점",
  relationship: "연애·관계",
  career: "일·진로",
  money: "재물",
} as const;

export type ReadingTopic = keyof typeof READING_TOPICS;

export type BaseReading = {
  summary: string;
  highlights: string[];
  caution: string;
};

export type TopicReading = {
  topic: ReadingTopic;
  title: string;
  reading: string;
  reflectionQuestion: string;
};

export type ReadingRequest =
  | { date: string; time: string; kind: "base" }
  | { date: string; time: string; kind: "topic"; topic: ReadingTopic };

const text = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function isReadingTopic(value: unknown): value is ReadingTopic {
  return typeof value === "string" && value in READING_TOPICS;
}

export function parseBaseReading(value: unknown): BaseReading | null {
  const data = record(value);
  if (!data) return null;
  const summary = text(data.summary, 700);
  const caution = text(data.caution, 400);
  if (!Array.isArray(data.highlights) || data.highlights.length < 2 || data.highlights.length > 3) return null;
  const highlights = data.highlights.map((item: unknown) => text(item, 400));
  if (!summary || !caution || highlights.some((item) => item === null)) return null;
  return { summary, highlights: highlights as string[], caution };
}

export function parseTopicReading(value: unknown, expectedTopic?: ReadingTopic): TopicReading | null {
  const data = record(value);
  if (!data || !isReadingTopic(data.topic)) return null;
  if (expectedTopic && data.topic !== expectedTopic) return null;
  const title = text(data.title, 100);
  const reading = text(data.reading, 1500);
  const reflectionQuestion = text(data.reflectionQuestion, 250);
  if (!title || !reading || !reflectionQuestion) return null;
  return { topic: data.topic, title, reading, reflectionQuestion };
}

export function hasReadingConflict(chart: SajuChart, reading: BaseReading | TopicReading): boolean {
  const content = "summary" in reading
    ? [reading.summary, ...reading.highlights, reading.caution].join(" ")
    : [reading.title, reading.reading, reading.reflectionQuestion].join(" ");
  const pillars = new Map(chart.pillars.map((pillar) => [pillar.label, pillar.korean]));
  for (const match of content.matchAll(/(년주|월주|일주|시주)\s*(?:는|은|가|이|:|：)?\s*([갑을병정무기경신임계][자축인묘진사오미신유술해])/g)) {
    const expected = pillars.get(match[1]);
    if (expected && expected !== match[2]) return true;
  }
  const counts = [
    ...content.matchAll(/([목화토금수])\s*(?:가|이|은|는)?\s*(\d)\s*개/g),
    ...content.matchAll(/([목화토금수])\(\s*(\d)\s*개\s*\)/g),
  ];
  return counts.some((match) => chart.elements[match[1] as keyof SajuChart["elements"]] !== Number(match[2]));
}

export function isSajuChart(value: unknown): value is SajuChart {
  const data = record(value);
  if (!data || !Array.isArray(data.pillars) || data.pillars.length !== 4) return false;
  if (!data.pillars.every((item: unknown) => {
    const pillar = record(item);
    return pillar && ["label", "text", "korean", "stem", "branch", "stemElement", "branchElement"]
      .every((key) => text(pillar[key], 20));
  })) return false;
  const elements = record(data.elements);
  const dayMaster = record(data.dayMaster);
  if (!elements || !dayMaster) return false;
  if (!["목", "화", "토", "금", "수"].every((key) =>
    typeof elements[key] === "number" && Number.isInteger(elements[key]) && (elements[key] as number) >= 0 && (elements[key] as number) <= 8
  )) return false;
  return Boolean(
    text(dayMaster.character, 10) && text(dayMaster.korean, 10) && text(dayMaster.element, 10) &&
    text(data.method, 200) && text(data.engine, 100) && text(data.elementMethod, 300)
  );
}

export const baseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    caution: { type: "string" },
  },
  required: ["summary", "highlights", "caution"],
};

export const topicSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    title: { type: "string" },
    reading: { type: "string" },
    reflectionQuestion: { type: "string" },
  },
  required: ["topic", "title", "reading", "reflectionQuestion"],
};

export function buildReadingPrompt(chart: SajuChart, request: ReadingRequest): string {
  const assessment = analyzeDayMaster(chart);
  const advancedReading = analyzeAdvancedReading(chart);
  const chartData = {
    pillars: chart.pillars.map(({ label, korean, stemElement, branchElement }) => ({
      label,
      korean,
      stemElement,
      branchElement,
    })),
    elements: chart.elements,
    dayMaster: chart.dayMaster,
    method: chart.method,
    elementMethod: chart.elementMethod,
    dayMasterAssessment: assessment,
    advancedReading,
  };

  const task = request.kind === "base"
    ? "기본 해석을 작성하세요. summary는 쉬운 한국어 2~4문장, highlights는 서로 다른 관점의 짧은 설명 2~3개, caution은 해석의 한계를 알려주는 1문장으로 작성하세요."
    : `관심 주제 '${READING_TOPICS[request.topic]}'의 상세 해석을 작성하세요. topic은 '${request.topic}'으로 정확히 출력하고, title, reading(3~5문장), reflectionQuestion(질문 1개)을 작성하세요.`;

  return [
    "당신은 사주 계산 결과를 일상 언어로 풀어주는 한국어 작성자입니다.",
    "아래 계산값만 근거로 사용하세요. 사주를 다시 계산하거나 주어진 기둥, 오행, 일간과 다른 값을 만들지 마세요.",
    "오행 숫자는 여덟 글자의 단순 개수이며 강약이나 균형을 판정한 값이 아닙니다. 개수가 많거나 적다는 이유만으로 특정 오행이 강하다, 약하다, 부족하다거나 성격을 결정한다고 쓰지 마세요.",
    "dayMasterAssessment는 코드가 계절·지장간의 뿌리·나머지 글자와의 관계로 만든 보수적인 1차 분류입니다. supported는 받쳐 주는 단서가 많음, unsupported는 적음, mixed는 판단 보류입니다. 이를 다시 계산하거나 결론을 뒤집지 마세요.",
    "advancedReading은 코드가 계산한 십성과 천간합·지지합·지지충입니다. 십성은 일간과 다른 글자의 전통적인 역할 이름이며, 아랫글자는 지장간의 본기를 기준으로 했습니다. 값을 다시 계산하거나 제공하지 않은 삼합·방합·천간충·형·해·파를 만들어내지 마세요. 합을 다른 오행으로 변했다고 단정하거나 합·충을 실제 사건 예언으로 쓰지 마세요.",
    "사주를 처음 접하는 초등학생도 이해할 쉬운 한국어와 존댓말로 쓰세요. 낯선 용어를 처음 쓸 때는 일상적인 뜻을 짧게 풀어주세요.",
    "계산값을 길게 나열하는 데 그치지 말고, 일간과 기둥이 전통적으로 상징하는 관점을 쉬운 말로 풀어 주세요. 이는 확인된 성격이 아니라 스스로를 돌아볼 때 참고할 수 있는 가능성임을 드러내세요.",
    "단정적인 미래 예언, 질병 진단, 투자·법률 지시를 하지 마세요. 가능성과 자기 성찰의 관점으로 설명하세요.",
    "사주 구성으로 알 수 없는 개인의 실제 성격이나 경험을 아는 것처럼 말하지 마세요.",
    task,
    `계산 결과: ${JSON.stringify(chartData)}`,
  ].join("\n");
}
