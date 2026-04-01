import { describe, it, expect } from "vitest";
import { castShadowRays, sunDirectionVector, rayTriangleIntersect, ShadowClass } from "../lib/ray-caster";
import { makeCube, makeGrid, makeSun } from "./test-helpers";

describe("sunDirectionVector", () => {
  it("points straight up when sun is at zenith", () => {
    const sun = makeSun(90, 0);
    const dir = sunDirectionVector(sun);
    expect(dir[2]).toBeCloseTo(1, 5);
    expect(Math.abs(dir[0])).toBeLessThan(1e-6);
    expect(Math.abs(dir[1])).toBeLessThan(1e-6);
  });

  it("has zero z component when sun is on the horizon", () => {
    const sun = makeSun(0, 0);
    const dir = sunDirectionVector(sun);
    expect(Math.abs(dir[2])).toBeLessThan(1e-6);
  });
});

describe("rayTriangleIntersect", () => {
  it("hits a horizontal triangle from below", () => {
    const origin: [number, number, number] = [0.5, 0.5, -1];
    const dir: [number, number, number] = [0, 0, 1];
    const v0: [number, number, number] = [0, 0, 0];
    const v1: [number, number, number] = [1, 0, 0];
    const v2: [number, number, number] = [0, 1, 0];
    const t = rayTriangleIntersect(origin, dir, v0, v1, v2);
    expect(t).toBeCloseTo(1, 5);
  });

  it("misses a triangle that is off to the side", () => {
    const origin: [number, number, number] = [10, 10, -1];
    const dir: [number, number, number] = [0, 0, 1];
    const v0: [number, number, number] = [0, 0, 0];
    const v1: [number, number, number] = [1, 0, 0];
    const v2: [number, number, number] = [0, 1, 0];
    const t = rayTriangleIntersect(origin, dir, v0, v1, v2);
    expect(t).toBe(-1);
  });
});

describe("castShadowRays", () => {
  it("classifies cells in shadow of a design cube", () => {
    const cube = makeCube(0, 0, 10, 10, true);
    // Sun at 45° altitude, due south (azimuth = 0)
    // Shadow falls northward (+y direction) at length equal to building height (10m)
    const sun = makeSun(45, 0);

    const grid = makeGrid({ minX: -20, minY: -20, maxX: 20, maxY: 20 }, 1);
    const cls = castShadowRays(grid, [cube], sun);

    // Cell at (0, 10) should be in shadow (north of building)
    const col = 20; // (0 - (-20)) / 1 = 20
    const row = 30; // (10 - (-20)) / 1 = 30, then +0.5 offset
    const idx = row * grid.cols + col;
    expect(cls[idx]).toBe(ShadowClass.DesignShadow);

    // Cell well south of the building should be sunlit
    const southRow = 5;
    const southIdx = southRow * grid.cols + col;
    expect(cls[southIdx]).toBe(ShadowClass.Sunlit);
  });

  it("returns all Sunlit when sun is below horizon", () => {
    const cube = makeCube(0, 0, 10, 10, true);
    const sun = makeSun(-5, 0);
    const grid = makeGrid({ minX: -20, minY: -20, maxX: 20, maxY: 20 }, 2);
    const cls = castShadowRays(grid, [cube], sun);

    for (let i = 0; i < cls.length; i++) {
      expect(cls[i]).toBe(ShadowClass.Sunlit);
    }
  });

  it("distinguishes design vs context shadows", () => {
    const contextCube = makeCube(-15, 0, 10, 10, false);
    const designCube = makeCube(15, 0, 10, 10, true);
    const sun = makeSun(45, 0);
    const grid = makeGrid({ minX: -30, minY: -20, maxX: 30, maxY: 30 }, 1);
    const cls = castShadowRays(grid, [contextCube, designCube], sun);

    // North of context cube
    const ctxCol = Math.floor((-15 - (-30)) / 1);
    const ctxRow = Math.floor((10 - (-20)) / 1);
    const ctxIdx = ctxRow * grid.cols + ctxCol;
    expect(cls[ctxIdx]).toBe(ShadowClass.ContextShadow);

    // North of design cube
    const desCol = Math.floor((15 - (-30)) / 1);
    const desRow = Math.floor((10 - (-20)) / 1);
    const desIdx = desRow * grid.cols + desCol;
    expect(cls[desIdx]).toBe(ShadowClass.DesignShadow);
  });
});
