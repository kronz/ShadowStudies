import { Forma } from "forma-embedded-view-sdk/auto";

type MeshGeometry = { position: Float32Array; color: Uint8Array };

const TERRAIN_OFFSET = 0.1;
const FILL_ALPHA = 120;
const GRID_STEP = 2;

let activeOutlineMeshId: string | null = null;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function pointInPolygon(
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
 * Builds a terrain-conforming mesh by laying a dense grid over the polygon,
 * sampling terrain elevation at every grid vertex, and emitting quads that
 * hug the terrain surface. Only quads with at least one corner inside the
 * polygon are included, so the fill extends up to one grid step past the
 * boundary (better than gaps along the edge).
 */
async function buildTerrainConformingMesh(
  polygon: [number, number][],
  colorHex: string,
): Promise<MeshGeometry> {
  if (polygon.length < 3) {
    return { position: new Float32Array(0), color: new Uint8Array(0) };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const cols = Math.ceil((maxX - minX) / GRID_STEP) + 2;
  const rows = Math.ceil((maxY - minY) / GRID_STEP) + 2;
  const totalPoints = rows * cols;

  const inside = new Uint8Array(totalPoints);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + c * GRID_STEP;
      const y = minY + r * GRID_STEP;
      if (pointInPolygon(x, y, polygon)) {
        inside[r * cols + c] = 1;
      }
    }
  }

  const elevations = new Float32Array(totalPoints);
  elevations.fill(NaN);

  const BATCH_SIZE = 200;
  for (let start = 0; start < totalPoints; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, totalPoints);
    const promises: Promise<void>[] = [];
    for (let idx = start; idx < end; idx++) {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x = minX + c * GRID_STEP;
      const y = minY + r * GRID_STEP;
      promises.push(
        Forma.terrain
          .getElevationAt({ x, y })
          .then((elev) => {
            if (elev !== null && elev !== undefined && isFinite(elev)) {
              elevations[idx] = elev;
            }
          })
          .catch(() => {}),
      );
    }
    await Promise.all(promises);
  }

  const validValues: number[] = [];
  for (let i = 0; i < totalPoints; i++) {
    if (isFinite(elevations[i])) validValues.push(elevations[i]);
  }
  const fillValue =
    validValues.length > 0
      ? validValues.sort((a, b) => a - b)[Math.floor(validValues.length / 2)]
      : 0;
  for (let i = 0; i < totalPoints; i++) {
    if (!isFinite(elevations[i])) elevations[i] = fillValue;
  }

  const triVerts: number[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = r * cols + c + 1;
      const i01 = (r + 1) * cols + c;
      const i11 = (r + 1) * cols + c + 1;

      if (!inside[i00] && !inside[i10] && !inside[i01] && !inside[i11]) continue;

      const x0 = minX + c * GRID_STEP;
      const x1 = minX + (c + 1) * GRID_STEP;
      const y0 = minY + r * GRID_STEP;
      const y1 = minY + (r + 1) * GRID_STEP;

      const z00 = elevations[i00] + TERRAIN_OFFSET;
      const z10 = elevations[i10] + TERRAIN_OFFSET;
      const z01 = elevations[i01] + TERRAIN_OFFSET;
      const z11 = elevations[i11] + TERRAIN_OFFSET;

      triVerts.push(x0, y0, z00, x1, y0, z10, x1, y1, z11);
      triVerts.push(x0, y0, z00, x1, y1, z11, x0, y1, z01);
    }
  }

  if (triVerts.length === 0) {
    return { position: new Float32Array(0), color: new Uint8Array(0) };
  }

  const vertCount = triVerts.length / 3;
  const position = new Float32Array(triVerts);
  const color = new Uint8Array(vertCount * 4);
  const [rv, gv, bv] = hexToRgb(colorHex);
  for (let i = 0; i < vertCount; i++) {
    color[i * 4] = rv;
    color[i * 4 + 1] = gv;
    color[i * 4 + 2] = bv;
    color[i * 4 + 3] = FILL_ALPHA;
  }

  return { position, color };
}

/**
 * Renders a semi-transparent colored fill over the given polygon in
 * the Forma 3D scene. The mesh conforms to the terrain surface by
 * sampling elevation on a dense grid and offsetting slightly above.
 */
export async function renderAnalysisAreaOutline(
  polygon: [number, number][],
  colorHex = "#28C274",
): Promise<void> {
  await clearAnalysisAreaOutline();

  if (polygon.length < 3) return;

  const mesh = await buildTerrainConformingMesh(polygon, colorHex);
  if (mesh.position.length === 0) return;

  const { id } = await Forma.render.addMesh({ geometryData: mesh });
  activeOutlineMeshId = id;
}

/**
 * Removes the analysis area fill mesh from the scene.
 */
export async function clearAnalysisAreaOutline(): Promise<void> {
  if (activeOutlineMeshId) {
    try {
      await Forma.render.remove({ id: activeOutlineMeshId });
    } catch {
      // mesh may already be removed
    }
    activeOutlineMeshId = null;
  }
}
