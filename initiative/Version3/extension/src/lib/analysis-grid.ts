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

/**
 * Identifies cells on shadow boundaries — cells whose classification
 * differs from at least one cardinal (N/S/E/W) neighbor.
 */
export function findBoundaryCells(
  classifications: Uint8Array,
  cols: number,
  rows: number,
): Set<number> {
  const boundary = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cls = classifications[idx];
      if (c > 0 && classifications[idx - 1] !== cls) { boundary.add(idx); continue; }
      if (c < cols - 1 && classifications[idx + 1] !== cls) { boundary.add(idx); continue; }
      if (r > 0 && classifications[idx - cols] !== cls) { boundary.add(idx); continue; }
      if (r < rows - 1 && classifications[idx + cols] !== cls) { boundary.add(idx); continue; }
    }
  }
  return boundary;
}

export type SubGridResult = {
  subGrid: AnalysisGrid;
  /** Maps each sub-cell index to its parent cell index in the base grid. */
  parentMap: Uint32Array;
};

/**
 * Generates 4 sub-cells per boundary cell at half the base cell size.
 * Sub-cell elevations are linearly interpolated from the parent cell.
 */
export function generateSubCells(
  grid: AnalysisGrid,
  boundaryIndices: Set<number>,
): SubGridResult {
  const subCellSize = grid.cellSize / 2;
  const quarter = subCellSize / 2;
  const cells: GridCell[] = [];
  const parentIndices: number[] = [];

  for (const idx of boundaryIndices) {
    const parent = grid.cells[idx];
    const offsets: [number, number][] = [
      [-quarter, -quarter],
      [quarter, -quarter],
      [-quarter, quarter],
      [quarter, quarter],
    ];
    for (const [dx, dy] of offsets) {
      cells.push({ x: parent.x + dx, y: parent.y + dy, z: parent.z });
      parentIndices.push(idx);
    }
  }

  return {
    subGrid: {
      cells,
      cols: cells.length,
      rows: 1,
      cellSize: subCellSize,
      bounds: grid.bounds,
    },
    parentMap: new Uint32Array(parentIndices),
  };
}
