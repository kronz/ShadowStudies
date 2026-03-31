import { Forma } from "forma-embedded-view-sdk/auto";

/**
 * Caches terrain elevation queries to avoid redundant async SDK calls.
 * Snaps coordinates to a grid (default 1m) so nearby queries share cache hits.
 */
export class TerrainSampler {
  private cache = new Map<string, number>();
  private snapResolution: number;

  constructor(snapResolution: number = 1.0) {
    this.snapResolution = snapResolution;
  }

  private cacheKey(x: number, y: number): string {
    const sx = Math.round(x / this.snapResolution) * this.snapResolution;
    const sy = Math.round(y / this.snapResolution) * this.snapResolution;
    return `${sx},${sy}`;
  }

  async getElevation(x: number, y: number): Promise<number> {
    const key = this.cacheKey(x, y);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    try {
      const elevation = await Forma.terrain.getElevationAt({ x, y });
      this.cache.set(key, elevation);
      return elevation;
    } catch {
      this.cache.set(key, 0);
      return 0;
    }
  }

  /**
   * Pre-fetches elevations for a batch of points in parallel.
   * Useful before running shadow projection to warm the cache.
   */
  async prefetch(points: [number, number][]): Promise<void> {
    const uncached = points.filter((p) => !this.cache.has(this.cacheKey(p[0], p[1])));
    const BATCH_SIZE = 20;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(([x, y]) => this.getElevation(x, y)));
    }
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}
