import { Forma } from "forma-embedded-view-sdk/auto";
import { computeShadowScene, ShadowSceneResult } from "./shadow-pipeline";
import { triangulateMultiPolygonOnTerrain } from "./polygon-ops";
import { TerrainSampler } from "./terrain";

export type ShadowExportOptions = {
  designShadowEnabled: boolean;
  designShadowColor: string;
  contextShadowEnabled: boolean;
  contextShadowColor: string;
};

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(alpha * 255)];
}

/**
 * Adds terrain-draped shadow meshes to the Forma scene.
 * Returns mesh IDs for cleanup after capture.
 */
async function addShadowMeshesToScene(
  scene: ShadowSceneResult,
  options: ShadowExportOptions,
): Promise<string[]> {
  const meshIds: string[] = [];
  const terrain = new TerrainSampler(2.0);
  const Z_OFFSET = 0.15;

  const getZ = async (x: number, y: number) => {
    const elevation = await terrain.getElevation(x, y);
    return elevation + Z_OFFSET;
  };

  if (options.contextShadowEnabled && scene.contextShadow.length > 0) {
    const mesh = await triangulateMultiPolygonOnTerrain(
      scene.contextShadow,
      hexToRgba(options.contextShadowColor, 0.6),
      getZ,
    );
    if (mesh) {
      const { id } = await Forma.render.addMesh({ geometryData: mesh });
      meshIds.push(id);
    }
  }

  if (options.designShadowEnabled && scene.designOnlyShadow.length > 0) {
    const getZDesign = async (x: number, y: number) => {
      const elevation = await terrain.getElevation(x, y);
      return elevation + Z_OFFSET + 0.01;
    };
    const mesh = await triangulateMultiPolygonOnTerrain(
      scene.designOnlyShadow,
      hexToRgba(options.designShadowColor, 0.7),
      getZDesign,
    );
    if (mesh) {
      const { id } = await Forma.render.addMesh({ geometryData: mesh });
      meshIds.push(id);
    }
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
 * Captures a single frame with geometry-based shadow overlays.
 *
 * 1. Sets the Forma sun date (for correct ambient lighting)
 * 2. Computes shadow geometry from building footprints + sun position
 * 3. Adds colored shadow meshes to the 3D scene
 * 4. Captures a screenshot via Forma.camera.capture()
 * 5. Removes the transient shadow meshes
 *
 * Returns the captured canvas and the shadow scene result (for area metrics).
 */
export async function captureFrameWithShadows(
  date: Date,
  width: number,
  height: number,
  options: ShadowExportOptions,
  onProgress?: (message: string) => void,
): Promise<{ canvas: HTMLCanvasElement; scene: ShadowSceneResult }> {
  const hasShadowOverlay =
    options.designShadowEnabled || options.contextShadowEnabled;

  await Forma.sun.setDate({ date });

  if (!hasShadowOverlay) {
    const canvas = await Forma.camera.capture({ width, height });
    const scene = await computeShadowScene(date);
    return { canvas, scene };
  }

  onProgress?.("Computing shadow geometry...");
  const scene = await computeShadowScene(date);

  onProgress?.("Rendering shadow overlay...");
  const meshIds = await addShadowMeshesToScene(scene, options);

  // Brief delay to let the renderer pick up the new meshes
  await new Promise((r) => setTimeout(r, 200));

  const canvas = await Forma.camera.capture({ width, height });

  await removeMeshes(meshIds);

  return { canvas, scene };
}

/**
 * Captures multiple frames for a time series. Reuses building geometry
 * extraction across frames for efficiency.
 */
export async function captureTimeSeriesWithShadows(
  dates: Date[],
  width: number,
  height: number,
  options: ShadowExportOptions,
  onProgress?: (message: string, step: number, total: number) => void,
): Promise<{ canvas: HTMLCanvasElement; scene: ShadowSceneResult; date: Date }[]> {
  const results: { canvas: HTMLCanvasElement; scene: ShadowSceneResult; date: Date }[] = [];

  for (let i = 0; i < dates.length; i++) {
    onProgress?.(
      `Capturing frame ${i + 1}/${dates.length}`,
      i,
      dates.length,
    );

    const { canvas, scene } = await captureFrameWithShadows(
      dates[i],
      width,
      height,
      options,
    );
    results.push({ canvas, scene, date: dates[i] });
  }

  return results;
}

/**
 * Renders a pure plan-view (top-down) shadow diagram to a canvas.
 * No Forma camera capture involved — this is a standalone 2D rendering
 * suitable for technical submittals that require clean plan-view diagrams.
 *
 * @param scene Pre-computed shadow scene result.
 * @param width Canvas width in pixels.
 * @param height Canvas height in pixels.
 * @param options Color settings.
 * @param bgColor Background color (default white).
 */
export function renderPlanViewDiagram(
  scene: ShadowSceneResult,
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

  const bounds = computeBounds(scene);
  if (!bounds) return canvas;

  const padding = 40;
  const scaleX = (width - 2 * padding) / (bounds.maxX - bounds.minX);
  const scaleY = (height - 2 * padding) / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY);

  const toCanvasX = (x: number) => padding + (x - bounds.minX) * scale;
  const toCanvasY = (y: number) => height - padding - (y - bounds.minY) * scale;

  if (options.contextShadowEnabled) {
    ctx.fillStyle = options.contextShadowColor + "99";
    drawMultiPolygon(ctx, scene.contextShadow, toCanvasX, toCanvasY);
  }

  if (options.designShadowEnabled) {
    ctx.fillStyle = options.designShadowColor + "B3";
    drawMultiPolygon(ctx, scene.designOnlyShadow, toCanvasX, toCanvasY);
  }

  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 1;
  for (const building of scene.buildings) {
    if (!building.isDesign) {
      ctx.fillStyle = options.contextBuildingColor ?? "#d0d0d0";
      drawPolygon(ctx, building.footprint, toCanvasX, toCanvasY, true);
    }
  }
  for (const building of scene.buildings) {
    if (building.isDesign) {
      ctx.fillStyle = options.designBuildingColor ?? "#ffffff";
      drawPolygon(ctx, building.footprint, toCanvasX, toCanvasY, true);
    }
  }

  return canvas;
}

function computeBounds(scene: ShadowSceneResult) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  const processPoly = (ring: [number, number][]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      hasPoints = true;
    }
  };

  for (const b of scene.buildings) processPoly(b.footprint);
  for (const p of scene.totalShadow) for (const r of p) processPoly(r);

  if (!hasPoints) return null;

  const pad = Math.max(maxX - minX, maxY - minY) * 0.05;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function drawMultiPolygon(
  ctx: CanvasRenderingContext2D,
  multi: [number, number][][][],
  toX: (x: number) => number,
  toY: (y: number) => number,
) {
  for (const polygon of multi) {
    ctx.beginPath();
    for (let r = 0; r < polygon.length; r++) {
      const ring = polygon[r];
      if (ring.length === 0) continue;
      ctx.moveTo(toX(ring[0][0]), toY(ring[0][1]));
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(toX(ring[i][0]), toY(ring[i][1]));
      }
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  toX: (x: number) => number,
  toY: (y: number) => number,
  fill: boolean,
) {
  if (ring.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(toX(ring[0][0]), toY(ring[0][1]));
  for (let i = 1; i < ring.length; i++) {
    ctx.lineTo(toX(ring[i][0]), toY(ring[i][1]));
  }
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}
