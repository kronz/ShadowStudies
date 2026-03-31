import { extractSceneGeometry, type SceneGeometry, type BuildingMesh } from "./scene-geometry";
import { TerrainSampler } from "./terrain-sampler";
import { createAnalysisGrid, type AnalysisGrid } from "./analysis-grid";
import { castShadowRays } from "./ray-caster";
import { computeShadowAreas, type ShadowGridResult } from "./shadow-grid";
import { getSunPositionForProject, type SunPosition } from "./sun-position";

const DEFAULT_CELL_SIZE = 2; // meters

/**
 * Cached scene data: geometry + terrain sampler + analysis grid.
 * Extracted once and reused for multiple time steps.
 */
export type SceneCache = {
  scene: SceneGeometry;
  terrain: TerrainSampler;
  grid: AnalysisGrid;
};

/**
 * Extracts scene geometry, builds terrain sampler and analysis grid.
 * This is the expensive async step — only needs to happen once per
 * editing session (or when the proposal changes).
 *
 * designPaths: user-selected element paths to treat as "design" buildings.
 */
export async function prepareScene(
  onProgress?: (msg: string) => void,
  cellSize = DEFAULT_CELL_SIZE,
  designPaths?: string[],
): Promise<SceneCache> {
  const scene = await extractSceneGeometry(onProgress, designPaths);

  onProgress?.("Sampling terrain elevation...");
  const terrain = await TerrainSampler.fromElevationAPI(scene.bounds, 5);
  onProgress?.("Terrain elevation grid built.");

  onProgress?.("Creating analysis grid...");
  const grid = createAnalysisGrid(scene.bounds, terrain, cellSize);
  onProgress?.(`Analysis grid: ${grid.cols}×${grid.rows} = ${grid.cells.length} cells.`);

  return { scene, terrain, grid };
}

/**
 * Runs the ray caster for a single point in time using a cached scene.
 * This is the fast synchronous step — suitable for real-time preview.
 */
export function computeShadowGrid(
  cache: SceneCache,
  sun: SunPosition,
  date: Date,
): ShadowGridResult {
  const classifications = castShadowRays(cache.grid, cache.scene.buildings, sun);
  const cellArea = cache.grid.cellSize * cache.grid.cellSize;
  const areas = computeShadowAreas(classifications, cellArea);

  return {
    grid: cache.grid,
    classifications,
    sun,
    date,
    areas,
    buildings: cache.scene.buildings,
  };
}

// ────────────────────────────────────────────────────────────
// Async shadow computation (Web Worker for large grids)
// ────────────────────────────────────────────────────────────

const WORKER_CELL_THRESHOLD = 400_000;

function castShadowRaysInWorker(
  grid: AnalysisGrid,
  buildings: BuildingMesh[],
  sun: SunPosition,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./shadow-worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<Uint8Array>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(`Shadow worker error: ${e.message}`));
      worker.terminate();
    };
    worker.postMessage({ grid, buildings, sun });
  });
}

/**
 * Async version of computeShadowGrid. Uses a Web Worker when the
 * grid exceeds WORKER_CELL_THRESHOLD to avoid freezing the UI.
 */
export async function computeShadowGridAsync(
  cache: SceneCache,
  sun: SunPosition,
  date: Date,
  onProgress?: (msg: string) => void,
): Promise<ShadowGridResult> {
  const useWorker = cache.grid.cells.length > WORKER_CELL_THRESHOLD;

  let classifications: Uint8Array;
  if (useWorker) {
    onProgress?.(
      `Casting shadow rays in background (${cache.grid.cells.length.toLocaleString()} cells)...`,
    );
    classifications = await castShadowRaysInWorker(
      cache.grid,
      cache.scene.buildings,
      sun,
    );
  } else {
    classifications = castShadowRays(cache.grid, cache.scene.buildings, sun);
  }

  const cellArea = cache.grid.cellSize * cache.grid.cellSize;
  const areas = computeShadowAreas(classifications, cellArea);

  return {
    grid: cache.grid,
    classifications,
    sun,
    date,
    areas,
    buildings: cache.scene.buildings,
  };
}

/**
 * Full pipeline: extract geometry, compute shadow grid, return result.
 * Convenience wrapper for single-shot use.
 */
export async function computeShadowScene(
  date: Date,
  onProgress?: (msg: string) => void,
): Promise<ShadowGridResult> {
  const cache = await prepareScene(onProgress);

  onProgress?.("Computing sun position...");
  const sun = await getSunPositionForProject(date);

  if (sun.altitude <= 0) {
    onProgress?.("Sun is below the horizon — no shadows.");
    return {
      grid: cache.grid,
      classifications: new Uint8Array(cache.grid.cells.length),
      sun,
      date,
      areas: { contextShadowArea: 0, designOnlyShadowArea: 0, totalShadowArea: 0 },
      buildings: cache.scene.buildings,
    };
  }

  onProgress?.("Casting shadow rays...");
  const result = computeShadowGrid(cache, sun, date);
  onProgress?.("Shadow computation complete.");

  return result;
}
