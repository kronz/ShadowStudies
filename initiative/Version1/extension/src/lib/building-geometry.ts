import { Forma } from "forma-embedded-view-sdk/auto";
import { classifyElements } from "./element-classifier";
import type { Ring } from "./polygon-ops";
import { signedRingArea } from "./polygon-ops";

/** Minimum mesh height (max z - min z) to be treated as a building. */
const MIN_BUILDING_HEIGHT = 2.5; // meters (~1 story)

/** Maximum footprint area — anything larger is likely terrain or landscape. */
const MAX_FOOTPRINT_AREA = 50_000; // m²

export type BuildingFootprint = {
  path: string;
  footprint: Ring;
  /** Building height in meters (max z minus min z of mesh). */
  height: number;
  /** Absolute z of the building's highest point in Forma local coords. */
  topZ: number;
  /** Absolute z of the building's lowest point (approximate base/ground contact). */
  baseZ: number;
  isDesign: boolean;
};

async function getFootprintForPath(path: string): Promise<Ring | null> {
  try {
    const fp = await Forma.geometry.getFootprint({ path });
    if (!fp || fp.type !== "Polygon" || fp.coordinates.length < 3) return null;
    return fp.coordinates.map(([x, y]) => [x, y] as [number, number]);
  } catch {
    return null;
  }
}

async function getVerticalExtents(
  path: string,
): Promise<{ minZ: number; maxZ: number } | null> {
  try {
    const triangles = await Forma.geometry.getTriangles({ path });
    if (!triangles || triangles.length < 3) return null;

    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 2; i < triangles.length; i += 3) {
      const z = triangles[i];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (maxZ - minZ <= 0) return null;
    return { minZ, maxZ };
  } catch {
    return null;
  }
}

export async function getBuildingFootprints(): Promise<BuildingFootprint[]> {
  const { designPaths, contextPaths } = await classifyElements();
  const buildings: BuildingFootprint[] = [];

  const allPaths = [
    ...designPaths.map((p) => ({ path: p, isDesign: true })),
    ...contextPaths.map((p) => ({ path: p, isDesign: false })),
  ];

  const results = await Promise.allSettled(
    allPaths.map(async ({ path, isDesign }) => {
      const footprint = await getFootprintForPath(path);
      if (!footprint) return null;

      const extents = await getVerticalExtents(path);
      if (!extents) return null;

      const height = extents.maxZ - extents.minZ;
      if (height < MIN_BUILDING_HEIGHT) return null;

      const area = Math.abs(signedRingArea(footprint));
      if (area > MAX_FOOTPRINT_AREA) return null;

      return {
        path,
        footprint,
        height,
        topZ: extents.maxZ,
        baseZ: extents.minZ,
        isDesign,
      } satisfies BuildingFootprint;
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      buildings.push(result.value);
    }
  }

  return buildings;
}
