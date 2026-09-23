import type { SajuChart } from "./chart";
import {
  isReadingTopic,
  isSajuChart,
  parseBaseReading,
  parseTopicReading,
  type BaseReading,
  type ReadingTopic,
  type TopicReading,
} from "./reading";

export const READING_STORAGE_KEY = "saju-readings-v1";

export type SavedReading = {
  id: string;
  createdAt: string;
  chart: SajuChart;
  base: BaseReading;
  topics: Partial<Record<ReadingTopic, TopicReading>>;
};

export type ReadingsLoadResult = { entries: SavedReading[]; error: string | null };

function parseSavedReading(value: unknown): SavedReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || !data.id || typeof data.createdAt !== "string") return null;
  if (Number.isNaN(Date.parse(data.createdAt)) || !isSajuChart(data.chart)) return null;
  const base = parseBaseReading(data.base);
  if (!base || !data.topics || typeof data.topics !== "object" || Array.isArray(data.topics)) return null;
  const topics: SavedReading["topics"] = {};
  for (const [key, value] of Object.entries(data.topics)) {
    if (!isReadingTopic(key)) return null;
    const parsed = parseTopicReading(value, key);
    if (!parsed) return null;
    topics[key] = parsed;
  }
  return { id: data.id, createdAt: data.createdAt, chart: data.chart, base, topics };
}

export function loadSavedReadings(storage: Pick<Storage, "getItem">): ReadingsLoadResult {
  try {
    const raw = storage.getItem(READING_STORAGE_KEY);
    if (raw === null) return { entries: [], error: null };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid storage format");
    const entries = parsed.map(parseSavedReading);
    if (entries.some((entry) => entry === null)) throw new Error("Invalid saved entry");
    return { entries: entries as SavedReading[], error: null };
  } catch {
    return { entries: [], error: "저장된 결과를 읽을 수 없습니다. 기존 자료는 변경하지 않았습니다." };
  }
}

export function writeSavedReadings(storage: Pick<Storage, "setItem">, entries: SavedReading[]): boolean {
  try {
    storage.setItem(READING_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function withoutSavedReading(entries: SavedReading[], id: string): SavedReading[] {
  return entries.filter((entry) => entry.id !== id);
}
