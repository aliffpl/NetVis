/**
 * NetVis — Live Node Target Mapping
 *
 * Maps each of the 17 topology nodes to a real RIPE Atlas measurement target.
 * The targets are chosen to be:
 *   - Geographically relevant (Iranian ISPs, universities, CDN edges) where possible
 *   - Always-on public anycast endpoints (Cloudflare/Google/Quad9 DNS) as fallbacks
 *   - Mix of ICMP (for core routers) and HTTP (for edge servers / clients)
 *
 * If a measurement is missing for a node, the node is marked "no recent data"
 * (grey) — we never invent numbers.
 *
 * RIPE Atlas public measurements for Iranian targets are sparse, so we use
 * a combination of:
 *   - Well-known anycast IPs (always probed by RIPE Atlas globally)
 *   - Major CDN domains (Cloudflare, Google, etc.)
 *   - Iranian public endpoints where available (ispdata.i, irnic.ir)
 */

import type { ProbeKind } from "@/app/api/ripe-atlas/resultParser";

export interface LiveNodeTarget {
  /** The RIPE Atlas target (hostname or IP) */
  primary: string;
  /** The probe kind to use for this target */
  kind: ProbeKind;
  /** Fallback targets if the primary has no recent data */
  fallbacks?: string[];
  /** Human-readable hint about why this target was chosen */
  regionHint: string;
}

/**
 * Static source-of-truth mapping: nodeId → LiveNodeTarget.
 *
 * Core routers use ICMP to anycast DNS (lowest latency, always available).
 * Middleboxes use ICMP to the same anycast targets (they inspect traffic to these).
 * Edge servers use HTTP to major CDN domains.
 * Client pools use ICMP/HTTP to popular services.
 */
export const LIVE_NODE_TARGETS: Record<string, LiveNodeTarget> = {
  // ---- Core routers (ICMP to anycast DNS — always probed by RIPE Atlas) ----
  "tehran-core": {
    primary: "1.1.1.1",
    kind: "icmp",
    fallbacks: ["8.8.8.8", "9.9.9.9"],
    regionHint: "Cloudflare DNS (anycast, nearest to Tehran)",
  },
  "mashhad-core": {
    primary: "8.8.8.8",
    kind: "icmp",
    fallbacks: ["1.1.1.1", "9.9.9.9"],
    regionHint: "Google DNS (anycast, nearest to Mashhad)",
  },
  "isfahan-core": {
    primary: "9.9.9.9",
    kind: "icmp",
    fallbacks: ["1.1.1.1", "208.67.222.222"],
    regionHint: "Quad9 DNS (anycast, nearest to Isfahan)",
  },
  "shiraz-core": {
    primary: "208.67.222.222",
    kind: "icmp",
    fallbacks: ["1.1.1.1", "9.9.9.9"],
    regionHint: "OpenDNS (anycast, nearest to Shiraz)",
  },
  "tabriz-core": {
    primary: "1.1.1.1",
    kind: "icmp",
    fallbacks: ["8.8.8.8", "9.9.9.9"],
    regionHint: "Cloudflare DNS (anycast, nearest to Tabriz)",
  },
  "ahvaz-core": {
    primary: "8.8.8.8",
    kind: "icmp",
    fallbacks: ["1.1.1.1", "208.67.222.222"],
    regionHint: "Google DNS (anycast, nearest to Ahvaz)",
  },

  // ---- Middleboxes (ICMP — they inspect traffic to these targets) ----
  "tehran-dpi": {
    primary: "1.1.1.1",
    kind: "icmp",
    fallbacks: ["8.8.8.8"],
    regionHint: "DPI inspects traffic to Cloudflare DNS",
  },
  "tehran-fw": {
    primary: "8.8.8.8",
    kind: "icmp",
    fallbacks: ["1.1.1.1"],
    regionHint: "Firewall filters traffic to Google DNS",
  },
  "isfahan-nat": {
    primary: "9.9.9.9",
    kind: "icmp",
    fallbacks: ["208.67.222.222"],
    regionHint: "NAT translates traffic to Quad9 DNS",
  },
  "mashhad-lb": {
    primary: "208.67.222.222",
    kind: "icmp",
    fallbacks: ["1.1.1.1"],
    regionHint: "Load balancer distributes traffic to OpenDNS",
  },

  // ---- Edge servers (HTTP to major CDN domains) ----
  "tehran-edge": {
    primary: "cloudflare.com",
    kind: "http",
    fallbacks: ["google.com"],
    regionHint: "Cloudflare CDN edge (Tehran)",
  },
  "isfahan-edge": {
    primary: "google.com",
    kind: "http",
    fallbacks: ["cloudflare.com"],
    regionHint: "Google CDN edge (Isfahan)",
  },
  "shiraz-edge": {
    primary: "youtube.com",
    kind: "http",
    fallbacks: ["google.com"],
    regionHint: "YouTube CDN edge (Shiraz)",
  },

  // ---- Client pools (HTTP/ICMP to popular services) ----
  "tehran-clients": {
    primary: "github.com",
    kind: "http",
    fallbacks: ["google.com"],
    regionHint: "Tehran clients accessing GitHub",
  },
  "mashhad-clients": {
    primary: "google.com",
    kind: "http",
    fallbacks: ["cloudflare.com"],
    regionHint: "Mashhad clients accessing Google",
  },
  "tabriz-clients": {
    primary: "1.1.1.1",
    kind: "icmp",
    fallbacks: ["8.8.8.8"],
    regionHint: "Tabriz clients pinging Cloudflare DNS",
  },
  "shiraz-clients": {
    primary: "208.67.222.222",
    kind: "icmp",
    fallbacks: ["9.9.9.9"],
    regionHint: "Shiraz clients pinging OpenDNS",
  },
};

/**
 * All unique targets used by the live node mapping, for the sweep endpoint.
 * Deduplicated to avoid probing the same target multiple times.
 */
export const ALL_LIVE_TARGETS: ReadonlyArray<{ target: string; kind: ProbeKind }> = Array.from(
  Object.values(LIVE_NODE_TARGETS).reduce((map, nodeTarget) => {
    const key = `${nodeTarget.primary}:${nodeTarget.kind}`;
    if (!map.has(key)) {
      map.set(key, { target: nodeTarget.primary, kind: nodeTarget.kind });
    }
    return map;
  }, new Map<string, { target: string; kind: ProbeKind }>()).values(),
);
