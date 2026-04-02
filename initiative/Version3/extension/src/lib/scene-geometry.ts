import { Forma } from "forma-embedded-view-sdk/auto";
import { classifyElements } from "./element-classifier";

export type Vec3 = [number, number, number];
export type Triangle3D = [Vec3, Vec3, Vec3];

export type AABB = {
  min: Vec3;
  max: Vec3;
};

export type BuildingMesh = {
  path: string;
  triangles: Triangle3D[];
  aabb: AABB;
  isDesign: boolean;
  footprint: [number, number][];
};

export type Bounds2D = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SceneGeometry = {
  buildings: BuildingMesh[];
  terrainTriangles: Triangle3D[];
  bounds: Bounds2D;
};

const MIN_BUILDING_HEIGHT = 2.5;
const MAX_FOOTPRINT_AREA = 50_000;

/**
 * Parses a flat Float32Array of vertex positions into Triangle3D[].
 * Forma returns [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...] — 9 floats per triangle.
 */
export function parseTriangles(data: Float32Array): Triangle3D[] {
  const triangles: Triangle3D[] = [];
  for (let i = 0; i + 8 < data.length; i += 9) {
    triangles.push([
      [data[i], data[i + 1], data[i + 2]],
      [data[i + 3], data[i + 4], data[i + 5]],
      [data[i + 6], data[i + 7], data[i + 8]],
    ]);
  }
  return triangles;
}

export function computeAABB(triangles: Triangle3D[]): AABB {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const tri of triangles) {
    for (const v of tri) {
      for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    }
  }
  return { min, max };
}

function computeFootprintArea(footprint: [number, number][]): number {
  let area = 0;
  const n = footprint.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += footprint[i][0] * footprint[j][1];
    area -= footprint[j][0] * footprint[i][1];
  }
  return Math.abs(area) / 2;
}

async function getFootprintForPath(path: string): Promise<[number, number][] | null> {
  try {
    const fp = await Forma.geometry.getFootprint({ path });
    if (!fp || fp.type !== "Polygon" || fp.coordinates.length < 3) return null;
    return fp.coordinates.map(([x, y]) => [x, y] as [number, number]);
  } catch {
    return null;
  }
}

async function getTrianglesForPath(path: string): Promise<Float32Array | null> {
  try {
    const data = await Forma.geometry.getTriangles({ path });
    if (!data || data.length < 9) return null;
    return data;
  } catch {
    return null;
  }
}

type ExtractedElement =
  | { type: "building"; building: BuildingMesh }
  | { type: "terrain"; triangles: Triangle3D[] }
  | null;

async function processElement(
  path: string,
  isDesign: boolean,
): Promise<ExtractedElement> {
  const data = await getTrianglesForPath(path);
  if (!data) return null;

  const triangles = parseTriangles(data);
  if (triangles.length === 0) return null;

  const aabb = computeAABB(triangles);
  const height = aabb.max[2] - aabb.min[2];

  if (height < MIN_BUILDING_HEIGHT) {
    return { type: "terrain", triangles };
  }

  const footprint = await getFootprintForPath(path);
  if (!footprint) return null;

  const area = computeFootprintArea(footprint);
  if (area > MAX_FOOTPRINT_AREA) {
    return { type: "terrain", triangles };
  }

  return {
    type: "building",
    building: { path, triangles, aabb, isDesign, footprint },
  };
}

/**
 * Extracts all building meshes and terrain triangles from the Forma scene.
 *
 * Buildings are auto-classified as Design (has floor representations)
 * or Context (no floors) using the element classifier.
 */
export async function extractSceneGeometry(
  onProgress?: (msg: string) => void,
): Promise<SceneGeometry> {
  onProgress?.("Fetching element tree and classifying buildings...");
  const { designPaths } = await classifyElements();
  const designSet = new Set(designPaths);

  const allEntryPaths = await getAllPaths();
  onProgress?.(`Processing ${allEntryPaths.length} tree elements...`);

  const results = await Promise.allSettled(
    allEntryPaths.map((path) => {
      const isDesign = designSet.has(path);
      return processElement(path, isDesign);
    }),
  );

  const buildings: BuildingMesh[] = [];
  const terrainTriangles: Triangle3D[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    if (result.value.type === "building") {
      buildings.push(result.value.building);
    } else {
      terrainTriangles.push(...result.value.triangles);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const b of buildings) {
    if (b.aabb.min[0] < minX) minX = b.aabb.min[0];
    if (b.aabb.min[1] < minY) minY = b.aabb.min[1];
    if (b.aabb.max[0] > maxX) maxX = b.aabb.max[0];
    if (b.aabb.max[1] > maxY) maxY = b.aabb.max[1];
  }

  for (const tri of terrainTriangles) {
    for (const v of tri) {
      if (v[0] < minX) minX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] > maxY) maxY = v[1];
    }
  }

  const expand = 200;
  minX -= expand;
  minY -= expand;
  maxX += expand;
  maxY += expand;

  const dCount = buildings.filter((b) => b.isDesign).length;
  const cCount = buildings.filter((b) => !b.isDesign).length;
  onProgress?.(
    `Extracted ${buildings.length} buildings (${dCount} design, ${cCount} context).`,
  );

  return {
    buildings,
    terrainTriangles,
    bounds: { minX, minY, maxX, maxY },
  };
}

async function getAllPaths(): Promise<string[]> {
  const rootUrn = (await Forma.proposal.getRootUrn()) as any;
  const { elements } = await Forma.elements.get({ urn: rootUrn, recursive: true });
  const elMap = elements as Record<string, any>;

  const paths: string[] = [];
  function walk(urn: string, path: string) {
    const el = elMap[urn];
    if (!el) return;
    paths.push(path);
    if (el.children) {
      for (const child of el.children) {
        walk(child.urn, `${path}/${child.key}`);
      }
    }
  }
  walk(rootUrn, "root");
  return paths;
}
