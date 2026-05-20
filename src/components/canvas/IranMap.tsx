"use client";

import { useEffect, useState } from "react";
import { useViewport } from "@xyflow/react";
import { geometryToSvgPath, validateGeoJson, type GeoJsonData } from "./geoJsonPaths";

/**
 * FIX #3: IranMap now uses the SAME (lng, lat) → (x, y) projection as the
 * network nodes (x = ((lng - 44) / 20) * 1600, y = ((40 - lat) / 13) * 1200),
 * so the country outline aligns perfectly with the nodes spread across the
 * 1600×1200 canvas. The wrapping div is anchored to the React Flow viewport
 * via useViewport() so the map scales and pans seamlessly with the topology.
 */

const LNG_MIN = 44;
const LNG_RANGE = 20;
const LAT_MAX = 40;
const LAT_RANGE = 13;
const CANVAS_W = 1600;
const CANVAS_H = 1200;

function project(lng: number, lat: number): [number, number] {
  const x = ((lng - LNG_MIN) / LNG_RANGE) * CANVAS_W;
  const y = ((LAT_MAX - lat) / LAT_RANGE) * CANVAS_H;
  return [x, y];
}

export function IranMap() {
  const [geoData, setGeoData] = useState<GeoJsonData | null>(null);
  const { x, y, zoom } = useViewport();

  useEffect(() => {
    fetch("/data/ir.json")
      .then((res) => res.json())
      .then((data) => setGeoData(validateGeoJson(data)))
      .catch((err) => console.error("Failed to load ir.json:", err));
  }, []);

  if (!geoData) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 origin-top-left opacity-30"
      style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}
    >
      <svg
        width={CANVAS_W}
        height={CANVAS_H}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="stroke-cyan-500/40 fill-cyan-500/[0.04]"
      >
        {geoData.features.map((feature, idx) => (
          <path
            key={idx}
            d={geometryToSvgPath(feature.geometry, project)}
            fillRule="evenodd"
            clipRule="evenodd"
            className="fill-cyan-500/[0.04] stroke-cyan-500/40"
            strokeWidth={1.2}
          />
        ))}
      </svg>
    </div>
  );
}
