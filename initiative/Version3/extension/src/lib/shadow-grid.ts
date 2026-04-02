import type { AnalysisGrid, GridCell } from "./analysis-grid";
import type { SunPosition } from "./sun-position";
import type { BuildingMesh } from "./scene-geometry";
import { ShadowClass } from "./ray-caster";

export type ShadowAreas = {
  contextShadowArea: number;
  designOnlyShadowArea: number;
  totalShadowArea: number;
};

export type ShadowGridResult = {
  grid: AnalysisGrid;
  classifications: Uint8Array;
  sun: SunPosition;
  date: Date;
  areas: ShadowAreas;
  buildings: BuildingMesh[];
  /** Refined sub-cells for boundary smoothing (optional). */
  refinedCells?: GridCell[];
  refinedClassifications?: Uint8Array;
  refinedCellSize?: number;
  /** Maps each refined sub-cell back to its parent base-grid index. */
  refinedParentMap?: Uint32Array;
  /** Per-cell coverage fraction for anti-aliased rendering (optional). */
  coverage?: Float32Array;
};

/**
 * Computes shadow area metrics from the classification array.
 * When refinement data is provided, boundary cells in the base grid are
 * replaced by their 4 refined sub-cells at the smaller cell area.
 */
export function computeShadowAreas(
  classifications: Uint8Array,
  cellArea: number,
  refinement?: {
    refinedClassifications: Uint8Array;
    refinedCellArea: number;
    refinedParentMap: Uint32Array;
  },
): ShadowAreas {
  const refinedParents = new Set<number>();
  let contextArea = 0;
  let designArea = 0;

  if (refinement) {
    for (let i = 0; i < refinement.refinedParentMap.length; i++) {
      refinedParents.add(refinement.refinedParentMap[i]);
    }
    for (let i = 0; i < refinement.refinedClassifications.length; i++) {
      const cls = refinement.refinedClassifications[i];
      if (cls === ShadowClass.ContextShadow) contextArea += refinement.refinedCellArea;
      else if (cls === ShadowClass.DesignShadow) designArea += refinement.refinedCellArea;
    }
  }

  for (let i = 0; i < classifications.length; i++) {
    if (refinedParents.has(i)) continue;
    const cls = classifications[i];
    if (cls === ShadowClass.ContextShadow) contextArea += cellArea;
    else if (cls === ShadowClass.DesignShadow) designArea += cellArea;
  }

  return {
    contextShadowArea: contextArea,
    designOnlyShadowArea: designArea,
    totalShadowArea: contextArea + designArea,
  };
}

// ────────────────────────────────────────────────────────────
// Analysis Area shadow analysis
// ────────────────────────────────────────────────────────────

export type AnalysisAreaResult = {
  totalCells: number;
  shadowCells: number;
  designShadowCells: number;
  contextShadowCells: number;
  percentage: number;
  designPercentage: number;
  contextPercentage: number;
  analysisArea: number;
  shadowArea: number;
};

/**
 * Point-in-polygon test using the ray casting algorithm.
 * Returns true if (x, y) lies inside the given polygon ring.
 */
export function pointInPolygon(
  x: number,
  y: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes shadow coverage statistics for grid cells that fall
 * within a given polygon boundary (e.g. a parcel or open space).
 */
export function computeShadowPercentageInRegion(
  classifications: Uint8Array,
  grid: AnalysisGrid,
  polygon: [number, number][],
): AnalysisAreaResult {
  let totalCells = 0;
  let contextShadowCells = 0;
  let designShadowCells = 0;

  for (let i = 0; i < grid.cells.length; i++) {
    const cell = grid.cells[i];
    if (!pointInPolygon(cell.x, cell.y, polygon)) continue;

    totalCells++;
    const cls = classifications[i];
    if (cls === ShadowClass.ContextShadow) contextShadowCells++;
    else if (cls === ShadowClass.DesignShadow) designShadowCells++;
  }

  const shadowCells = contextShadowCells + designShadowCells;
  const cellArea = grid.cellSize * grid.cellSize;

  return {
    totalCells,
    shadowCells,
    designShadowCells,
    contextShadowCells,
    percentage: totalCells > 0 ? (shadowCells / totalCells) * 100 : 0,
    designPercentage: totalCells > 0 ? (designShadowCells / totalCells) * 100 : 0,
    contextPercentage: totalCells > 0 ? (contextShadowCells / totalCells) * 100 : 0,
    analysisArea: totalCells * cellArea,
    shadowArea: shadowCells * cellArea,
  };
}
