import { Forma } from "forma-embedded-view-sdk/auto";
import {
  prepareScene,
  computeShadowGridAsync,
  type SceneCache,
} from "./shadow-pipeline";
import { buildShadowMeshes } from "./grid-renderer";
import { getSunPositionForProject } from "./sun-position";
import { ShadowClass } from "./ray-caster";
import type { ShadowGridResult } from "./shadow-grid";

export type ShadowExportOptions = {
  designShadowEnabled: boolean;
  designShadowColor: string;
  contextShadowEnabled: boolean;
  contextShadowColor: string;
  plannedShadowEnabled?: boolean;
  plannedShadowColor?: string;
  designPaths?: string[];
  plannedPaths?: string[];
  cellSize?: number;
};

async function addShadowMeshesToScene(
  result: ShadowGridResult,
  options: ShadowExportOptions,
): Promise<string[]> {
  const meshIds: string[] = [];
  const meshes = buildShadowMeshes(result.grid, result.classifications, options, result);

  for (const mesh of meshes) {
    const { id } = await Forma.render.addMesh({ geometryData: mesh.geometryData });
    meshIds.push(id);
  }

  return meshIds;
}

async function removeMeshes(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await Forma.render.remove({ id });
    } catch {
      // already removed
    }
  }
}

/**
 * Captures a single frame with ray-cast shadow overlays.
 *
 * 1. Sets Forma sun date
 * 2. Computes shadow grid via ray casting
 * 3. Adds colored grid meshes to the 3D scene
 * 4. Captures a screenshot
 * 5. Removes the transient meshes
 */
export async function captureFrameWithShadows(
  date: Date,
  width: number,
  height: number,
  options: ShadowExportOptions,
  onProgress?: (message: string) => void,
  cache?: SceneCache,
): Promise<{ canvas: HTMLCanvasElement; result: ShadowGridResult }> {
  const hasShadowOverlay =
    options.designShadowEnabled || options.contextShadowEnabled;

  await Forma.sun.setDate({ date });

  const resolvedCache = cache ?? (await prepareScene(onProgress, options.cellSize, options.designPaths, options.plannedPaths));

  const sun = await getSunPositionForProject(date);
  const result = await computeShadowGridAsync(resolvedCache, sun, date, onProgress);

  if (!hasShadowOverlay || sun.altitude <= 0) {
    const canvas = await Forma.camera.capture({ width, height });
    return { canvas, result };
  }

  onProgress?.("Capturing baseline frame...");
  const baseline = await Forma.camera.capture({ width, height });

  onProgress?.("Rendering shadow overlay...");
  const meshIds = await addShadowMeshesToScene(result, options);

  let canvas = baseline;
  const delays = [100, 200, 400];
  for (const delay of delays) {
    await new Promise((r) => setTimeout(r, delay));
    const attempt = await Forma.camera.capture({ width, height });
    if (framesAreDifferent(baseline, attempt)) {
      canvas = attempt;
      break;
    }
    canvas = attempt;
  }

  await removeMeshes(meshIds);

  return { canvas, result };
}

/**
 * Compares two canvases by sampling ~20 evenly spaced pixels.
 * Returns true if any sampled pixel differs by more than a threshold.
 */
function framesAreDifferent(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  threshold = 10,
): boolean {
  const ctxA = a.getContext("2d");
  const ctxB = b.getContext("2d");
  if (!ctxA || !ctxB) return false;

  const w = a.width;
  const h = a.height;
  const cols = 5;
  const rows = 4;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.floor(((c + 0.5) / cols) * w);
      const y = Math.floor(((r + 0.5) / rows) * h);

      const pixA = ctxA.getImageData(x, y, 1, 1).data;
      const pixB = ctxB.getImageData(x, y, 1, 1).data;

      const diff =
        Math.abs(pixA[0] - pixB[0]) +
        Math.abs(pixA[1] - pixB[1]) +
        Math.abs(pixA[2] - pixB[2]);
      if (diff > threshold) return true;
    }
  }
  return false;
}

/**
 * Renders a pure plan-view (top-down) shadow diagram to a canvas.
 * Grid cells are rendered as colored squares. Refined sub-cells
 * replace their parent base-grid cells when present.
 */
export function renderPlanViewDiagram(
  result: ShadowGridResult,
  width: number,
  height: number,
  options: ShadowExportOptions & {
    contextBuildingColor?: string;
    designBuildingColor?: string;
  },
  bgColor: string = "#ffffff",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const { grid, classifications, buildings } = result;
  const bounds = grid.bounds;

  const padding = 40;
  const scaleX = (width - 2 * padding) / (bounds.maxX - bounds.minX);
  const scaleY = (height - 2 * padding) / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY);

  const toCanvasX = (x: number) => padding + (x - bounds.minX) * scale;
  const toCanvasY = (y: number) => height - padding - (y - bounds.minY) * scale;

  const refinedParents = new Set<number>();
  if (result.refinedParentMap) {
    for (let i = 0; i < result.refinedParentMap.length; i++) {
      refinedParents.add(result.refinedParentMap[i]);
    }
  }

  const cellPx = grid.cellSize * scale;

  const drawCell = (cls: number, cx: number, cy: number, size: number, coverageVal: number) => {
    if (cls === ShadowClass.Sunlit) return;
    ctx.save();
    ctx.globalAlpha = coverageVal;
    if (cls === ShadowClass.ContextShadow && options.contextShadowEnabled) {
      ctx.fillStyle = options.contextShadowColor + "99";
      ctx.fillRect(cx, cy, size, size);
    } else if (cls === ShadowClass.DesignShadow && options.designShadowEnabled) {
      ctx.fillStyle = options.designShadowColor + "B3";
      ctx.fillRect(cx, cy, size, size);
    } else if (cls === ShadowClass.PlannedShadow && options.plannedShadowEnabled && options.plannedShadowColor) {
      ctx.fillStyle = options.plannedShadowColor + "A6";
      ctx.fillRect(cx, cy, size, size);
    }
    ctx.restore();
  };

  for (let i = 0; i < classifications.length; i++) {
    if (refinedParents.has(i)) continue;
    const cell = grid.cells[i];
    const cx = toCanvasX(cell.x) - cellPx / 2;
    const cy = toCanvasY(cell.y) - cellPx / 2;
    const cov = result.coverage ? result.coverage[i] : 1;
    drawCell(classifications[i], cx, cy, cellPx, cov);
  }

  if (result.refinedCells && result.refinedClassifications && result.refinedCellSize) {
    const refinedPx = result.refinedCellSize * scale;
    for (let i = 0; i < result.refinedCells.length; i++) {
      const cell = result.refinedCells[i];
      const cx = toCanvasX(cell.x) - refinedPx / 2;
      const cy = toCanvasY(cell.y) - refinedPx / 2;
      drawCell(result.refinedClassifications[i], cx, cy, refinedPx, 1);
    }
  }

  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 1;
  for (const b of buildings) {
    ctx.fillStyle = b.isDesign
      ? (options.designBuildingColor ?? "#ffffff")
      : b.isPlanned
        ? (options.designBuildingColor ?? "#e8e8ff")
        : (options.contextBuildingColor ?? "#d0d0d0");
    drawPolygon(ctx, b.footprint, toCanvasX, toCanvasY);
  }

  return canvas;
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  toX: (x: number) => number,
  toY: (y: number) => number,
) {
  if (ring.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(toX(ring[0][0]), toY(ring[0][1]));
  for (let i = 1; i < ring.length; i++) {
    ctx.lineTo(toX(ring[i][0]), toY(ring[i][1]));
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
