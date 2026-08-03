export function nearestRankPercentile(values: number[], percentile: number): number | undefined {
  const valid = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (valid.length === 0) return undefined;

  // Nearest-rank uses the smallest 1-based rank greater than or equal to p*n.
  const rank = Math.max(1, Math.ceil(percentile * valid.length));
  return valid[Math.min(rank, valid.length) - 1];
}

