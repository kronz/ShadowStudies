import type { Bounds2D } from "./scene-geometry";
import type { TerrainSampler } from "./terrain-sampler";

export type GridCell = {
  x: number;
  y: number;
  z: number;
};

export type AnalysisGrid = {
  /** Cell center coordinates with terrain elevation. Indexed [row * cols + col]. */
  cells: GridCell[];
  cols: number;
  rows: number;
  /** Side length of each square cell in meters. */
  cellSize: number;
  bounds: Bounds2D;
};

/**
 * Creates a regular 2D analysis grid over the site bounds.
 * Each cell center is sampled for terrain elevation via the TerrainSampler.
 *
 * @param bounds   Site bounding box (expanded to include shadow fall-off).
 * @param cellSize Grid resolution in meters (default 2m).
 * @param terrain  TerrainSampler for elevation lookup.
 */
export function createAnalysisGrid(
  bounds: Bounds2D,
  terrain: TerrainSampler,
  cellSize = 2,
): AnalysisGrid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize));

  const cells: GridCell[] = new Array(cols * rows);
  const halfCell = cellSize / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = bounds.minX + c * cellSize + halfCell;
      const y = bounds.minY + r * cellSize + halfCell;
      const z = terrain.getElevation(x, y);
      cells[r * cols + c] = { x, y, z };
    }
  }

  return { cells, cols, rows, cellSize, bounds };
}
