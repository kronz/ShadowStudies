import type { Vec3, BuildingMesh } from "./scene-geometry";

export type BVHNode = {
  aabbMin: Vec3;
  aabbMax: Vec3;
  /** Index into nodes array for left child, or -1 for leaf nodes. */
  leftChild: number;
  /** Index into nodes array for right child, or -1 for leaf nodes. */
  rightChild: number;
  /** Start index into buildingIndices array. */
  buildingStart: number;
  /** Number of buildings in this leaf (0 for internal nodes). */
  buildingCount: number;
};

/**
 * Flat-array BVH over building AABBs. Designed for efficient
 * structured-clone serialization to Web Workers.
 */
export type FlatBVH = {
  nodes: BVHNode[];
  /** Indirect index array mapping leaf ranges back to the buildings array. */
  buildingIndices: number[];
};

/**
 * Builds a binary BVH over the array of BuildingMesh objects.
 * Uses median-split on the longest axis. Leaf nodes contain 1-4 buildings.
 */
export function buildBVH(buildings: BuildingMesh[]): FlatBVH {
  const indices = buildings.map((_, i) => i);
  const nodes: BVHNode[] = [];
  const buildingIndices: number[] = [];

  function boundsOfRange(idxs: number[]): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const i of idxs) {
      const aabb = buildings[i].aabb;
      for (let k = 0; k < 3; k++) {
        if (aabb.min[k] < min[k]) min[k] = aabb.min[k];
        if (aabb.max[k] > max[k]) max[k] = aabb.max[k];
      }
    }
    return { min, max };
  }

  function buildNode(idxs: number[]): number {
    const { min, max } = boundsOfRange(idxs);

    if (idxs.length <= 4) {
      const start = buildingIndices.length;
      for (const i of idxs) buildingIndices.push(i);
      const nodeIdx = nodes.length;
      nodes.push({
        aabbMin: min,
        aabbMax: max,
        leftChild: -1,
        rightChild: -1,
        buildingStart: start,
        buildingCount: idxs.length,
      });
      return nodeIdx;
    }

    // Find longest axis
    const extents = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    let axis = 0;
    if (extents[1] > extents[axis]) axis = 1;
    if (extents[2] > extents[axis]) axis = 2;

    // Sort by centroid on that axis, split at median
    idxs.sort((a, b) => {
      const ca = (buildings[a].aabb.min[axis] + buildings[a].aabb.max[axis]) / 2;
      const cb = (buildings[b].aabb.min[axis] + buildings[b].aabb.max[axis]) / 2;
      return ca - cb;
    });

    const mid = Math.floor(idxs.length / 2);
    const leftIdxs = idxs.slice(0, mid);
    const rightIdxs = idxs.slice(mid);

    const leftChild = buildNode(leftIdxs);
    const rightChild = buildNode(rightIdxs);

    const nodeIdx = nodes.length;
    nodes.push({
      aabbMin: min,
      aabbMax: max,
      leftChild,
      rightChild,
      buildingStart: 0,
      buildingCount: 0,
    });
    return nodeIdx;
  }

  if (buildings.length > 0) {
    buildNode(indices);
  }

  return { nodes, buildingIndices };
}

/**
 * Traverses the BVH and calls `callback(buildingIndex)` for every
 * building whose parent AABB is intersected by the ray.
 */
export function traverseBVH(
  bvh: FlatBVH,
  origin: Vec3,
  invDir: Vec3,
  callback: (buildingIndex: number) => void,
): void {
  if (bvh.nodes.length === 0) return;

  const stack: number[] = [bvh.nodes.length - 1];
  while (stack.length > 0) {
    const nodeIdx = stack.pop()!;
    const node = bvh.nodes[nodeIdx];

    if (!bvhAABBIntersect(origin, invDir, node.aabbMin, node.aabbMax)) continue;

    if (node.buildingCount > 0) {
      for (let i = 0; i < node.buildingCount; i++) {
        callback(bvh.buildingIndices[node.buildingStart + i]);
      }
    } else {
      if (node.leftChild >= 0) stack.push(node.leftChild);
      if (node.rightChild >= 0) stack.push(node.rightChild);
    }
  }
}

function bvhAABBIntersect(
  origin: Vec3,
  invDir: Vec3,
  aabbMin: Vec3,
  aabbMax: Vec3,
): boolean {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    const t1 = (aabbMin[i] - origin[i]) * invDir[i];
    const t2 = (aabbMax[i] - origin[i]) * invDir[i];
    const tNear = Math.min(t1, t2);
    const tFar = Math.max(t1, t2);
    tmin = Math.max(tmin, tNear);
    tmax = Math.min(tmax, tFar);
  }

  return tmax >= Math.max(tmin, 0);
}
