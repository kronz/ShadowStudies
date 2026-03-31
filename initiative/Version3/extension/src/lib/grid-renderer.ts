import type { AnalysisGrid } from "./analysis-grid";
import { ShadowClass } from "./ray-caster";

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
): { position: Float32Array; color: Uint8Array } | null {
  const matchingIndices: number[] = [];
  for (let i = 0; i < classifications.length; i++) {
    if (classifications[i] === shadowClass) matchingIndices.push(i);
  }
  if (matchingIndices.length === 0) return null;

  const half = grid.cellSize / 2;
  const vertCount = matchingIndices.length * 6; // 2 triangles × 3 verts per quad
  const position = new Float32Array(vertCount * 3);
  const colorArr = new Uint8Array(vertCount * 4);

  const Z_RENDER_OFFSET = 0.2;

  let vi = 0;
  for (const idx of matchingIndices) {
    const cell = grid.cells[idx];
    const z = cell.z + Z_RENDER_OFFSET;

    const x0 = cell.x - half;
    const x1 = cell.x + half;
    const y0 = cell.y - half;
    const y1 = cell.y + half;

    // Triangle 1: (x0,y0) (x1,y0) (x1,y1)
    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;

    // Triangle 2: (x0,y0) (x1,y1) (x0,y1)
    position[vi * 3] = x0; position[vi * 3 + 1] = y0; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x1; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = x0; position[vi * 3 + 1] = y1; position[vi * 3 + 2] = z; vi++;
  }

  for (let v = 0; v < vertCount; v++) {
    colorArr[v * 4] = color[0];
    colorArr[v * 4 + 1] = color[1];
    colorArr[v * 4 + 2] = color[2];
    colorArr[v * 4 + 3] = color[3];
  }

  return { position, color: colorArr };
}

/**
 * Builds a mesh for each shadow class using the appropriate color,
 * then returns addMesh-ready geometry data for each.
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
): { geometryData: { position: Float32Array; color: Uint8Array }; label: string }[] {
  const meshes: { geometryData: { position: Float32Array; color: Uint8Array }; label: string }[] = [];

  if (options.contextShadowEnabled) {
    const rgba = hexToRgba(options.contextShadowColor, 0.55);
    const mesh = gridToMesh(grid, classifications, ShadowClass.ContextShadow, rgba);
    if (mesh) meshes.push({ geometryData: mesh, label: "context-shadow" });
  }

  if (options.designShadowEnabled) {
    const rgba = hexToRgba(options.designShadowColor, 0.65);
    const mesh = gridToMesh(grid, classifications, ShadowClass.DesignShadow, rgba);
    if (mesh) meshes.push({ geometryData: mesh, label: "design-shadow" });
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
