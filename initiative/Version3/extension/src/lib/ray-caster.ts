import type { Vec3, AABB, BuildingMesh } from "./scene-geometry";
import type { AnalysisGrid } from "./analysis-grid";
import type { SunPosition } from "./sun-position";

/**
 * Shadow classification per grid cell.
 */
export const enum ShadowClass {
  Sunlit = 0,
  ContextShadow = 1,
  DesignShadow = 2,
}

/**
 * Computes the sun direction unit vector (from ground toward sun).
 *
 * Forma coordinate system: x = east, y = north, z = up.
 * suncalc azimuth: 0 = south, positive clockwise toward west.
 *
 * Shadow falls in direction (+sin(az), +cos(az)) so the sun is in
 * the opposite direction: (-sin(az), -cos(az)).
 */
export function sunDirectionVector(sun: SunPosition): Vec3 {
  const cosAlt = Math.cos(sun.altitude);
  return [
    -Math.sin(sun.azimuth) * cosAlt,
    -Math.cos(sun.azimuth) * cosAlt,
    Math.sin(sun.altitude),
  ];
}

// ────────────────────────────────────────────────────────────
// Moller-Trumbore ray-triangle intersection
// ────────────────────────────────────────────────────────────

const EPSILON = 1e-8;

/**
 * Returns the distance t along the ray if the ray intersects the triangle,
 * or -1 if no intersection. Uses the Moller-Trumbore algorithm.
 *
 * Ray: origin + t * direction, t > 0
 */
function rayTriangleIntersect(
  origin: Vec3,
  dir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
): number {
  const edge1x = v1[0] - v0[0];
  const edge1y = v1[1] - v0[1];
  const edge1z = v1[2] - v0[2];

  const edge2x = v2[0] - v0[0];
  const edge2y = v2[1] - v0[1];
  const edge2z = v2[2] - v0[2];

  // h = dir × edge2
  const hx = dir[1] * edge2z - dir[2] * edge2y;
  const hy = dir[2] * edge2x - dir[0] * edge2z;
  const hz = dir[0] * edge2y - dir[1] * edge2x;

  const a = edge1x * hx + edge1y * hy + edge1z * hz;
  if (a > -EPSILON && a < EPSILON) return -1;

  const f = 1 / a;
  const sx = origin[0] - v0[0];
  const sy = origin[1] - v0[1];
  const sz = origin[2] - v0[2];

  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return -1;

  // q = s × edge1
  const qx = sy * edge1z - sz * edge1y;
  const qy = sz * edge1x - sx * edge1z;
  const qz = sx * edge1y - sy * edge1x;

  const v = f * (dir[0] * qx + dir[1] * qy + dir[2] * qz);
  if (v < 0 || u + v > 1) return -1;

  const t = f * (edge2x * qx + edge2y * qy + edge2z * qz);
  if (t > EPSILON) return t;

  return -1;
}

// ────────────────────────────────────────────────────────────
// AABB-ray intersection (slab method)
// ────────────────────────────────────────────────────────────

function rayAABBIntersect(origin: Vec3, invDir: Vec3, aabb: AABB): boolean {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    const t1 = (aabb.min[i] - origin[i]) * invDir[i];
    const t2 = (aabb.max[i] - origin[i]) * invDir[i];
    const tNear = Math.min(t1, t2);
    const tFar = Math.max(t1, t2);
    tmin = Math.max(tmin, tNear);
    tmax = Math.min(tmax, tFar);
  }

  return tmax >= Math.max(tmin, 0);
}

// ────────────────────────────────────────────────────────────
// Main ray casting
// ────────────────────────────────────────────────────────────

/**
 * For each grid cell, casts a ray toward the sun and tests for
 * intersection against building meshes. Returns a Uint8Array of
 * ShadowClass values (one per cell).
 *
 * Algorithm (same as Radiance's rtrace):
 * 1. Compute sun direction vector
 * 2. For each analysis grid cell:
 *    a. Ray origin = cell center (x, y, z + small offset above terrain)
 *    b. Ray direction = toward sun
 *    c. Test AABB of each building — skip if ray misses bounding box
 *    d. For buildings whose AABB is hit, run Moller-Trumbore on each triangle
 *    e. If any triangle hit: classify by whether the building is design or context
 *       (design shadow takes priority over context shadow)
 */
export function castShadowRays(
  grid: AnalysisGrid,
  buildings: BuildingMesh[],
  sun: SunPosition,
): Uint8Array {
  const cellCount = grid.cells.length;
  const classifications = new Uint8Array(cellCount);

  if (sun.altitude <= 0) return classifications;

  const dir = sunDirectionVector(sun);
  const invDir: Vec3 = [
    Math.abs(dir[0]) < EPSILON ? 1e12 : 1 / dir[0],
    Math.abs(dir[1]) < EPSILON ? 1e12 : 1 / dir[1],
    Math.abs(dir[2]) < EPSILON ? 1e12 : 1 / dir[2],
  ];

  const Z_OFFSET = 0.3;

  for (let i = 0; i < cellCount; i++) {
    const cell = grid.cells[i];
    const origin: Vec3 = [cell.x, cell.y, cell.z + Z_OFFSET];

    let hitDesign = false;
    let hitContext = false;

    for (const building of buildings) {
      if (!rayAABBIntersect(origin, invDir, building.aabb)) continue;

      let hitThisBuilding = false;
      for (const tri of building.triangles) {
        const t = rayTriangleIntersect(origin, dir, tri[0], tri[1], tri[2]);
        if (t > 0) {
          hitThisBuilding = true;
          break;
        }
      }

      if (hitThisBuilding) {
        if (building.isDesign) {
          hitDesign = true;
        } else {
          hitContext = true;
        }
      }
    }

    if (hitDesign) {
      classifications[i] = ShadowClass.DesignShadow;
    } else if (hitContext) {
      classifications[i] = ShadowClass.ContextShadow;
    }
  }

  return classifications;
}
