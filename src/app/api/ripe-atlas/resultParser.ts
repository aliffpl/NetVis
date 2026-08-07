export type ProbeKind = "http" | "dns" | "icmp" | "traceroute";
export type AtlasResult = Record<string, unknown>;

export interface ProbeOutcome {
  target: string;
  kind: ProbeKind;
  label: string;
  rttMs?: number;
  statusCode?: number;
  packetLoss?: number;
  sent?: number;
  received?: number;
  hops?: Array<{ ttl: number; host: string; rttMs: number }>;
  error?: string;
  succeeded: boolean;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = nonNegativeNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function pingRtt(result: AtlasResult): number | undefined {
  return nonNegativeNumber(result.avg) ??
    nonNegativeNumber(result.rtt) ??
    nonNegativeNumber(result.rtt_average) ??
    nonNegativeNumber(result.rt) ??
    nonNegativeNumber(result.max);
}

function httpStatusCode(result: AtlasResult): number | undefined {
  const httpResult = result.result;
  if (!httpResult || typeof httpResult !== "object" || Array.isArray(httpResult)) return undefined;
  const statusCode = (httpResult as AtlasResult).http_code;
  return typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
    ? statusCode
    : undefined;
}

export function parseAtlasResult(result: AtlasResult, kind: ProbeKind, target: string): ProbeOutcome {
  const hops = kind === "traceroute" && Array.isArray(result.result)
    ? result.result.map((hop, index) => {
        const item = hop as AtlasResult;
        const hopRtt = positiveNumber(item.rtt) ?? positiveNumber(item.rtt_average) ?? positiveNumber(item.min);
        return hopRtt === undefined ? null : { ttl: positiveNumber(item.hop) ?? index + 1, host: String(item.from ?? item.ip ?? "*"), rttMs: hopRtt };
      })
      .filter((hop): hop is { ttl: number; host: string; rttMs: number } => hop !== null)
    : undefined;

  const rtt = kind === "icmp"
    ? pingRtt(result)
    : positiveNumber(result.rt) ??
    positiveNumber(result.rtt) ??
    positiveNumber(result.rtt_average) ??
    positiveNumber(result.avg) ??
    positiveNumber(result.max) ??
    (hops ? [...hops].reverse().find((hop) => hop.rttMs > 0)?.rttMs : undefined);

  const sent = nonNegativeNumber(result.sent);
  const received = nonNegativeNumber(result.rcvd) ?? nonNegativeNumber(result.received);
  const lossRaw = nonNegativeNumber(result.lost) ?? nonNegativeNumber(result.loss);
  const packetLoss = kind === "icmp" && sent !== undefined && sent > 0 && received !== undefined
    ? Math.max(0, Math.min(1, (sent - received) / sent))
    : lossRaw === undefined ? undefined : lossRaw > 1 ? lossRaw / 100 : lossRaw;
  const succeeded = kind === "icmp"
    ? sent !== undefined && received !== undefined && sent > 0 && received > 0 && rtt !== undefined
    : rtt !== undefined || (hops !== undefined && hops.length > 0);

  return {
    target, kind, label: target, rttMs: succeeded ? rtt : undefined,
    statusCode: kind === "http" ? httpStatusCode(result) : undefined,
    packetLoss, hops, succeeded,
    sent: kind === "icmp" ? sent : undefined,
    received: kind === "icmp" ? received : undefined,
  };
}

export function aggregatePacketLoss(outcomes: ProbeOutcome[]): number {
  const counted = outcomes.filter((outcome) =>
    outcome.sent !== undefined && outcome.sent > 0 && outcome.received !== undefined &&
    outcome.received >= 0 && outcome.received <= outcome.sent,
  );
  const totalSent = counted.reduce((sum, outcome) => sum + (outcome.sent ?? 0), 0);
  if (totalSent > 0) {
    const totalReceived = counted.reduce((sum, outcome) => sum + (outcome.received ?? 0), 0);
    return (totalSent - totalReceived) / totalSent;
  }

  const losses = outcomes.flatMap((outcome) => outcome.packetLoss === undefined ? [] : [outcome.packetLoss]);
  return losses.length ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;
}

