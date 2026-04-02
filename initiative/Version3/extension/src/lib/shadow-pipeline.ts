import { extractSceneGeometry, type SceneGeometry, type BuildingMesh } from "./scene-geometry";
import { TerrainSampler } from "./terrain-sampler";
import { createAnalysisGrid, findBoundaryCells, generateSubCells, type AnalysisGrid } from "./analysis-grid";
import { castShadowRays, castMultiSampleRays } from "./ray-caster";
import { computeShadowAreas, type ShadowGridResult } from "./shadow-grid";
import { getSunPositionForProject, type SunPosition } from "./sun-position";
import { buildBVH, type FlatBVH } from "./bvh";

const DEFAULT_CELL_SIZE = 2; // meters

/**
 * Cached scene data: geometry + terrain sampler + analysis grid + BVH.
 * Extracted once and reused for multiple time steps.
 */
export type SceneCache = {
  scene: SceneGeometry;
  terrain: TerrainSampler;
  grid: AnalysisGrid;
  bvh: FlatBVH;
};

/**
 * Extracts scene geometry, builds terrain sampler and analysis grid.
 * This is the expensive async step — only needs to happen once per
 * editing session (or when the proposal changes).
 *
 * Buildings are auto-classified as design vs context based on floor
 * representations (graphBuilding / grossFloorAreaPolygons).
 */
export async function prepareScene(
  onProgress?: (msg: string) => void,
  cellSize = DEFAULT_CELL_SIZE,
): Promise<SceneCache> {
  const scene = await extractSceneGeometry(onProgress);

  onProgress?.("Sampling terrain elevation...");
  const terrain = await TerrainSampler.fromElevationAPI(scene.bounds, 5);
  onProgress?.("Terrain elevation grid built.");

  onProgress?.("Creating analysis grid...");
  const grid = createAnalysisGrid(scene.bounds, terrain, cellSize);
  onProgress?.(`Analysis grid: ${grid.cols}×${grid.rows} = ${grid.cells.length} cells.`);

  onProgress?.("Building BVH over buildings...");
  const bvh = buildBVH(scene.buildings);
  onProgress?.(`BVH built: ${bvh.nodes.length} nodes over ${scene.buildings.length} buildings.`);

  return { scene, terrain, grid, bvh };
}

/**
 * Runs the ray caster for a single point in time using a cached scene.
 * Includes one level of adaptive refinement at shadow boundaries.
 */
export function computeShadowGrid(
  cache: SceneCache,
  sun: SunPosition,
  date: Date,
): ShadowGridResult {
  const { grid, bvh } = cache;
  const buildings = cache.scene.buildings;
  const classifications = castShadowRays(grid, buildings, sun, bvh);

  const boundaries = findBoundaryCells(classifications, grid.cols, grid.rows);
  const refinement = refineAndCompute(grid, buildings, sun, classifications, boundaries, bvh);

  return {
    grid,
    classifications,
    sun,
    date,
    ...refinement,
    buildings,
  };
}

function refineAndCompute(
  grid: AnalysisGrid,
  buildings: BuildingMesh[],
  sun: SunPosition,
  classifications: Uint8Array,
  boundaries: Set<number>,
  bvh?: FlatBVH,
) {
  const cellArea = grid.cellSize * grid.cellSize;

  if (boundaries.size === 0) {
    return { areas: computeShadowAreas(classifications, cellArea) };
  }

  // Adaptive grid refinement (Task 1)
  const { subGrid, parentMap } = generateSubCells(grid, boundaries);
  const refinedClassifications = castShadowRays(subGrid, buildings, sun, bvh);
  const refinedCellSize = subGrid.cellSize;
  const refinedCellArea = refinedCellSize * refinedCellSize;

  // Multi-sample anti-aliasing for boundary cells at base resolution (Task 2)
  const boundaryCellList = Array.from(boundaries);
  const boundaryCells = boundaryCellList.map((idx) => grid.cells[idx]);
  const msaa = castMultiSampleRays(boundaryCells, grid.cellSize, buildings, sun, bvh);
  const coverage = new Float32Array(classifications.length).fill(1.0);
  for (let j = 0; j < boundaryCellList.length; j++) {
    coverage[boundaryCellList[j]] = msaa.coverage[j];
  }

  const areas = computeShadowAreas(classifications, cellArea, {
    refinedClassifications,
    refinedCellArea,
    refinedParentMap: parentMap,
  });

  return {
    areas,
    refinedCells: subGrid.cells,
    refinedClassifications,
    refinedCellSize,
    refinedParentMap: parentMap,
    coverage,
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
  bvh?: FlatBVH,
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
    worker.postMessage({ grid, buildings, sun, bvh });
  });
}

/**
 * Async version of computeShadowGrid. Uses a Web Worker when the
 * grid exceeds WORKER_CELL_THRESHOLD to avoid freezing the UI.
 * Includes one level of adaptive refinement at shadow boundaries.
 */
export async function computeShadowGridAsync(
  cache: SceneCache,
  sun: SunPosition,
  date: Date,
  onProgress?: (msg: string) => void,
): Promise<ShadowGridResult> {
  const { grid, bvh } = cache;
  const buildings = cache.scene.buildings;
  const useWorker = grid.cells.length > WORKER_CELL_THRESHOLD;

  let classifications: Uint8Array;
  if (useWorker) {
    onProgress?.(
      `Casting shadow rays in background (${grid.cells.length.toLocaleString()} cells)...`,
    );
    classifications = await castShadowRaysInWorker(grid, buildings, sun, bvh);
  } else {
    classifications = castShadowRays(grid, buildings, sun, bvh);
  }

  onProgress?.("Refining shadow boundaries...");
  const boundaries = findBoundaryCells(classifications, grid.cols, grid.rows);
  const refinement = refineAndCompute(grid, buildings, sun, classifications, boundaries, bvh);

  return {
    grid,
    classifications,
    sun,
    date,
    ...refinement,
    buildings,
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
