import { Forma } from "forma-embedded-view-sdk/auto";

type MeshGeometry = { position: Float32Array; color: Uint8Array };

const Z_RENDER_OFFSET = 0.35;
const DEFAULT_DASH_LENGTH = 2.0;
const DEFAULT_GAP_LENGTH = 1.5;
const DEFAULT_LINE_WIDTH = 0.25;
const OUTLINE_COLOR: [number, number, number, number] = [60, 60, 60, 200];

let activeOutlineMeshId: string | null = null;

/**
 * Builds a mesh of thin quad segments along a polygon boundary,
 * with gaps between segments to produce a dashed-line appearance.
 * Each dash is a quad (2 triangles) offset perpendicular to the edge.
 */
function buildDashedOutlineMesh(
  polygon: [number, number][],
  dashLength = DEFAULT_DASH_LENGTH,
  gapLength = DEFAULT_GAP_LENGTH,
  lineWidth = DEFAULT_LINE_WIDTH,
): MeshGeometry {
  const halfW = lineWidth / 2;
  const segments: number[][] = [];

  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];

    const dx = bx - ax;
    const dy = by - ay;
    const edgeLen = Math.sqrt(dx * dx + dy * dy);
    if (edgeLen < 0.01) continue;

    const ux = dx / edgeLen;
    const uy = dy / edgeLen;
    const nx = -uy;
    const ny = ux;

    let walked = 0;
    let drawing = true;

    while (walked < edgeLen) {
      const segLen = drawing ? dashLength : gapLength;
      const end = Math.min(walked + segLen, edgeLen);

      if (drawing) {
        const sx = ax + ux * walked;
        const sy = ay + uy * walked;
        const ex = ax + ux * end;
        const ey = ay + uy * end;

        segments.push([
          sx + nx * halfW, sy + ny * halfW,
          ex + nx * halfW, ey + ny * halfW,
          ex - nx * halfW, ey - ny * halfW,
          sx - nx * halfW, sy - ny * halfW,
        ]);
      }

      walked = end;
      drawing = !drawing;
    }
  }

  const vertCount = segments.length * 6;
  const position = new Float32Array(vertCount * 3);
  const color = new Uint8Array(vertCount * 4);

  let vi = 0;
  for (const seg of segments) {
    const [p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y] = seg;
    const z = Z_RENDER_OFFSET;

    position[vi * 3] = p0x; position[vi * 3 + 1] = p0y; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = p1x; position[vi * 3 + 1] = p1y; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = p2x; position[vi * 3 + 1] = p2y; position[vi * 3 + 2] = z; vi++;

    position[vi * 3] = p0x; position[vi * 3 + 1] = p0y; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = p2x; position[vi * 3 + 1] = p2y; position[vi * 3 + 2] = z; vi++;
    position[vi * 3] = p3x; position[vi * 3 + 1] = p3y; position[vi * 3 + 2] = z; vi++;
  }

  for (let i = 0; i < vertCount; i++) {
    color[i * 4] = OUTLINE_COLOR[0];
    color[i * 4 + 1] = OUTLINE_COLOR[1];
    color[i * 4 + 2] = OUTLINE_COLOR[2];
    color[i * 4 + 3] = OUTLINE_COLOR[3];
  }

  return { position, color };
}

/**
 * Renders a dashed outline around the given polygon in the Forma 3D scene.
 * Removes any previously rendered outline first.
 */
export async function renderAnalysisAreaOutline(
  polygon: [number, number][],
): Promise<void> {
  await clearAnalysisAreaOutline();

  if (polygon.length < 3) return;

  const mesh = buildDashedOutlineMesh(polygon);
  if (mesh.position.length === 0) return;

  const { id } = await Forma.render.addMesh({ geometryData: mesh });
  activeOutlineMeshId = id;
}

/**
 * Removes the dashed outline mesh from the scene.
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
