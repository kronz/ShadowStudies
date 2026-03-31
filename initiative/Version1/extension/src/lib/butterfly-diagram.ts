import { DateTime } from "luxon";
import { computeShadowScene, ShadowSceneResult } from "./shadow-pipeline";
import { MultiPolygon } from "./polygon-ops";

export type ButterflyConfig = {
  month: number;
  day: number;
  startHour: number;
  endHour: number;
  intervalMinutes: number;
  year: number;
  timezone: string;
};

export type ButterflyResult = {
  steps: {
    date: Date;
    label: string;
    scene: ShadowSceneResult;
  }[];
};

/**
 * Computes shadow geometry at each time step for a butterfly / fan diagram.
 * Each step has its own ShadowSceneResult with full polygon data.
 */
export async function computeButterflyDiagram(
  config: ButterflyConfig,
  onProgress?: (message: string) => void,
): Promise<ButterflyResult> {
  const steps: ButterflyResult["steps"] = [];

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
    allDates.push({
      date: current.toJSDate(),
      label: current.toFormat("HH:mm"),
    });
    current = current.plus({ minutes: config.intervalMinutes });
  }

  for (let i = 0; i < allDates.length; i++) {
    const { date, label } = allDates[i];
    onProgress?.(`Computing shadow ${i + 1}/${allDates.length} (${label})...`);
    const scene = await computeShadowScene(date);
    steps.push({ date, label, scene });
  }

  return { steps };
}

/**
 * Renders a butterfly diagram to a canvas. Each time step's shadow
 * is drawn with graduated opacity — earlier and later steps are
 * more transparent, creating a "fan" effect that shows how shadows
 * sweep across the site during the day.
 *
 * Building footprints are drawn on top for context.
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

  const bounds = computeAggregateBounds(result);
  if (!bounds) return canvas;

  const padding = 50;
  const scaleX = (width - 2 * padding) / (bounds.maxX - bounds.minX);
  const scaleY = (height - 2 * padding) / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY);

  const toX = (x: number) => padding + (x - bounds.minX) * scale;
  const toY = (y: number) => height - padding - (y - bounds.minY) * scale;

  const n = result.steps.length;
  const baseAlpha = Math.min(0.35, 1.5 / n);

  for (let i = 0; i < n; i++) {
    const step = result.steps[i];

    if (options.contextShadowEnabled && step.scene.contextShadow.length > 0) {
      ctx.fillStyle = hexWithAlpha(options.contextShadowColor, baseAlpha);
      drawMultiPoly(ctx, step.scene.contextShadow, toX, toY);
    }

    if (options.designShadowEnabled && step.scene.designOnlyShadow.length > 0) {
      ctx.fillStyle = hexWithAlpha(options.designShadowColor, baseAlpha);
      drawMultiPoly(ctx, step.scene.designOnlyShadow, toX, toY);
    }
  }

  const allBuildings = result.steps[0]?.scene.buildings ?? [];
  ctx.strokeStyle = "#666666";
  ctx.lineWidth = 1.5;

  for (const b of allBuildings) {
    ctx.fillStyle = b.isDesign
      ? (options.designBuildingColor ?? "#ffffff")
      : (options.contextBuildingColor ?? "#d0d0d0");
    drawRing(ctx, b.footprint, toX, toY, true);
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
      if (step.scene.sun.altitude > 0) {
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

function computeAggregateBounds(result: ButterflyResult) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let hasPoints = false;

  for (const step of result.steps) {
    for (const b of step.scene.buildings) {
      for (const [x, y] of b.footprint) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasPoints = true;
      }
    }
    for (const poly of step.scene.totalShadow) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          hasPoints = true;
        }
      }
    }
  }

  if (!hasPoints) return null;
  const pad = Math.max(maxX - minX, maxY - minY) * 0.05;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function drawMultiPoly(
  ctx: CanvasRenderingContext2D,
  multi: MultiPolygon,
  toX: (x: number) => number,
  toY: (y: number) => number,
) {
  for (const polygon of multi) {
    ctx.beginPath();
    for (const ring of polygon) {
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

function drawRing(
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
