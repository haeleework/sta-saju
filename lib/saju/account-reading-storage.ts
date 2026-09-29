import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isReadingTopic,
  isSajuChart,
  parseBaseReading,
  parseTopicReading,
  type ReadingTopic,
} from "./reading";
import type { SavedReading } from "./saved-reading";

export const ACCOUNT_READING_PAGE_SIZE = 20;

const ACCOUNT_READING_COLUMNS = [
  "id",
  "source_id",
  "interpreted_at",
  "saved_at",
  "updated_at",
  "schema_version",
  "chart",
  "base_reading",
  "topic_readings",
  "alias",
].join(",");

export type AccountSavedReading = SavedReading & {
  databaseId: number;
  savedAt: string;
  updatedAt: string;
  alias: string | null;
};

export type AccountReadingPage = {
  entries: AccountSavedReading[];
  invalidCount: number;
  hasMore: boolean;
  rowsRead: number;
};

export class AccountReadingStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountReadingStorageError";
  }
}

export function normalizeReadingAlias(value: string): string | null {
  const alias = value.trim();
  if (!alias) return null;
  if (Array.from(alias).length > 30 || /[\u0000-\u001f\u007f]/u.test(alias)) {
    throw new AccountReadingStorageError("별칭은 줄바꿈 없이 30글자 이내로 입력해 주세요.");
  }
  return alias;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalJson(nested)]),
  );
}

export function areSajuChartsEqual(left: unknown, right: unknown): boolean {
  return isSajuChart(left) && isSajuChart(right) &&
    JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

export function parseAccountReadingRow(value: unknown): AccountSavedReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id < 1 ||
    typeof row.source_id !== "string" || !isUuid(row.source_id) ||
    row.schema_version !== 1 ||
    !validDate(row.interpreted_at) || !validDate(row.saved_at) || !validDate(row.updated_at) ||
    (row.alias !== undefined && row.alias !== null &&
      (typeof row.alias !== "string" || row.alias !== row.alias.trim() ||
        row.alias.length === 0 || Array.from(row.alias).length > 30 || /[\u0000-\u001f\u007f]/u.test(row.alias))) ||
    !isSajuChart(row.chart)
  ) return null;

  const base = parseBaseReading(row.base_reading);
  if (!base || !row.topic_readings || typeof row.topic_readings !== "object" || Array.isArray(row.topic_readings)) return null;
  const topics: SavedReading["topics"] = {};
  for (const [key, reading] of Object.entries(row.topic_readings)) {
    if (!isReadingTopic(key)) return null;
    const parsed = parseTopicReading(reading, key as ReadingTopic);
    if (!parsed) return null;
    topics[key as ReadingTopic] = parsed;
  }

  return {
    databaseId: row.id,
    id: row.source_id,
    createdAt: row.interpreted_at,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    alias: typeof row.alias === "string" ? row.alias : null,
    chart: row.chart,
    base,
    topics,
  };
}

function toPayload(entry: SavedReading, alias?: string | null) {
  if (!isUuid(entry.id)) {
    throw new AccountReadingStorageError("이 결과의 식별자를 확인할 수 없어 계정에 저장하지 못했습니다.");
  }
  return {
    source_id: entry.id,
    interpreted_at: entry.createdAt,
    schema_version: 1,
    chart: entry.chart,
    base_reading: entry.base,
    topic_readings: entry.topics,
    ...(alias === undefined ? {} : { alias: alias === null ? null : normalizeReadingAlias(alias) }),
  };
}

function parseRequiredRow(value: unknown): AccountSavedReading {
  const parsed = parseAccountReadingRow(value);
  if (!parsed) throw new AccountReadingStorageError("저장된 결과의 형식을 확인할 수 없습니다.");
  return parsed;
}

export async function loadAccountReadings(
  client: SupabaseClient,
  offset = 0,
  limit = ACCOUNT_READING_PAGE_SIZE,
): Promise<AccountReadingPage> {
  const { data, error } = await client
    .from("saju_readings")
    .select(ACCOUNT_READING_COLUMNS)
    .order("saved_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new AccountReadingStorageError("계정 저장 결과를 불러오지 못했습니다. 다시 시도해 주세요.");

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const parsed = rows.map(parseAccountReadingRow);
  return {
    entries: parsed.filter((entry): entry is AccountSavedReading => entry !== null),
    invalidCount: parsed.filter((entry) => entry === null).length,
    hasMore: rows.length === limit,
    rowsRead: rows.length,
  };
}

async function findAccountReading(client: SupabaseClient, sourceId: string): Promise<AccountSavedReading | null> {
  const { data, error } = await client
    .from("saju_readings")
    .select(ACCOUNT_READING_COLUMNS)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (error || data === null) return null;
  return parseAccountReadingRow(data);
}

export async function saveAccountReading(client: SupabaseClient, entry: SavedReading, alias?: string | null): Promise<AccountSavedReading> {
  const payload = toPayload(entry, alias);
  const { data, error } = await client
    .from("saju_readings")
    .upsert(payload, { onConflict: "user_id,source_id", defaultToNull: false })
    .select(ACCOUNT_READING_COLUMNS)
    .single();
  if (!error) return parseRequiredRow(data);

  // The response can be lost after Postgres committed the row. Re-read by the
  // per-user source id before reporting failure or allowing a retry.
  const existing = await findAccountReading(client, entry.id);
  const expectedAlias = alias === undefined ? undefined : alias === null ? null : normalizeReadingAlias(alias);
  if (existing && (expectedAlias === undefined || existing.alias === expectedAlias) &&
    JSON.stringify(canonicalJson(existing.topics)) === JSON.stringify(canonicalJson(entry.topics))) return existing;
  throw new AccountReadingStorageError("계정에 저장되지 않았습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
}

export async function deleteAccountReading(client: SupabaseClient, databaseId: number): Promise<void> {
  const { data, error } = await client
    .from("saju_readings")
    .delete()
    .eq("id", databaseId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new AccountReadingStorageError("계정 저장 결과를 삭제하지 못했습니다. 다시 시도해 주세요.");
  }
}
