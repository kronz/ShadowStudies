import * as polyclip from "polyclip-ts";
import earcut from "earcut";

export type Point2D = [number, number];
export type Ring = Point2D[];
/**
 * A polygon with an outer ring and optional holes.
 * Follows GeoJSON winding: outer ring = counterclockwise, holes = clockwise.
 */
export type Polygon = Ring[];
/** Multiple non-overlapping polygons, as returned by boolean operations. */
export type MultiPolygon = Polygon[];

/**
 * Computes the union of multiple polygons.
 *
 * Uses polyclip-ts which implements the Greiner-Hormann / Martinez algorithm
 * for robust polygon clipping with floating-point coordinates.
 */
export function unionPolygons(polygons: MultiPolygon): MultiPolygon {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons;

  const first = toPolyclipGeom(polygons[0]);
  const rest = polygons.slice(1).map(toPolyclipGeom);
  const result = polyclip.union(first, ...rest);
  return fromPolyclipResult(result);
}

/**
 * Computes A minus B: the area in A that is not covered by B.
 */
export function differencePolygons(
  a: MultiPolygon,
  b: MultiPolygon,
): MultiPolygon {
  if (a.length === 0) return [];
  if (b.length === 0) return a;

  const aGeom = multiToPolyclipGeom(a);
  const bGeom = multiToPolyclipGeom(b);
  const result = polyclip.difference(aGeom, bGeom);
  return fromPolyclipResult(result);
}

/**
 * Computes the intersection of two multipolygons.
 */
export function intersectPolygons(
  a: MultiPolygon,
  b: MultiPolygon,
): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];

  const aGeom = multiToPolyclipGeom(a);
  const bGeom = multiToPolyclipGeom(b);
  const result = polyclip.intersection(aGeom, bGeom);
  return fromPolyclipResult(result);
}

/**
 * Signed area of a ring using the shoelace formula.
 * Positive for counterclockwise, negative for clockwise.
 */
export function signedRingArea(ring: Ring): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  return area / 2;
}

/**
 * Absolute area of a polygon (outer ring minus holes) in square meters
 * (assuming Forma local coordinates are in meters).
 */
export function polygonArea(polygon: Polygon): number {
  if (polygon.length === 0) return 0;
  let area = Math.abs(signedRingArea(polygon[0]));
  for (let i = 1; i < polygon.length; i++) {
    area -= Math.abs(signedRingArea(polygon[i]));
  }
  return Math.max(0, area);
}

/**
 * Total area across all polygons in a multipolygon.
 */
export function multiPolygonArea(multi: MultiPolygon): number {
  return multi.reduce((sum, poly) => sum + polygonArea(poly), 0);
}

/**
 * Triangulates a polygon (with optional holes) into triangle indices.
 * Returns a flat Float32Array of [x, y, z] vertex positions and an
 * index array, suitable for passing to Forma.render.addMesh().
 *
 * @param z The z coordinate for all vertices (ground elevation + small offset)
 */
export function triangulatePolygon(
  polygon: Polygon,
  z: number = 0.1,
): { position: Float32Array; index: number[] } | null {
  if (polygon.length === 0 || polygon[0].length < 3) return null;

  const flatCoords: number[] = [];
  const holeIndices: number[] = [];

  for (let r = 0; r < polygon.length; r++) {
    if (r > 0) holeIndices.push(flatCoords.length / 2);
    for (const [x, y] of polygon[r]) {
      flatCoords.push(x, y);
    }
  }

  const indices = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : undefined, 2);
  if (indices.length === 0) return null;

  const vertexCount = flatCoords.length / 2;
  const position = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    position[i * 3] = flatCoords[i * 2];
    position[i * 3 + 1] = flatCoords[i * 2 + 1];
    position[i * 3 + 2] = z;
  }

  return { position, index: Array.from(indices) };
}

/**
 * Triangulates an entire multipolygon, merging all triangles into
 * a single mesh with uniform color.
 */
export function triangulateMultiPolygon(
  multi: MultiPolygon,
  color: [number, number, number, number],
  z: number = 0.1,
): { position: Float32Array; color: Uint8Array; index: number[] } | null {
  const allPositions: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const polygon of multi) {
    const result = triangulatePolygon(polygon, z);
    if (!result) continue;

    for (let i = 0; i < result.position.length; i++) {
      allPositions.push(result.position[i]);
    }
    for (const idx of result.index) {
      allIndices.push(idx + vertexOffset);
    }
    vertexOffset += result.position.length / 3;
  }

  if (allPositions.length === 0) return null;

  const vertexCount = allPositions.length / 3;
  const colorArray = new Uint8Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    colorArray[i * 4] = color[0];
    colorArray[i * 4 + 1] = color[1];
    colorArray[i * 4 + 2] = color[2];
    colorArray[i * 4 + 3] = color[3];
  }

  return {
    position: new Float32Array(allPositions),
    color: colorArray,
    index: allIndices,
  };
}

/**
 * Triangulates a multipolygon with per-vertex z from a lookup function.
 * Used to drape shadow meshes onto the terrain surface so they render
 * at the correct elevation in the 3D viewport.
 *
 * @param getZ A function that returns the z elevation for a given (x, y).
 *   Typically wraps TerrainSampler.getElevation() with a small offset.
 */
export async function triangulateMultiPolygonOnTerrain(
  multi: MultiPolygon,
  color: [number, number, number, number],
  getZ: (x: number, y: number) => Promise<number>,
): Promise<{ position: Float32Array; color: Uint8Array; index: number[] } | null> {
  const allPositions: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const polygon of multi) {
    const result = triangulatePolygon(polygon, 0);
    if (!result) continue;

    const vertCount = result.position.length / 3;
    const zValues = await Promise.all(
      Array.from({ length: vertCount }, (_, i) =>
        getZ(result.position[i * 3], result.position[i * 3 + 1]),
      ),
    );

    for (let i = 0; i < vertCount; i++) {
      allPositions.push(
        result.position[i * 3],
        result.position[i * 3 + 1],
        zValues[i],
      );
    }
    for (const idx of result.index) {
      allIndices.push(idx + vertexOffset);
    }
    vertexOffset += vertCount;
  }

  if (allPositions.length === 0) return null;

  const vertexCount = allPositions.length / 3;
  const colorArray = new Uint8Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    colorArray[i * 4] = color[0];
    colorArray[i * 4 + 1] = color[1];
    colorArray[i * 4 + 2] = color[2];
    colorArray[i * 4 + 3] = color[3];
  }

  return {
    position: new Float32Array(allPositions),
    color: colorArray,
    index: allIndices,
  };
}

/**
 * Ensures a ring is closed (first vertex === last vertex).
 */
export function closeRing(ring: Ring): Ring {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

/**
 * Ensures a ring is in counterclockwise winding order.
 */
export function ensureCCW(ring: Ring): Ring {
  if (signedRingArea(ring) < 0) return [...ring].reverse();
  return ring;
}

// --- Internal helpers for polyclip-ts format conversion ---
// polyclip-ts uses the same structural types as ours:
//   Ring = [number, number][]
//   Poly = Ring[] (polygon with holes)
//   MultiPoly = Poly[]
//   Geom = Poly | MultiPoly

function toPolyclipGeom(polygon: Polygon): polyclip.Geom {
  return [polygon];
}

function multiToPolyclipGeom(multi: MultiPolygon): polyclip.Geom {
  return multi;
}

function fromPolyclipResult(result: ReturnType<typeof polyclip.union>): MultiPolygon {
  if (!result || !Array.isArray(result)) return [];
  return result as MultiPolygon;
}
