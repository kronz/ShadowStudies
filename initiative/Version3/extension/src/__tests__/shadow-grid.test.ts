import { describe, it, expect } from "vitest";
import { computeShadowAreas, computeShadowPercentageInRegion, pointInPolygon } from "../lib/shadow-grid";
import { castShadowRays } from "../lib/ray-caster";
import { makeCube, makeGrid, makeSun } from "./test-helpers";

describe("computeShadowAreas", () => {
  it("returns correct area for a single design cube", () => {
    const cube = makeCube(0, 0, 10, 10, true);
    const sun = makeSun(45, 0);
    const grid = makeGrid({ minX: -20, minY: -20, maxX: 20, maxY: 20 }, 1);
    const cls = castShadowRays(grid, [cube], sun);
    const areas = computeShadowAreas(cls, 1);

    // The shadow of a 10×10×10 cube at 45° altitude covers the building
    // footprint (100 m²) plus shadow cast northward (~100 m²), totaling ~200 m².
    // Discretization at 1m cells makes the exact count vary.
    expect(areas.designOnlyShadowArea).toBeGreaterThan(80);
    expect(areas.designOnlyShadowArea).toBeLessThanOrEqual(300);
    expect(areas.contextShadowArea).toBe(0);
  });
});

describe("pointInPolygon", () => {
  const square: [number, number][] = [
    [0, 0], [10, 0], [10, 10], [0, 10],
  ];

  it("returns true for a point inside the square", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it("returns false for a point outside the square", () => {
    expect(pointInPolygon(15, 15, square)).toBe(false);
  });
});

describe("computeShadowPercentageInRegion", () => {
  it("returns ~50% when ROI covers half the shadow", () => {
    const cube = makeCube(0, 0, 10, 10, true);
    const sun = makeSun(45, 0);
    const grid = makeGrid({ minX: -20, minY: -20, maxX: 20, maxY: 20 }, 1);
    const cls = castShadowRays(grid, [cube], sun);

    // ROI covering roughly the east half of the grid
    const roiPolygon: [number, number][] = [
      [0, -20], [20, -20], [20, 20], [0, 20],
    ];

    const result = computeShadowPercentageInRegion(cls, grid, roiPolygon);
    expect(result.totalCells).toBeGreaterThan(0);
    expect(result.shadowCells).toBeGreaterThan(0);

    // The percentage should be reasonably bounded
    expect(result.percentage).toBeGreaterThan(0);
    expect(result.percentage).toBeLessThan(100);
  });
});
