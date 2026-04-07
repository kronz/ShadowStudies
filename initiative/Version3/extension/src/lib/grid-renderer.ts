import type { AnalysisGrid, GridCell } from "./analysis-grid";
import { ShadowClass } from "./ray-caster";
import type { ShadowGridResult } from "./shadow-grid";

type MeshGeometry = { position: Float32Array; color: Uint8Array };

/**
 * Converts classified shadow grid cells into a colored mesh suitable
 * for Forma.render.addMesh(). Each shadow cell becomes a quad (2 triangles)
 * at terrain elevation, with vertex colors.
 *
 * Returns null if there are no cells to render for the given class.
 */
export function gridToMesh(
  grid: AnalysisGrid,
  classifications: Uint8Array,
  shadowClass: ShadowClass,
  color: [number, number, number, number],
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

  const Z_RENDER_OFFSET = 1.0;

  let vi = 0;
  for (const idx of matchingIndices) {
    const cell = grid.cells[idx];
    const z = cell.z + Z_RENDER_OFFSET;

    const x0 = cell.x - half;
    const x1 = cell.x + half;
    const y0 = cell.y - half;
    const y1 = cell.y + half;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x0; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;
  }

  let matchIdx = 0;
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
    matchIdx++;
  }

  return { position, color: colorArr };
}

/**
 * Creates a mesh from an arbitrary array of cells (used for refined sub-cells).
 */
function cellsToMesh(
  cells: GridCell[],
  classifications: Uint8Array,
  shadowClass: ShadowClass,
  cellSize: number,
  color: [number, number, number, number],
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

  const Z_RENDER_OFFSET = 1.0;

  let vi = 0;
  for (const idx of matchingIndices) {
    const cell = cells[idx];
    const z = cell.z + Z_RENDER_OFFSET;
    const x0 = cell.x - half;
    const x1 = cell.x + half;
    const y0 = cell.y - half;
    const y1 = cell.y + half;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;

    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x0; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;
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
    const baseMesh = gridToMesh(grid, classifications, cls, rgba, result?.coverage, refinedParents.size > 0 ? refinedParents : undefined);

    let refinedMesh: MeshGeometry | null = null;
    if (result?.refinedCells && result.refinedClassifications && result.refinedCellSize) {
      refinedMesh = cellsToMesh(
        result.refinedCells,
        result.refinedClassifications,
        cls,
        result.refinedCellSize,
        rgba,
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
