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
  month: number;
  day: number;
  designShadowEnabled: boolean;
  designShadowColor: string;
  contextShadowEnabled: boolean;
  contextShadowColor: string;
  designPaths?: string[];
  cellSize?: number;
  onProgress?: (message: string) => void;
};

export type ShadowPreviewResult = {
  areas: {
    contextShadowArea: number;
    designOnlyShadowArea: number;
    totalShadowArea: number;
  };
};

/**
 * Computes shadows via ray casting and renders them as colored grid
 * meshes in the Forma 3D scene.
 */
export async function renderShadowPreview(
  options: ShadowPreviewOptions,
): Promise<ShadowPreviewResult> {
  await clearShadowPreview();

  const { month, day, onProgress } = options;

  const projectTimezone = await Forma.project.getTimezone();
  if (!projectTimezone) {
    throw new Error("Unable to access project timezone");
  }

  const currentSunDate = await Forma.sun.getDate();
  const year = currentSunDate.getFullYear();

  const noonDate = DateTime.fromObject(
    { year, month, day, hour: 12, minute: 0 },
    { zone: projectTimezone },
  ).toJSDate();

  const cache = await prepareScene(onProgress, options.cellSize, options.designPaths);

  onProgress?.("Computing sun position...");
  const sun = await getSunPositionForProject(noonDate);

  if (sun.altitude <= 0) {
    onProgress?.("Sun is below the horizon.");
    return { areas: { contextShadowArea: 0, designOnlyShadowArea: 0, totalShadowArea: 0 } };
  }

  onProgress?.("Casting shadow rays...");
  const result = await computeShadowGridAsync(cache, sun, noonDate, onProgress);
  lastShadowResult = result;

  onProgress?.("Rendering shadow grid meshes...");
  const meshes = buildShadowMeshes(result.grid, result.classifications, options);

  for (const mesh of meshes) {
    const { id } = await Forma.render.addMesh({ geometryData: mesh.geometryData });
    activeMeshIds.push(id);
  }

  onProgress?.("Shadow preview ready.");
  return { areas: result.areas };
}
