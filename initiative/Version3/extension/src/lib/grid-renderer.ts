import type { AnalysisGrid, GridCell } from "./analysis-grid";
import { ShadowClass } from "./ray-caster";
import type { ShadowGridResult } from "./shadow-grid";

type MeshGeometry = { position: Float32Array; color: Uint8Array };

const Z_RENDER_OFFSET = 0.2;

/**
 * Corner elevation grid derived from the regular analysis grid.
 * Each corner sits at the intersection of up to 4 cell centers;
 * its elevation is the average of those centers.
 */
type CornerGrid = {
  data: Float32Array;
  rows: number;  // grid.rows + 1
  cols: number;  // grid.cols + 1
  originX: number;
  originY: number;
  cellSize: number;
};

function buildCornerGrid(grid: AnalysisGrid): CornerGrid {
  const cRows = grid.rows + 1;
  const cCols = grid.cols + 1;
  const data = new Float32Array(cRows * cCols);

  for (let cr = 0; cr < cRows; cr++) {
    for (let cc = 0; cc < cCols; cc++) {
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 0; dr++) {
        for (let dc = -1; dc <= 0; dc++) {
          const cellR = cr + dr;
          const cellC = cc + dc;
          if (cellR >= 0 && cellR < grid.rows && cellC >= 0 && cellC < grid.cols) {
            sum += grid.cells[cellR * grid.cols + cellC].z;
            count++;
          }
        }
      }
      data[cr * cCols + cc] = count > 0 ? sum / count : 0;
    }
  }

  return { data, rows: cRows, cols: cCols, originX: grid.bounds.minX, originY: grid.bounds.minY, cellSize: grid.cellSize };
}

/**
 * Bilinear interpolation of terrain elevation at an arbitrary world
 * position using the precomputed corner grid.
 */
function sampleCornerZ(cg: CornerGrid, wx: number, wy: number): number {
  const fx = (wx - cg.originX) / cg.cellSize;
  const fy = (wy - cg.originY) / cg.cellSize;

  const c0 = Math.max(0, Math.min(Math.floor(fx), cg.cols - 2));
  const r0 = Math.max(0, Math.min(Math.floor(fy), cg.rows - 2));

  const tx = Math.max(0, Math.min(fx - c0, 1));
  const ty = Math.max(0, Math.min(fy - r0, 1));

  const e00 = cg.data[r0 * cg.cols + c0];
  const e10 = cg.data[r0 * cg.cols + c0 + 1];
  const e01 = cg.data[(r0 + 1) * cg.cols + c0];
  const e11 = cg.data[(r0 + 1) * cg.cols + c0 + 1];

  return e00 * (1 - tx) * (1 - ty) + e10 * tx * (1 - ty) + e01 * (1 - tx) * ty + e11 * tx * ty;
}

/**
 * Converts classified shadow grid cells into a terrain-conforming colored
 * mesh. Each cell quad uses corner elevations derived from neighboring
 * cell centers so the mesh follows the terrain slope.
 */
export function gridToMesh(
  grid: AnalysisGrid,
  classifications: Uint8Array,
  shadowClass: ShadowClass,
  color: [number, number, number, number],
  cornerGrid: CornerGrid,
  coverage?: Float32Array,
  skipIndices?: Set<number>,
): MeshGeometry | null {
  const matchingIndices: number[] = [];
  for (let i = 0; i < classifications.length; i++) {
    if (skipIndices && skipIndices.has(i)) continue;
    if (classifications[i] === shadowClass) matchingIndices.push(i);
  }
  if (matchingIndices.length === 0) return null;

  const half = grid.cellSize / 2;
  const vertCount = matchingIndices.length * 6;
  const position = new Float32Array(vertCount * 3);
  const colorArr = new Uint8Array(vertCount * 4);

  const cCols = cornerGrid.cols;

  let vi = 0;
  for (const idx of matchingIndices) {
    const cell = grid.cells[idx];
    const r = Math.floor(idx / grid.cols);
    const c = idx % grid.cols;

    const x0 = cell.x - half;
    const x1 = cell.x + half;
    const y0 = cell.y - half;
    const y1 = cell.y + half;

    const zSW = cornerGrid.data[r * cCols + c] + Z_RENDER_OFFSET;
    const zSE = cornerGrid.data[r * cCols + c + 1] + Z_RENDER_OFFSET;
    const zNW = cornerGrid.data[(r + 1) * cCols + c] + Z_RENDER_OFFSET;
    const zNE = cornerGrid.data[(r + 1) * cCols + c + 1] + Z_RENDER_OFFSET;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = zSW; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = zSE; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = zNE; vi++;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = zSW; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = zNE; vi++;
    position[vi * 3] = x0; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = zNW; vi++;
  }

  let vertOffset = 0;
  for (const idx of matchingIndices) {
    const alpha = coverage ? Math.round(color[3] * coverage[idx]) : color[3];
    for (let v = 0; v < 6; v++) {
      colorArr[vertOffset] = color[0];
      colorArr[vertOffset + 1] = color[1];
      colorArr[vertOffset + 2] = color[2];
      colorArr[vertOffset + 3] = alpha;
      vertOffset += 4;
    }
  }

  return { position, color: colorArr };
}

/**
 * Creates a terrain-conforming mesh from an arbitrary array of cells
 * (used for refined sub-cells). Corner elevations are bilinearly
 * interpolated from the base grid's corner elevation data.
 */
function cellsToMesh(
  cells: GridCell[],
  classifications: Uint8Array,
  shadowClass: ShadowClass,
  cellSize: number,
  color: [number, number, number, number],
  cornerGrid: CornerGrid,
  coverage?: Float32Array,
): MeshGeometry | null {
  const matchingIndices: number[] = [];
  for (let i = 0; i < classifications.length; i++) {
    if (classifications[i] === shadowClass) matchingIndices.push(i);
  }
  if (matchingIndices.length === 0) return null;

  const half = cellSize / 2;
  const vertCount = matchingIndices.length * 6;
  const position = new Float32Array(vertCount * 3);
  const colorArr = new Uint8Array(vertCount * 4);

  let vi = 0;
  for (const idx of matchingIndices) {
    const cell = cells[idx];
    const x0 = cell.x - half;
    const x1 = cell.x + half;
    const y0 = cell.y - half;
    const y1 = cell.y + half;

    const zSW = sampleCornerZ(cornerGrid, x0, y0) + Z_RENDER_OFFSET;
    const zSE = sampleCornerZ(cornerGrid, x1, y0) + Z_RENDER_OFFSET;
    const zNW = sampleCornerZ(cornerGrid, x0, y1) + Z_RENDER_OFFSET;
    const zNE = sampleCornerZ(cornerGrid, x1, y1) + Z_RENDER_OFFSET;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = zSW; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = zSE; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = zNE; vi++;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = zSW; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = zNE; vi++;
    position[vi * 3] = x0; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = zNW; vi++;
  }

  let vertOffset = 0;
  for (const idx of matchingIndices) {
    const alpha = coverage ? Math.round(color[3] * coverage[idx]) : color[3];
    for (let v = 0; v < 6; v++) {
      colorArr[vertOffset] = color[0];
      colorArr[vertOffset + 1] = color[1];
      colorArr[vertOffset + 2] = color[2];
      colorArr[vertOffset + 3] = alpha;
      vertOffset += 4;
    }
  }

  return { position, color: colorArr };
}

function mergeMeshes(a: MeshGeometry, b: MeshGeometry): MeshGeometry {
  const position = new Float32Array(a.position.length + b.position.length);
  position.set(a.position, 0);
  position.set(b.position, a.position.length);
  const color = new Uint8Array(a.color.length + b.color.length);
  color.set(a.color, 0);
  color.set(b.color, a.color.length);
  return { position, color };
}

/**
 * Builds a mesh for each shadow class using the appropriate color.
 * When refinement data is present, base-grid boundary cells are replaced
 * by their refined sub-cells.
 */
export function buildShadowMeshes(
  grid: AnalysisGrid,
  classifications: Uint8Array,
  options: {
    contextShadowEnabled: boolean;
    contextShadowColor: string;
    designShadowEnabled: boolean;
    designShadowColor: string;
  },
  result?: ShadowGridResult,
): { geometryData: MeshGeometry; label: string }[] {
  const meshes: { geometryData: MeshGeometry; label: string }[] = [];

  const cornerGrid = buildCornerGrid(grid);

  const refinedParents = new Set<number>();
  if (result?.refinedParentMap) {
    for (let i = 0; i < result.refinedParentMap.length; i++) {
      refinedParents.add(result.refinedParentMap[i]);
    }
  }

  const buildForClass = (
    cls: ShadowClass,
    hexColor: string,
    alpha: number,
    label: string,
  ) => {
    const rgba = hexToRgba(hexColor, alpha);
    const baseMesh = gridToMesh(grid, classifications, cls, rgba, cornerGrid, result?.coverage, refinedParents.size > 0 ? refinedParents : undefined);

    let refinedMesh: MeshGeometry | null = null;
    if (result?.refinedCells && result.refinedClassifications && result.refinedCellSize) {
      refinedMesh = cellsToMesh(
        result.refinedCells,
        result.refinedClassifications,
        cls,
        result.refinedCellSize,
        rgba,
        cornerGrid,
      );
    }

    if (baseMesh && refinedMesh) {
      meshes.push({ geometryData: mergeMeshes(baseMesh, refinedMesh), label });
    } else if (baseMesh) {
      meshes.push({ geometryData: baseMesh, label });
    } else if (refinedMesh) {
      meshes.push({ geometryData: refinedMesh, label });
    }
  };

  if (options.contextShadowEnabled) {
    buildForClass(ShadowClass.ContextShadow, options.contextShadowColor, 0.55, "context-shadow");
  }
  if (options.designShadowEnabled) {
    buildForClass(ShadowClass.DesignShadow, options.designShadowColor, 0.65, "design-shadow");
  }

  return meshes;
}

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [
    (n >> 16) & 255,
    (n >> 8) & 255,
    n & 255,
    Math.round(alpha * 255),
  ];
}
