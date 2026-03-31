import type { AnalysisGrid } from "./analysis-grid";
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
};

/**
 * Computes shadow area metrics from the classification array.
 */
export function computeShadowAreas(
  classifications: Uint8Array,
  cellArea: number,
): ShadowAreas {
  let contextCount = 0;
  let designCount = 0;

  for (let i = 0; i < classifications.length; i++) {
    if (classifications[i] === ShadowClass.ContextShadow) contextCount++;
    else if (classifications[i] === ShadowClass.DesignShadow) designCount++;
  }

  return {
    contextShadowArea: contextCount * cellArea,
    designOnlyShadowArea: designCount * cellArea,
    totalShadowArea: (contextCount + designCount) * cellArea,
  };
}

// ────────────────────────────────────────────────────────────
// ROI (Region of Interest) shadow analysis
// ────────────────────────────────────────────────────────────

export type ROIResult = {
  totalCells: number;
  shadowCells: number;
  designShadowCells: number;
  contextShadowCells: number;
  percentage: number;
  designPercentage: number;
  contextPercentage: number;
  roiArea: number;
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
): ROIResult {
  let totalCells = 0;
  let contextShadowCells = 0;
  let designShadowCells = 0;

  for (let i = 0; i < grid.cells.length; i++) {
    const cell = grid.cells[i];
    if (!pointInPolygon(cell.x, cell.y, polygon)) continue;

    totalCells++;
    if (classifications[i] === ShadowClass.ContextShadow) contextShadowCells++;
    else if (classifications[i] === ShadowClass.DesignShadow) designShadowCells++;
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
    roiArea: totalCells * cellArea,
    shadowArea: shadowCells * cellArea,
  };
}
