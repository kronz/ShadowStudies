import type { BuildingMesh, Triangle3D, AABB, Bounds2D } from "../lib/scene-geometry";
import type { AnalysisGrid, GridCell } from "../lib/analysis-grid";
import type { SunPosition } from "../lib/sun-position";

/**
 * Creates a BuildingMesh representing a 10×10×height cube centered at (cx, cy).
 * Bottom face at z=0, top face at z=height.
 * 12 triangles (6 faces × 2 triangles each).
 */
export function makeCube(
  cx: number,
  cy: number,
  size: number,
  height: number,
  isDesign: boolean,
  isPlanned = false,
): BuildingMesh {
  const hs = size / 2;
  const x0 = cx - hs, x1 = cx + hs;
  const y0 = cy - hs, y1 = cy + hs;
  const z0 = 0, z1 = height;

  const triangles: Triangle3D[] = [
    // Bottom face
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0]],
    [[x0, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    // Top face
    [[x0, y0, z1], [x1, y1, z1], [x1, y0, z1]],
    [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1]],
    // Front face (y = y0)
    [[x0, y0, z0], [x1, y0, z1], [x1, y0, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1]],
    // Back face (y = y1)
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    // Left face (x = x0)
    [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1]],
    [[x0, y0, z0], [x0, y1, z1], [x0, y0, z1]],
    // Right face (x = x1)
    [[x1, y0, z0], [x1, y1, z1], [x1, y1, z0]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1]],
  ];

  const aabb: AABB = {
    min: [x0, y0, z0],
    max: [x1, y1, z1],
  };

  const footprint: [number, number][] = [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1],
  ];

  return { path: `cube_${cx}_${cy}`, triangles, aabb, isDesign, isPlanned, footprint };
}

/**
 * Creates a flat analysis grid at z=0 covering bounds from (minX,minY) to (maxX,maxY).
 */
export function makeGrid(
  bounds: Bounds2D,
  cellSize: number,
): AnalysisGrid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize));
  const halfCell = cellSize / 2;

  const cells: GridCell[] = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells[r * cols + c] = {
        x: bounds.minX + c * cellSize + halfCell,
        y: bounds.minY + r * cellSize + halfCell,
        z: 0,
      };
    }
  }

  return { cells, cols, rows, cellSize, bounds };
}

/**
 * Creates a SunPosition from altitude and azimuth in degrees.
 */
export function makeSun(altitudeDeg: number, azimuthDeg: number): SunPosition {
  return {
    altitude: altitudeDeg * Math.PI / 180,
    azimuth: azimuthDeg * Math.PI / 180,
  };
}
