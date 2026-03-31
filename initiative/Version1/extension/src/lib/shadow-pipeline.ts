import { getBuildingFootprints, BuildingFootprint } from "./building-geometry";
import { getSunPositionForProject, SunPosition } from "./sun-position";
import {
  computeAllBuildingShadows,
  mergeShadows,
  BuildingShadow,
} from "./shadow-geometry";
import {
  differencePolygons,
  multiPolygonArea,
  MultiPolygon,
} from "./polygon-ops";

export type ShadowSceneResult = {
  contextShadow: MultiPolygon;
  designOnlyShadow: MultiPolygon;
  totalShadow: MultiPolygon;
  areas: {
    contextShadowArea: number;
    designOnlyShadowArea: number;
    totalShadowArea: number;
  };
  sun: SunPosition;
  date: Date;
  buildings: BuildingFootprint[];
  allShadows: BuildingShadow[];
};

/**
 * Full shadow computation pipeline for a single point in time.
 *
 * 1. Extracts building footprints + vertical extents from the Forma scene
 * 2. Computes the sun position for the project's geolocation
 * 3. Projects each building's shadow using uniform 2D offset
 * 4. Separates design vs. context shadows via polygon boolean ops
 * 5. Computes area metrics
 */
export async function computeShadowScene(
  date: Date,
  onProgress?: (message: string) => void,
): Promise<ShadowSceneResult> {
  onProgress?.("Extracting building geometry...");
  const buildings = await getBuildingFootprints();

  if (buildings.length === 0) {
    return emptyResult(date, { azimuth: 0, altitude: 0 }, []);
  }

  onProgress?.(`Found ${buildings.length} buildings. Computing sun position...`);
  const sun = await getSunPositionForProject(date);

  if (sun.altitude <= 0) {
    onProgress?.("Sun is below the horizon — no shadows.");
    return emptyResult(date, sun, buildings);
  }

  onProgress?.("Computing shadow polygons...");
  const allShadows = computeAllBuildingShadows(buildings, sun);

  const contextShadows = allShadows.filter((s) => !s.isDesign);
  const designShadows = allShadows.filter((s) => s.isDesign);

  onProgress?.("Merging context shadows...");
  const contextShadow = mergeShadows(contextShadows);

  onProgress?.("Merging design shadows...");
  const allDesignShadow = mergeShadows(designShadows);

  onProgress?.("Computing net-new design shadow...");
  const designOnlyShadow =
    allDesignShadow.length > 0 && contextShadow.length > 0
      ? differencePolygons(allDesignShadow, contextShadow)
      : allDesignShadow;

  onProgress?.("Merging total shadow...");
  const totalShadow = mergeShadows(allShadows);

  const areas = {
    contextShadowArea: multiPolygonArea(contextShadow),
    designOnlyShadowArea: multiPolygonArea(designOnlyShadow),
    totalShadowArea: multiPolygonArea(totalShadow),
  };

  onProgress?.("Shadow computation complete.");

  return {
    contextShadow,
    designOnlyShadow,
    totalShadow,
    areas,
    sun,
    date,
    buildings,
    allShadows,
  };
}

/**
 * Computes shadow scenes for multiple time steps.
 * Building geometry is extracted once and reused across all steps.
 */
export async function computeShadowTimeSeries(
  dates: Date[],
  onProgress?: (message: string, step: number, total: number) => void,
): Promise<ShadowSceneResult[]> {
  const buildings = await getBuildingFootprints();
  const results: ShadowSceneResult[] = [];

  for (let i = 0; i < dates.length; i++) {
    onProgress?.(`Computing shadows for step ${i + 1}/${dates.length}`, i, dates.length);

    const sun = await getSunPositionForProject(dates[i]);

    if (sun.altitude <= 0) {
      results.push(emptyResult(dates[i], sun, buildings));
      continue;
    }

    const allShadows = computeAllBuildingShadows(buildings, sun);
    const contextShadows = allShadows.filter((s) => !s.isDesign);
    const designShadows = allShadows.filter((s) => s.isDesign);

    const contextShadow = mergeShadows(contextShadows);
    const allDesignShadow = mergeShadows(designShadows);
    const designOnlyShadow =
      allDesignShadow.length > 0 && contextShadow.length > 0
        ? differencePolygons(allDesignShadow, contextShadow)
        : allDesignShadow;
    const totalShadow = mergeShadows(allShadows);

    results.push({
      contextShadow,
      designOnlyShadow,
      totalShadow,
      areas: {
        contextShadowArea: multiPolygonArea(contextShadow),
        designOnlyShadowArea: multiPolygonArea(designOnlyShadow),
        totalShadowArea: multiPolygonArea(totalShadow),
      },
      sun,
      date: dates[i],
      buildings,
      allShadows,
    });
  }

  return results;
}

function emptyResult(
  date: Date,
  sun: SunPosition,
  buildings: BuildingFootprint[],
): ShadowSceneResult {
  return {
    contextShadow: [],
    designOnlyShadow: [],
    totalShadow: [],
    areas: { contextShadowArea: 0, designOnlyShadowArea: 0, totalShadowArea: 0 },
    sun,
    date,
    buildings,
    allShadows: [],
  };
}
