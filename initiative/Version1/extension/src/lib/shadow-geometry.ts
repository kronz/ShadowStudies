import type { SunPosition } from "./sun-position";
import type { Ring, MultiPolygon } from "./polygon-ops";
import { unionPolygons, ensureCCW, closeRing } from "./polygon-ops";
import type { BuildingFootprint } from "./building-geometry";

export type BuildingShadow = {
  path: string;
  isDesign: boolean;
  shadow: MultiPolygon;
};

/** Minimum sun altitude for shadow computation (~2 degrees).
 *  Below this, shadows are unreasonably long and physically meaningless. */
const MIN_SUN_ALTITUDE = 0.035; // radians

/** Hard cap on shadow length to prevent degenerate polygons at very
 *  low sun angles even above MIN_SUN_ALTITUDE. */
const MAX_SHADOW_DISTANCE = 800; // meters

function offsetFootprint(ring: Ring, dx: number, dy: number): Ring {
  return ring.map(([x, y]) => [x + dx, y + dy] as [number, number]);
}

/**
 * Computes the shadow polygon for a single building using uniform
 * offset — every footprint vertex is displaced by the same (dx, dy).
 *
 * Shadow = union(original footprint, offset footprint, connecting quads).
 * This is the standard 2.5D algorithm used by pybdshadow, R shadow,
 * and ArcGIS Sun Shadow Volume.
 */
export function projectBuildingShadow(
  building: BuildingFootprint,
  sun: SunPosition,
): MultiPolygon {
  if (sun.altitude <= MIN_SUN_ALTITUDE) return [];
  if (building.height <= 0) return [];

  const distance = Math.min(
    building.height / Math.tan(sun.altitude),
    MAX_SHADOW_DISTANCE,
  );
  const dx = distance * Math.sin(sun.azimuth);
  const dy = distance * Math.cos(sun.azimuth);

  const original = ensureCCW(building.footprint);
  const projected = offsetFootprint(original, dx, dy);

  const polygonsToUnion: MultiPolygon = [
    [closeRing(original)],
    [closeRing(projected)],
  ];

  const n = original.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const quad: Ring = [
      original[i],
      original[j],
      projected[j],
      projected[i],
      original[i],
    ];
    polygonsToUnion.push([quad]);
  }

  return unionPolygons(polygonsToUnion);
}

/**
 * Computes shadow polygons for all buildings. Synchronous — no terrain
 * queries during computation.
 */
export function computeAllBuildingShadows(
  buildings: BuildingFootprint[],
  sun: SunPosition,
): BuildingShadow[] {
  if (sun.altitude <= MIN_SUN_ALTITUDE) return [];

  const results: BuildingShadow[] = [];

  for (const b of buildings) {
    const shadow = projectBuildingShadow(b, sun);
    if (shadow.length > 0) {
      results.push({ path: b.path, isDesign: b.isDesign, shadow });
    }
  }

  return results;
}

export function mergeShadows(shadows: BuildingShadow[]): MultiPolygon {
  const allPolygons: MultiPolygon = [];
  for (const s of shadows) {
    allPolygons.push(...s.shadow);
  }
  if (allPolygons.length === 0) return [];
  return unionPolygons(allPolygons);
}
