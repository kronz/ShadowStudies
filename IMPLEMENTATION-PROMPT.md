# Shadow Study Extension V3 — Implementation Prompt

You are working on a Forma embedded extension that produces colored shadow study deliverables for municipal design review submittals. The extension lives in `initiative/Version3/extension/`. It uses Preact, TypeScript, Vite, and the `forma-embedded-view-sdk`.

The shadow engine works by ray-casting (Moller-Trumbore) against building mesh triangles extracted from Forma, sampled on a terrain-draped 2D analysis grid. Each grid cell is classified as `Sunlit`, `ContextShadow`, or `DesignShadow`.

Below are seven improvements to implement. Tackle them in order — each builds on a stable foundation from the previous ones.

---

## 1. Adaptive Grid Refinement Near Shadow Boundaries

**Problem:** At the default 2m cell size, shadow edges are visibly jagged. Shrinking the entire grid to 0.5m is a 16× cost increase.

**Goal:** Subdivide only the cells that straddle a shadow boundary (i.e., their classification differs from at least one neighbor). After the initial pass at the base cell size, identify boundary cells and subdivide them into 4 sub-cells (half the cell size). Re-cast rays for the sub-cells only. One level of subdivision is sufficient for now.

**Where to change:**
- `src/lib/shadow-pipeline.ts` — add a refinement pass after `castShadowRays` in both `computeShadowGrid` and `computeShadowGridAsync`
- `src/lib/analysis-grid.ts` — may need a function to generate sub-cells for specific indices
- `src/lib/shadow-grid.ts` — `computeShadowAreas` needs to account for cells with different sizes (base vs. refined)

**Constraints:**
- Don't change the base grid resolution — refinement is additive
- Keep the `ShadowGridResult` type backward-compatible so rendering and ROI analysis still work
- The Web Worker path (`computeShadowGridAsync`) should also support refinement

---

## 2. Multi-Sample Anti-Aliasing at Shadow Boundaries

**Problem:** Each cell gets a single ray from its center. Cells on shadow boundaries are classified as entirely in or out, producing hard stair-step edges.

**Goal:** For boundary cells (identified in step 1), cast 4 rays per cell (e.g., at ±¼ cell offsets from center) and compute a fractional shadow value (0.0–1.0). Store this as a coverage fraction alongside the discrete classification.

**Where to change:**
- `src/lib/ray-caster.ts` — add a multi-sample variant of `castShadowRays` for boundary cells
- `src/lib/grid-renderer.ts` — use the coverage fraction to modulate alpha when building shadow meshes (e.g., 60% coverage → 60% of the shadow color's alpha)
- `src/lib/shadow-export.ts` — `renderPlanViewDiagram` should also respect fractional coverage
- `src/lib/butterfly-diagram.ts` — same for butterfly rendering

**Constraints:**
- Only multi-sample boundary cells, not the entire grid
- The `ShadowGridResult` type may need an optional `coverage: Float32Array` field (1.0 for non-boundary cells, fractional for boundary cells)

---

## 3. Build a BVH Over Buildings

**Problem:** Every grid cell currently tests every building's AABB. In dense urban scenes (50+ buildings), this is O(cells × buildings). The AABB pre-filter helps, but there's no spatial index across buildings.

**Goal:** Build a bounding volume hierarchy (BVH) over the array of `BuildingMesh` objects at scene preparation time. During ray casting, traverse the BVH to skip entire subtrees of buildings whose combined AABB is missed by the ray.

**Where to change:**
- Create `src/lib/bvh.ts` — a simple binary BVH over AABBs (median-split on the longest axis is fine)
- `src/lib/shadow-pipeline.ts` — build the BVH in `prepareScene` and store it in `SceneCache`
- `src/lib/ray-caster.ts` — replace the linear building loop in `castShadowRays` with BVH traversal
- `src/lib/shadow-worker.ts` — the worker also needs BVH access (serialize the BVH structure in the postMessage payload)

**Constraints:**
- Keep the existing `BuildingMesh` and `AABB` types unchanged
- The BVH should be a flat array structure (not recursive objects) for efficient Web Worker serialization
- Leaf nodes should contain 1–4 buildings

---

## 4. Replace the 200ms Sleep with Retry-Based Capture

**Problem:** The export pipeline in `shadow-export.ts` adds transient meshes to the scene, waits a hardcoded 200ms, then captures a screenshot. If the renderer hasn't finished, the capture misses the meshes.

**Goal:** Replace the `setTimeout(r, 200)` with a retry loop that:
1. Captures a frame
2. Samples a few pixels where shadow meshes should be visible (based on known shadow cell positions projected to screen space, or simply by checking if the capture differs from a baseline capture without meshes)
3. If the meshes aren't visible, waits 100ms and retries (up to 5 attempts)
4. Falls back to the current behavior if all retries fail

A simpler acceptable alternative: use an exponential backoff (100ms, 200ms, 400ms) with a maximum of 3 attempts, capturing at each step and comparing to detect mesh presence.

**Where to change:**
- `src/lib/shadow-export.ts` — `captureFrameWithShadows` function, replace the `await new Promise((r) => setTimeout(r, 200))` line

**Constraints:**
- Don't add new SDK dependencies
- Keep the total worst-case delay under 2 seconds per frame

---

## 5. Wire Preview to Current Sun Time Instead of Hardcoded Noon

**Problem:** `shadow-preview.ts` always computes shadows at noon regardless of the Forma viewport's current sun time. The ROI analysis metrics shown in the panel reflect noon, not the time the user is looking at or will export.

**Goal:** Use the current Forma sun date/time (`Forma.sun.getDate()`) as the default for the preview computation instead of constructing a noon DateTime. Optionally allow the user to override via the existing date/time selectors.

**Where to change:**
- `src/lib/shadow-preview.ts` — `renderShadowPreview` should call `Forma.sun.getDate()` and use that date directly instead of building a noon DateTime from month/day
- `src/components/ShadowPreviewButton.tsx` — the props may need adjustment if month/day are no longer required for the preview (they're still needed for export)
- `src/components/ShadowROIAnalysis.tsx` — the displayed metrics should note what time they reflect

**Constraints:**
- Export behavior should not change — the export still uses user-configured dates/times
- The preview button label or status text should show the time being used (e.g., "Preview at 14:30")

---

## 6. Add a Third Shadow Class for Planned Development

**Problem:** The meeting notes describe a three-layer system used in real submittals: existing shadows, planned-development shadows (approved but unbuilt projects), and proposed-development shadows (the project seeking approval). The extension only supports two classes.

**Goal:** Add a `PlannedShadow` classification (value `3` in the `ShadowClass` enum). Allow the user to tag some buildings as "planned" in addition to "design" and "context." Planned shadows should render in a third user-chosen color.

**Where to change:**
- `src/lib/ray-caster.ts` — add `PlannedShadow = 3` to the `ShadowClass` enum; update `castShadowRays` to check `building.isPlanned`
- `src/lib/scene-geometry.ts` — add `isPlanned: boolean` to `BuildingMesh`; update `extractSceneGeometry` and `extractDesignBuildings` to accept planned paths
- `src/lib/shadow-grid.ts` — update `ShadowAreas` and `computeShadowAreas` to track planned shadow area; update `ROIResult` and `computeShadowPercentageInRegion`
- `src/lib/grid-renderer.ts` — `buildShadowMeshes` should handle the third class
- `src/lib/shadow-export.ts` — `ShadowExportOptions` needs a planned shadow color; `renderPlanViewDiagram` should render it
- `src/lib/butterfly-diagram.ts` — same
- `src/components/ColorControls.tsx` — add a third shadow color picker row for "Planned shadows"
- `src/components/DesignBuildingSelector.tsx` — add a second selection list for planned buildings (or a toggle to switch a selection between design/planned)
- `src/app.tsx` — wire the new planned paths and color through to all consumers
- `src/components/ShadowPreviewButton.tsx` — display planned shadow area
- `src/components/ShadowROIAnalysis.tsx` — display planned shadow percentage

**Priority order for shadow classification when a cell is hit by multiple building types:** Design > Planned > Context (design shadow takes highest priority since it represents the net-new impact of the project seeking approval).

**Constraints:**
- Backward-compatible: if no planned buildings are selected, behavior is identical to today
- The third class is optional in all UI — don't force users to tag planned buildings

---

## 7. Add Regression Tests for Shadow Geometry

**Problem:** There are no automated tests. The extension produces quantitative regulatory deliverables where incorrect numbers could have legal/financial consequences.

**Goal:** Add a test suite that validates the shadow computation pipeline against known-good scenarios with calculable expected results.

**Test cases to implement:**
1. **Single cube, known sun angle:** A 10m × 10m × 10m cube at the origin. Sun at 45° altitude, due south (azimuth = 0). Expected shadow length = 10m due north. Verify that grid cells in the expected shadow zone are classified as `DesignShadow` and cells outside are `Sunlit`.
2. **Two buildings, design vs. context:** One context cube and one design cube side by side. Verify that shadows are classified correctly per building type, and that the design shadow doesn't overwrite context shadow in non-overlapping regions.
3. **Shadow area calculation:** For the single cube case, compare computed shadow area against the analytical area (10m × 10m = 100 m² shadow at 45° on flat ground). The grid-based approximation should be within 10% of the exact value at 1m cell size.
4. **Sun below horizon:** Verify all cells return `Sunlit` when sun altitude ≤ 0.
5. **ROI polygon:** Place a known polygon over part of the shadow. Verify `computeShadowPercentageInRegion` returns the expected percentage within tolerance.

**Where to create:**
- `src/__tests__/shadow-pipeline.test.ts`
- `src/__tests__/ray-caster.test.ts`
- `src/__tests__/shadow-grid.test.ts`

**Setup:**
- Add `vitest` as a dev dependency (it's already compatible with the Vite build setup)
- Add a `"test"` script to `package.json`
- Tests should construct `BuildingMesh`, `AnalysisGrid`, and `SunPosition` objects directly — no Forma SDK calls (those are integration tests for later)

**Constraints:**
- Tests must not import or call anything from `forma-embedded-view-sdk` — mock-free unit tests only
- Use analytical geometry to compute expected values, not hardcoded magic numbers
