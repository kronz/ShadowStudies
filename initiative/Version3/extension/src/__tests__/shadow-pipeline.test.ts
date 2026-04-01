import { describe, it, expect } from "vitest";
import { castShadowRays } from "../lib/ray-caster";
import { computeShadowAreas } from "../lib/shadow-grid";
import { findBoundaryCells, generateSubCells } from "../lib/analysis-grid";
import { buildBVH } from "../lib/bvh";
import { makeCube, makeGrid, makeSun } from "./test-helpers";

describe("shadow pipeline integration", () => {
  it("single cube with refinement produces valid results", () => {
    const cube = makeCube(0, 0, 10, 10, true);
    const sun = makeSun(45, 0);
    const grid = makeGrid({ minX: -20, minY: -20, maxX: 20, maxY: 20 }, 2);

    const cls = castShadowRays(grid, [cube], sun);
    const boundaries = findBoundaryCells(cls, grid.cols, grid.rows);
    expect(boundaries.size).toBeGreaterThan(0);

    const { subGrid, parentMap } = generateSubCells(grid, boundaries);
    expect(subGrid.cells.length).toBe(boundaries.size * 4);
    expect(parentMap.length).toBe(subGrid.cells.length);

    const refinedCls = castShadowRays(subGrid, [cube], sun);
    const refinedCellArea = subGrid.cellSize * subGrid.cellSize;

    const areas = computeShadowAreas(cls, grid.cellSize * grid.cellSize, {
      refinedClassifications: refinedCls,
      refinedCellArea,
      refinedParentMap: parentMap,
    });

    expect(areas.designOnlyShadowArea).toBeGreaterThan(0);
    expect(areas.totalShadowArea).toBeGreaterThan(0);
  });

  it("BVH produces same results as linear scan", () => {
    const buildings = [
      makeCube(-15, 0, 10, 10, false),
      makeCube(0, 0, 10, 10, true),
      makeCube(15, 0, 10, 10, true),
    ];
    const sun = makeSun(45, 0);
    const grid = makeGrid({ minX: -30, minY: -20, maxX: 30, maxY: 30 }, 2);

    const withoutBVH = castShadowRays(grid, buildings, sun);
    const bvh = buildBVH(buildings);
    const withBVH = castShadowRays(grid, buildings, sun, bvh);

    for (let i = 0; i < withoutBVH.length; i++) {
      expect(withBVH[i]).toBe(withoutBVH[i]);
    }
  });
});
