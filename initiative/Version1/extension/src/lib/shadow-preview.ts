import { Forma } from "forma-embedded-view-sdk/auto";
import { DateTime } from "luxon";
import { computeShadowScene, ShadowSceneResult } from "./shadow-pipeline";
import { triangulateMultiPolygonOnTerrain } from "./polygon-ops";
import { TerrainSampler } from "./terrain";

let activeMeshIds: string[] = [];

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [
    (n >> 16) & 255,
    (n >> 8) & 255,
    n & 255,
    Math.round(alpha * 255),
  ];
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
  onProgress?: (message: string) => void;
};

export type ShadowPreviewResult = {
  areas: {
    contextShadowArea: number;
    designOnlyShadowArea: number;
    totalShadowArea: number;
  };
};

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

  const scene = await computeShadowScene(noonDate, onProgress);

  onProgress?.("Rendering shadow meshes on terrain...");
  await renderSceneToMeshes(scene, options);

  return { areas: scene.areas };
}

/**
 * Renders shadow polygons as 3D meshes draped on the terrain.
 * Each vertex's z is sampled from terrain elevation so the mesh
 * conforms to the ground surface.
 */
async function renderSceneToMeshes(
  scene: ShadowSceneResult,
  options: ShadowPreviewOptions,
): Promise<void> {
  const terrain = new TerrainSampler(2.0);
  const Z_OFFSET = 0.15;

  const getZ = async (x: number, y: number) => {
    const elevation = await terrain.getElevation(x, y);
    return elevation + Z_OFFSET;
  };

  if (options.contextShadowEnabled && scene.contextShadow.length > 0) {
    const mesh = await triangulateMultiPolygonOnTerrain(
      scene.contextShadow,
      hexToRgba(options.contextShadowColor, 0.55),
      getZ,
    );
    if (mesh) {
      const { id } = await Forma.render.addMesh({ geometryData: mesh });
      activeMeshIds.push(id);
    }
  }

  if (options.designShadowEnabled && scene.designOnlyShadow.length > 0) {
    const getZDesign = async (x: number, y: number) => {
      const elevation = await terrain.getElevation(x, y);
      return elevation + Z_OFFSET + 0.01;
    };
    const mesh = await triangulateMultiPolygonOnTerrain(
      scene.designOnlyShadow,
      hexToRgba(options.designShadowColor, 0.65),
      getZDesign,
    );
    if (mesh) {
      const { id } = await Forma.render.addMesh({ geometryData: mesh });
      activeMeshIds.push(id);
    }
  }
}
