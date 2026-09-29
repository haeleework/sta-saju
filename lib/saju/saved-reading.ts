import type { SajuChart } from "./chart";
import type { BaseReading, ReadingTopic, TopicReading } from "./reading";

export type SavedReading = {
  id: string;
  createdAt: string;
  chart: SajuChart;
  base: BaseReading;
  topics: Partial<Record<ReadingTopic, TopicReading>>;
};
