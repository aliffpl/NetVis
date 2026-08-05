export type AtlasResult = Record<string, unknown>;

export const RESULT_WINDOW_SECONDS = 600;

export interface MeasurementCandidate {
  id: number;
  target: string;
  is_public?: boolean;
  status?: { id?: number };
  start_time?: unknown;
  creation_time?: unknown;
  latest_result_time?: unknown;
  latest_result_timestamp?: unknown;
}

export interface SelectedMeasurement extends MeasurementCandidate {
  results: AtlasResult[];
}

function timestampSeconds(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 100_000_000_000 ? numeric / 1000 : numeric;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed / 1000;
}

function resultTimestamp(result: AtlasResult): number | undefined {
  return timestampSeconds(result.timestamp ?? result.time ?? result.ts);
}

export function selectMeasurementCandidate(
  candidates: Array<MeasurementCandidate & { results: AtlasResult[] }>,
  nowSeconds: number,
  windowSeconds = RESULT_WINDOW_SECONDS,
): SelectedMeasurement | null {
  const windowStart = nowSeconds - windowSeconds;
  return candidates
    .filter((candidate) => {
      if (candidate.is_public !== true || !Number.isInteger(candidate.id) || !candidate.target) return false;
      const recentResults = candidate.results.filter((result) => {
        const timestamp = resultTimestamp(result);
        return timestamp !== undefined && timestamp >= windowStart && timestamp <= nowSeconds;
      });
      return candidate.status?.id === 2 || recentResults.length > 0;
    })
    .map((candidate) => ({
      ...candidate,
      results: candidate.results.filter((result) => {
        const timestamp = resultTimestamp(result);
        return timestamp !== undefined && timestamp >= windowStart && timestamp <= nowSeconds;
      }),
    }))
    .sort((left, right) => {
      const recency = (candidate: SelectedMeasurement) => Math.max(
        ...candidate.results.map((result) => resultTimestamp(result) ?? 0),
        timestampSeconds(candidate.latest_result_timestamp) ?? timestampSeconds(candidate.latest_result_time) ??
          timestampSeconds(candidate.start_time) ?? timestampSeconds(candidate.creation_time) ?? 0,
      );
      return recency(right) - recency(left);
    })[0] ?? null;
}

