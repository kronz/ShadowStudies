import { Forma } from "forma-embedded-view-sdk/auto";
import type { Triangle3D, Bounds2D } from "./scene-geometry";

/**
 * Terrain elevation sampler with two modes:
 *
 * 1. Triangle-mesh mode: builds a 2D grid of triangle buckets from terrain
 *    mesh triangles extracted via getTriangles(). For any (x,y), locates
 *    the containing triangle and interpolates z via barycentric coords.
 *    Same coordinate system as building meshes — no z-offset mismatches.
 *
 * 2. Fallback mode: if no terrain triangles are available, samples
 *    Forma.terrain.getElevationAt() on a regular grid and interpolates
 *    via bilinear interpolation. More robust than per-vertex queries
 *    because of consistent resolution and neighbor interpolation.
 */
export class TerrainSampler {
  private mode: "mesh" | "grid";

  // Mesh mode
  private buckets: Triangle3D[][] | null = null;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketSize = 0;
  private meshBounds: Bounds2D = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  // Grid fallback mode
  private elevations: Float32Array | null = null;
  private gridCols = 0;
  private gridRows = 0;
  private gridCellSize = 0;
  private gridBounds: Bounds2D = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  private constructor(mode: "mesh" | "grid") {
    this.mode = mode;
  }

  /**
   * Creates a terrain sampler from extracted terrain triangles.
   * Preferred approach: works in the same coordinate system as building meshes.
   */
  static fromTriangles(triangles: Triangle3D[], bounds: Bounds2D, bucketSize = 10): TerrainSampler {
    const sampler = new TerrainSampler("mesh");
    sampler.bucketSize = bucketSize;
    sampler.meshBounds = bounds;
    sampler.bucketCols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / bucketSize));
    sampler.bucketRows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / bucketSize));

    const totalBuckets = sampler.bucketCols * sampler.bucketRows;
    sampler.buckets = new Array(totalBuckets);
    for (let i = 0; i < totalBuckets; i++) {
      sampler.buckets[i] = [];
    }

    for (const tri of triangles) {
      let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity;
      for (const v of tri) {
        if (v[0] < tMinX) tMinX = v[0];
        if (v[1] < tMinY) tMinY = v[1];
        if (v[0] > tMaxX) tMaxX = v[0];
        if (v[1] > tMaxY) tMaxY = v[1];
      }

      const c0 = Math.max(0, Math.floor((tMinX - bounds.minX) / bucketSize));
      const c1 = Math.min(sampler.bucketCols - 1, Math.floor((tMaxX - bounds.minX) / bucketSize));
      const r0 = Math.max(0, Math.floor((tMinY - bounds.minY) / bucketSize));
      const r1 = Math.min(sampler.bucketRows - 1, Math.floor((tMaxY - bounds.minY) / bucketSize));

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          sampler.buckets[r * sampler.bucketCols + c].push(tri);
        }
      }
    }

    return sampler;
  }

  /**
   * Creates a terrain sampler by sampling getElevationAt() on a regular grid.
   * Uses Forma's authoritative terrain API for ground elevation.
   *
   * Points outside the terrain extent return NaN during sampling and are
   * filled with the median elevation of valid samples so grid cells in
   * the shadow fall-off zone have reasonable Z values.
   */
  static async fromElevationAPI(bounds: Bounds2D, cellSize = 5): Promise<TerrainSampler> {
    const sampler = new TerrainSampler("grid");
    sampler.gridCellSize = cellSize;
    sampler.gridBounds = bounds;
    sampler.gridCols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize)) + 1;
    sampler.gridRows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize)) + 1;

    const totalPoints = sampler.gridCols * sampler.gridRows;
    sampler.elevations = new Float32Array(totalPoints);
    sampler.elevations.fill(NaN);

    const BATCH_SIZE = 200;
    for (let start = 0; start < totalPoints; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, totalPoints);
      const promises: Promise<void>[] = [];

      for (let idx = start; idx < end; idx++) {
        const col = idx % sampler.gridCols;
        const row = Math.floor(idx / sampler.gridCols);
        const x = bounds.minX + col * cellSize;
        const y = bounds.minY + row * cellSize;

        const elevArr = sampler.elevations;
        promises.push(
          Forma.terrain
            .getElevationAt({ x, y })
            .then((elev) => {
              if (elev !== null && elev !== undefined && isFinite(elev)) {
                elevArr[idx] = elev;
              }
            })
            .catch(() => {
              // leave as NaN — will be filled below
            }),
        );
      }
      await Promise.all(promises);
    }

    // Fill NaN values with the median of valid samples so that grid cells
    // outside the terrain extent still sit at a reasonable elevation.
    const validValues: number[] = [];
    for (let i = 0; i < totalPoints; i++) {
      if (isFinite(sampler.elevations[i])) {
        validValues.push(sampler.elevations[i]);
      }
    }

    let fillValue = 0;
    if (validValues.length > 0) {
      validValues.sort((a, b) => a - b);
      fillValue = validValues[Math.floor(validValues.length / 2)];
    }

    for (let i = 0; i < totalPoints; i++) {
      if (!isFinite(sampler.elevations[i])) {
        sampler.elevations[i] = fillValue;
      }
    }

    return sampler;
  }

  /**
   * Returns the terrain elevation at (x, y).
   * Uses barycentric interpolation (mesh mode) or bilinear interpolation (grid mode).
   */
  getElevation(x: number, y: number): number {
    if (this.mode === "mesh") {
      return this.getElevationFromMesh(x, y);
    }
    return this.getElevationFromGrid(x, y);
  }

  private getElevationFromMesh(x: number, y: number): number {
    const col = Math.floor((x - this.meshBounds.minX) / this.bucketSize);
    const row = Math.floor((y - this.meshBounds.minY) / this.bucketSize);

    if (col < 0 || col >= this.bucketCols || row < 0 || row >= this.bucketRows) {
      return 0;
    }

    const bucket = this.buckets![row * this.bucketCols + col];
    for (const tri of bucket) {
      const z = barycentricZ(x, y, tri);
      if (z !== null) return z;
    }

    // Point not inside any triangle in this bucket; search neighbors
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= this.bucketRows || nc < 0 || nc >= this.bucketCols) continue;
        const neighborBucket = this.buckets![nr * this.bucketCols + nc];
        for (const tri of neighborBucket) {
          const z = barycentricZ(x, y, tri);
          if (z !== null) return z;
        }
      }
    }

    return 0;
  }

  private getElevationFromGrid(x: number, y: number): number {
    if (!this.elevations) return 0;

    const fx = (x - this.gridBounds.minX) / this.gridCellSize;
    const fy = (y - this.gridBounds.minY) / this.gridCellSize;

    const col = Math.floor(fx);
    const row = Math.floor(fy);

    const c0 = Math.max(0, Math.min(col, this.gridCols - 2));
    const r0 = Math.max(0, Math.min(row, this.gridRows - 2));

    const tx = fx - c0;
    const ty = fy - r0;

    const e00 = this.elevations[r0 * this.gridCols + c0];
    const e10 = this.elevations[r0 * this.gridCols + c0 + 1];
    const e01 = this.elevations[(r0 + 1) * this.gridCols + c0];
    const e11 = this.elevations[(r0 + 1) * this.gridCols + c0 + 1];

    return (
      e00 * (1 - tx) * (1 - ty) +
      e10 * tx * (1 - ty) +
      e01 * (1 - tx) * ty +
      e11 * tx * ty
    );
  }
}

/**
 * Returns the z-coordinate of point (px, py) within the triangle,
 * using barycentric interpolation. Returns null if the point is
 * outside the triangle.
 */
function barycentricZ(px: number, py: number, tri: Triangle3D): number | null {
  const [a, b, c] = tri;
  const v0x = c[0] - a[0];
  const v0y = c[1] - a[1];
  const v1x = b[0] - a[0];
  const v1y = b[1] - a[1];
  const v2x = px - a[0];
  const v2y = py - a[1];

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return null;

  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return null;

  return a[2] + u * (c[2] - a[2]) + v * (b[2] - a[2]);
}
