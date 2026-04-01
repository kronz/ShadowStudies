import { Forma } from "forma-embedded-view-sdk/auto";

type MeshGeometry = { position: Float32Array; color: Uint8Array };

const Z_RENDER_OFFSET = 0.35;
const FILL_ALPHA = 120;

let activeOutlineMeshId: string | null = null;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Fan-triangulates a polygon from vertex 0 and returns a colored mesh.
 * Works correctly for convex polygons; adequate for typical building
 * footprints and parcel boundaries used as analysis areas.
 */
function buildFilledPolygonMesh(
  polygon: [number, number][],
  colorHex: string,
): MeshGeometry {
  if (polygon.length < 3) {
    return { position: new Float32Array(0), color: new Uint8Array(0) };
  }

  const triCount = polygon.length - 2;
  const vertCount = triCount * 3;
  const position = new Float32Array(vertCount * 3);
  const color = new Uint8Array(vertCount * 4);
  const [r, g, b] = hexToRgb(colorHex);

  let vi = 0;
  for (let i = 1; i < polygon.length - 1; i++) {
    const [ax, ay] = polygon[0];
    const [bx, by] = polygon[i];
    const [cx, cy] = polygon[i + 1];

    position[vi * 3] = ax; position[vi * 3 + 1] = ay; position[vi * 3 + 2] = Z_RENDER_OFFSET; vi++;
    position[vi * 3] = bx; position[vi * 3 + 1] = by; position[vi * 3 + 2] = Z_RENDER_OFFSET; vi++;
    position[vi * 3] = cx; position[vi * 3 + 1] = cy; position[vi * 3 + 2] = Z_RENDER_OFFSET; vi++;
  }

  for (let i = 0; i < vertCount; i++) {
    color[i * 4] = r;
    color[i * 4 + 1] = g;
    color[i * 4 + 2] = b;
    color[i * 4 + 3] = FILL_ALPHA;
  }

  return { position, color };
}

/**
 * Renders a semi-transparent colored fill over the given polygon in
 * the Forma 3D scene. Removes any previously rendered fill first.
 */
export async function renderAnalysisAreaOutline(
  polygon: [number, number][],
  colorHex = "#CC9D83",
): Promise<void> {
  await clearAnalysisAreaOutline();

  if (polygon.length < 3) return;

  const mesh = buildFilledPolygonMesh(polygon, colorHex);
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
