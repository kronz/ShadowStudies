import { DateTime } from "luxon";
import {
  prepareScene,
  computeShadowGridAsync,
  type SceneCache,
} from "./shadow-pipeline";
import { getSunPositionForProject } from "./sun-position";
import { ShadowClass } from "./ray-caster";
import type { ShadowGridResult } from "./shadow-grid";
import type { BuildingMesh, Bounds2D } from "./scene-geometry";

export type ButterflyConfig = {
  month: number;
  day: number;
  startHour: number;
  endHour: number;
  intervalMinutes: number;
  year: number;
  timezone: string;
  designPaths?: string[];
  cellSize?: number;
};

export type ButterflyStep = {
  date: Date;
  label: string;
  result: ShadowGridResult;
};

export type ButterflyResult = {
  steps: ButterflyStep[];
  buildings: BuildingMesh[];
  gridCols: number;
  gridRows: number;
  cellSize: number;
  bounds: Bounds2D;
};

/**
 * Computes shadow grids at each time step for a butterfly diagram.
 * Scene geometry is extracted once and reused across all steps.
 */
export async function computeButterflyDiagram(
  config: ButterflyConfig,
  onProgress?: (message: string) => void,
): Promise<ButterflyResult> {
  const cache: SceneCache = await prepareScene(onProgress, config.cellSize, config.designPaths);

  let current = DateTime.fromObject(
    {
      year: config.year,
      month: config.month,
      day: config.day,
      hour: config.startHour,
      minute: 0,
    },
    { zone: config.timezone },
  );
  const end = DateTime.fromObject(
    {
      year: config.year,
      month: config.month,
      day: config.day,
      hour: config.endHour,
      minute: 0,
    },
    { zone: config.timezone },
  );

  const allDates: { date: Date; label: string }[] = [];
  while (current.toMillis() <= end.toMillis()) {
    allDates.push({ date: current.toJSDate(), label: current.toFormat("HH:mm") });
    current = current.plus({ minutes: config.intervalMinutes });
  }

  const steps: ButterflyStep[] = [];
  for (let i = 0; i < allDates.length; i++) {
    const { date, label } = allDates[i];
    onProgress?.(`Computing shadow ${i + 1}/${allDates.length} (${label})...`);
    const sun = await getSunPositionForProject(date);
    const result = await computeShadowGridAsync(cache, sun, date, onProgress);
    steps.push({ date, label, result });
  }

  return {
    steps,
    buildings: cache.scene.buildings,
    gridCols: cache.grid.cols,
    gridRows: cache.grid.rows,
    cellSize: cache.grid.cellSize,
    bounds: cache.grid.bounds,
  };
}

/**
 * Renders a butterfly diagram to a 2D canvas. Each time step's shadow
 * cells are drawn with graduated opacity — overlapping shadows appear
 * darker, creating a "fan" effect showing how shadows sweep across
 * the site during the day.
 *
 * Quantitative: darker areas received more shadow-hours.
 */
export function renderButterflyToCanvas(
  result: ButterflyResult,
  width: number,
  height: number,
  options: {
    contextShadowEnabled: boolean;
    contextShadowColor: string;
    designShadowEnabled: boolean;
    designShadowColor: string;
    plannedShadowEnabled?: boolean;
    plannedShadowColor?: string;
    contextBuildingColor?: string;
    designBuildingColor?: string;
    bgColor?: string;
    showTimestampLabels?: boolean;
  },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = options.bgColor ?? "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const bounds = result.bounds;
  const padding = 50;
  const scaleX = (width - 2 * padding) / (bounds.maxX - bounds.minX);
  const scaleY = (height - 2 * padding) / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY);

  const toX = (x: number) => padding + (x - bounds.minX) * scale;
  const toY = (y: number) => height - padding - (y - bounds.minY) * scale;

  const cellPx = result.cellSize * scale;
  const n = result.steps.length;
  const baseAlpha = Math.min(0.35, 1.5 / n);

  const drawShadowCell = (
    cls: number,
    cx: number,
    cy: number,
    size: number,
    alpha: number,
  ) => {
    if (cls === ShadowClass.Sunlit) return;
    if (cls === ShadowClass.ContextShadow && options.contextShadowEnabled) {
      ctx.fillStyle = hexWithAlpha(options.contextShadowColor, alpha);
      ctx.fillRect(cx, cy, size, size);
    } else if (cls === ShadowClass.DesignShadow && options.designShadowEnabled) {
      ctx.fillStyle = hexWithAlpha(options.designShadowColor, alpha);
      ctx.fillRect(cx, cy, size, size);
    } else if (cls === ShadowClass.PlannedShadow && options.plannedShadowEnabled && options.plannedShadowColor) {
      ctx.fillStyle = hexWithAlpha(options.plannedShadowColor, alpha);
      ctx.fillRect(cx, cy, size, size);
    }
  };

  for (const step of result.steps) {
    if (step.result.sun.altitude <= 0) continue;

    const { classifications, grid } = step.result;
    const refinedParents = new Set<number>();
    if (step.result.refinedParentMap) {
      for (let j = 0; j < step.result.refinedParentMap.length; j++) {
        refinedParents.add(step.result.refinedParentMap[j]);
      }
    }

    for (let i = 0; i < classifications.length; i++) {
      if (refinedParents.has(i)) continue;
      const cell = grid.cells[i];
      const cx = toX(cell.x) - cellPx / 2;
      const cy = toY(cell.y) - cellPx / 2;
      const cov = step.result.coverage ? step.result.coverage[i] : 1;
      drawShadowCell(classifications[i], cx, cy, cellPx, baseAlpha * cov);
    }

    if (step.result.refinedCells && step.result.refinedClassifications && step.result.refinedCellSize) {
      const refinedPx = step.result.refinedCellSize * scale;
      for (let i = 0; i < step.result.refinedCells.length; i++) {
        const cell = step.result.refinedCells[i];
        const cx = toX(cell.x) - refinedPx / 2;
        const cy = toY(cell.y) - refinedPx / 2;
        drawShadowCell(step.result.refinedClassifications[i], cx, cy, refinedPx, baseAlpha);
      }
    }
  }

  ctx.strokeStyle = "#666666";
  ctx.lineWidth = 1.5;
  for (const b of result.buildings) {
    ctx.fillStyle = b.isDesign
      ? (options.designBuildingColor ?? "#ffffff")
      : (options.contextBuildingColor ?? "#d0d0d0");
    drawRing(ctx, b.footprint, toX, toY);
  }

  if (options.showTimestampLabels !== false) {
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#333333";
    ctx.textAlign = "left";
    const legendX = padding;
    let legendY = padding;
    ctx.fillText("Butterfly Diagram", legendX, legendY);
    legendY += 16;
    ctx.font = "9px sans-serif";
    ctx.fillStyle = "#666666";
    for (const step of result.steps) {
      if (step.result.sun.altitude > 0) {
        ctx.fillText(step.label, legendX, legendY);
        legendY += 12;
      }
    }
  }

  return canvas;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
}

function drawRing(
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
