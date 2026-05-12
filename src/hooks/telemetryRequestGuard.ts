export function canApplyTelemetryUpdate(
  requestGeneration: number,
  activeGeneration: number,
  signal: AbortSignal,
  requestSource: string,
  activeSource: string,
): boolean {
  return !signal.aborted && requestGeneration === activeGeneration && requestSource === activeSource;
}

