import { Forma } from "forma-embedded-view-sdk/auto";
import { DateTime } from "luxon";
import { prepareScene, computeShadowGridAsync } from "./shadow-pipeline";
import { buildShadowMeshes } from "./grid-renderer";
import { getSunPositionForProject } from "./sun-position";
import type { ShadowGridResult } from "./shadow-grid";

let activeMeshIds: string[] = [];
let lastShadowResult: ShadowGridResult | null = null;

export function getLastShadowResult(): ShadowGridResult | null {
  return lastShadowResult;
}

export async function clearShadowPreview(): Promise<void> {
  for (const id of activeMeshIds) {
    try {
      await Forma.render.remove({ id });
    } catch {
      // mesh may already be removed
    }
  }
  activeMeshIds = [];
}

export type ShadowPreviewOptions = {
  /** If provided, constructs noon on this month/day. Otherwise uses Forma.sun.getDate(). */
  month?: number;
  day?: number;
  /** Explicit date override — takes priority over month/day and Forma sun date. */
  dateOverride?: Date;
  designShadowEnabled: boolean;
  designShadowColor: string;
  contextShadowEnabled: boolean;
  contextShadowColor: string;
  plannedShadowEnabled?: boolean;
  plannedShadowColor?: string;
  designPaths?: string[];
  plannedPaths?: string[];
  cellSize?: number;
  onProgress?: (message: string) => void;
};

export type ShadowPreviewResult = {
  areas: {
    contextShadowArea: number;
    designOnlyShadowArea: number;
    plannedShadowArea: number;
    totalShadowArea: number;
  };
  /** The actual date/time used for the preview. */
  dateUsed: Date;
};

/**
 * Resolves the preview date from options, falling back to Forma.sun.getDate().
 */
async function resolvePreviewDate(options: ShadowPreviewOptions): Promise<Date> {
  if (options.dateOverride) return options.dateOverride;

  if (options.month !== undefined && options.day !== undefined) {
    const projectTimezone = await Forma.project.getTimezone();
    if (!projectTimezone) throw new Error("Unable to access project timezone");
    const currentSunDate = await Forma.sun.getDate();
    const year = currentSunDate.getFullYear();
    return DateTime.fromObject(
      { year, month: options.month, day: options.day, hour: 12, minute: 0 },
      { zone: projectTimezone },
    ).toJSDate();
  }

  return Forma.sun.getDate();
}

/**
 * Computes shadows via ray casting and renders them as colored grid
 * meshes in the Forma 3D scene.
 */
export async function renderShadowPreview(
  options: ShadowPreviewOptions,
): Promise<ShadowPreviewResult> {
  await clearShadowPreview();

  const { onProgress } = options;

  const previewDate = await resolvePreviewDate(options);

  const cache = await prepareScene(onProgress, options.cellSize, options.designPaths, options.plannedPaths);

  onProgress?.("Computing sun position...");
  const sun = await getSunPositionForProject(previewDate);

  if (sun.altitude <= 0) {
    onProgress?.("Sun is below the horizon.");
    return {
      areas: { contextShadowArea: 0, designOnlyShadowArea: 0, plannedShadowArea: 0, totalShadowArea: 0 },
      dateUsed: previewDate,
    };
  }

  onProgress?.("Casting shadow rays...");
  const result = await computeShadowGridAsync(cache, sun, previewDate, onProgress);
  lastShadowResult = result;

  onProgress?.("Rendering shadow grid meshes...");
  const meshes = buildShadowMeshes(result.grid, result.classifications, options, result);

  for (const mesh of meshes) {
    const { id } = await Forma.render.addMesh({ geometryData: mesh.geometryData });
    activeMeshIds.push(id);
  }

  onProgress?.("Shadow preview ready.");
  return { areas: result.areas, dateUsed: previewDate };
}
