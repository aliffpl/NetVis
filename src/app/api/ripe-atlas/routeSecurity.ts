import { isIP } from "node:net";
import type { ProbeKind } from "./resultParser";

export const MAX_TARGET_LENGTH = 253;
export const MAX_MODE_LENGTH = 16;
export const MAX_KIND_LENGTH = 16;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 30;

export type ProbeMode = "probe" | "sweep" | "topology-sweep";

const PROBE_KINDS: readonly ProbeKind[] = ["http", "dns", "icmp", "traceroute"];

export function parseProbeMode(value: string): ProbeMode | null {
  return value === "probe" || value === "sweep" || value === "topology-sweep" ? value : null;
}

export function parseProbeKind(value: string): ProbeKind | null {
  return PROBE_KINDS.includes(value as ProbeKind) ? value as ProbeKind : null;
}

export function validTarget(target: string): boolean {
  if (!target || target.length > MAX_TARGET_LENGTH || /[\s\u0000-\u001f\u007f]/.test(target)) return false;
  if (isIP(target) !== 0) return true;
  if (target.startsWith(".") || target.endsWith(".")) return false;
  return target.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-") && /^[A-Za-z0-9-]+$/.test(label),
  );
}

export interface RateLimitState {
  startedAt: number;
  count: number;
}

export function consumeRateLimit(
  limits: Map<string, RateLimitState>,
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const current = limits.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    limits.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000) };
  }
  current.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}

