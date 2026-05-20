export type GeoRing = number[][];
export type GeoGeometry =
  | { type: "Polygon"; coordinates: GeoRing[] }
  | { type: "MultiPolygon"; coordinates: GeoRing[][] };

export interface GeoFeature {
  type: "Feature";
  geometry: GeoGeometry;
}

export interface GeoJsonData {
  type: "FeatureCollection";
  features: GeoFeature[];
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) &&
    typeof value[1] === "number" && Number.isFinite(value[1]);
}

function isRing(value: unknown): value is GeoRing {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function isGeometry(value: unknown): value is GeoGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.every(isRing);
  }
  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.every(
      (polygon) => Array.isArray(polygon) && polygon.every(isRing),
    );
  }
  return false;
}

export function validateGeoJson(value: unknown): GeoJsonData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as { type?: unknown; features?: unknown };
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) return null;

  const features = data.features.filter((feature): feature is GeoFeature => {
    if (!feature || typeof feature !== "object") return false;
    const candidate = feature as { type?: unknown; geometry?: unknown };
    return candidate.type === "Feature" && isGeometry(candidate.geometry);
  });
  return features.length === data.features.length && features.length > 0
    ? { type: "FeatureCollection", features }
    : null;
}

export function geometryToSvgPath(geometry: GeoGeometry, project: (lng: number, lat: number) => [number, number]): string {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map((ring) => {
    const points = ring.map(([lng, lat]) => {
      const [x, y] = project(lng, lat);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `M ${points.join(" L ")} Z`;
  })).join(" ");
}

