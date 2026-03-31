# Shadow Study Extension V2 - Context & Memory

## Initiative Overview
- **Status**: Active
- **Timeline**: 2026-03-16 - TBD
- **Owner**: Zach Kron / Robin Franke
- **Last Updated**: 2026-03-16 22:00

## Core Objective
Build a new version of the Forma shadow study extension that enables firms to produce differentiated shadow diagrams required for municipal design review submittals. The core gap is shadow color control — the existing extension colors buildings and terrain but cannot color shadows themselves. This directly blocks Arcadis (and similar firms) from producing Canadian and US submittal deliverables.

## Architecture: Approach C — Computed Shadow Geometry

As of 2026-03-16, the extension uses **vector-based shadow computation** (Approach C) rather than pixel differencing or sun analysis grids. Shadows are computed as 2D polygons from building footprints, heights, and sun position, then rendered as colored meshes in the 3D scene or drawn onto 2D canvas for export.

### Data Flow

```
User triggers Preview or Export
  → getBuildingFootprints()
    → classifyElements() → design/context element paths
    → For each building path:
      → Forma.geometry.getFootprint() → 2D polygon
      → Forma.geometry.getTriangles() → derive height from max z vertex
  → getSunPositionForProject(date)
    → Forma.project.getGeoLocation() → [lat, lon]
    → suncalc.getPosition(date, lat, lon) → azimuth, altitude
  → For each building:
    → projectBuildingShadow(footprint, height, sun) → shadow polygon
      (Minkowski sum of footprint + shadow line segment via quad union)
  → contextShadow = union of all context building shadows
  → designOnlyShadow = union(design shadows) MINUS contextShadow
  → totalShadow = union of all shadows
  → Area metrics via shoelace formula

For Preview:
  → triangulate polygons (earcut) → addMesh() to Forma scene
  → Display area metrics in UI

For Export:
  → addMesh() → Forma.camera.capture() → removeMesh()
  → Package captures into ZIP

For Butterfly Diagram:
  → Compute shadow scene at each time step
  → Render all steps with graduated opacity onto 2D canvas
  → Export as single PNG
```

### Module Map

| Module | Purpose |
|---|---|
| `src/lib/building-geometry.ts` | Extract footprint polygons + heights from Forma SDK |
| `src/lib/sun-position.ts` | Sun azimuth/altitude from suncalc + Forma geolocation |
| `src/lib/shadow-geometry.ts` | Project footprint → shadow polygon (Minkowski sum via quads) |
| `src/lib/polygon-ops.ts` | Polygon boolean ops (polyclip-ts), area (shoelace), triangulation (earcut) |
| `src/lib/shadow-pipeline.ts` | Orchestrator: buildings + sun → classified shadow polygons + areas |
| `src/lib/shadow-preview.ts` | Render shadow meshes in Forma 3D scene for live preview |
| `src/lib/shadow-export.ts` | Capture frames with transient shadow meshes; plan-view 2D rendering |
| `src/lib/butterfly-diagram.ts` | Multi-timestep shadow computation + graduated-opacity 2D rendering |
| `src/lib/element-classifier.ts` | Design vs. context element classification (functionId-based) |
| `src/lib/shadow-diff.ts` | **LEGACY** — pixel-differencing approach, retained for reference |

### Shadow Projection Math

suncalc azimuth convention: 0 = south, π/2 = west, π = north, −π/2 = east

In Forma local coordinates (x = east, y = north):
- Sun direction on ground: `(-sin(azimuth), -cos(azimuth))`
- Shadow direction (opposite): `(sin(azimuth), cos(azimuth))`
- Shadow offset for height h at altitude α: `length = h / tan(α)`
  - `dx = length * sin(azimuth)`
  - `dy = length * cos(azimuth)`

Shadow polygon = Minkowski sum of building footprint with shadow line segment. Computed by unioning the original footprint, the translated footprint, and connecting quads for each edge.

### Known Limitations (V1)

- **Flat ground assumption**: Shadows project onto a flat plane (z = ground elevation). Sloped terrain shortens/elongates shadows. `Forma.terrain.getElevationAt()` is available for Phase 2 terrain correction. The `computeShadowOffset()` function takes a `groundElevation` parameter to make this upgrade path straightforward.
- **No roof geometry**: Buildings are treated as prismatic extrusions (flat roof at max z). Pitched roofs, setbacks, and terracing are not modeled.
- **No self-shadowing**: A tall building's shadow on a shorter neighboring building is projected to the ground plane, not onto the shorter building's face.

## Key Decisions & Rationale

- **Approach C: Computed shadow geometry** (2026-03-16, replaces pixel differencing)
  - *Decision*: Compute shadow polygons from building footprints + sun position using vector math and polygon boolean operations, replacing the three-capture pixel differencing approach.
  - *Rationale*: Pixel differencing was brittle (threshold tuning, noise sensitivity) and couldn't produce measurable geometry or butterfly diagrams. The geometry approach yields precise polygons that can be measured (area), composited (butterfly), and rendered at arbitrary resolution.
  - *Trade-offs*: Flat ground assumption (Phase 2 fix); no roof geometry modeling; requires polygon boolean library. Performance is better than pixel differencing for most scenes (no multiple captures needed).

- **Shadow color via three-capture differencing with building mask** (2026-03-16, superseded by Approach C)
  - *Decision*: LEGACY — retained in `shadow-diff.ts` for reference.

- **Sun analysis overlay for live preview** (2026-03-16, superseded by Approach C)
  - *Decision*: LEGACY — replaced by geometry-based preview that is faster (no server-side analysis) and produces crisp polygon edges.

- **Four independent color controls** (2026-03-16)
  - *Decision*: Context buildings, design buildings, context shadows, design shadows as four separate color pickers
  - *Rationale*: Firms need to differentiate existing vs. proposed development and their respective shadows for regulatory submittals
  - *Trade-offs*: More complex UI vs. single global color; requires element classification logic

- **3x3 matrix output as primary mode** (2026-03-16)
  - *Decision*: Default export produces 3 times of day x 3 times of year grid (the standard deliverable format observed across Seattle EDG and Canadian submittals)
  - *Rationale*: Nearly all reviewed real-world submittals follow this format
  - *Trade-offs*: Custom single-date mode retained as secondary option

- **Butterfly diagrams as standalone export** (2026-03-16)
  - *Decision*: Butterfly diagrams are a separate export (single PNG) computed from multiple time steps with graduated opacity, not integrated into the matrix export.
  - *Rationale*: Butterfly diagrams serve a different analytical purpose (showing shadow sweep over time) than the point-in-time matrix images.

## Current Status

**Last Updated**: 2026-03-16 22:00

- **Progress**: Approach C fully implemented. All core modules built: building geometry extraction, sun position computation, shadow projection, polygon boolean operations, area calculation, live preview, export pipeline, and butterfly diagram generation. TypeScript typecheck and Vite build pass cleanly.
- **Recent Changes**: Replaced pixel-differencing and sun-analysis approaches with computed shadow geometry pipeline. Added suncalc, polyclip-ts, and earcut dependencies. Added area metrics display in preview. Added butterfly diagram export.
- **Next Milestone**: Integration testing in a live Forma project to validate:
  1. `Forma.geometry.getFootprint()` returns usable polygon data for buildings
  2. `Forma.geometry.getTriangles()` height derivation is correct
  3. `Forma.project.getGeoLocation()` returns correct lat/lon
  4. Shadow meshes render correctly in the viewport
  5. Butterfly diagram produces clean, readable output
- **Confidence Level**: Medium-High — architecture is sound and code compiles, but the end-to-end pipeline hasn't been tested in a live Forma scene yet. The main risks are: (a) footprint data quality from the SDK, (b) coordinate system alignment between suncalc and Forma, (c) polygon boolean edge cases with complex building footprints.

## Blockers & Open Questions

### Open Questions
- **Footprint data quality** (2026-03-16)
  - *Context*: `Forma.geometry.getFootprint()` may return LineString instead of Polygon for some elements, or may not return footprints for all building types.
  - *Impact*: Buildings without valid footprints will be skipped in shadow computation.
  - *Status*: Needs live testing.

- **Terrain shadow correction** (2026-03-16)
  - *Context*: V1 assumes flat ground. Phase 2 should sample `Forma.terrain.getElevationAt()` along the shadow direction for terrain-accurate projection.
  - *Impact*: Shadow lengths are incorrect on sloped terrain.
  - *Status*: Deferred to Phase 2. `computeShadowOffset()` already takes a `groundElevation` parameter to support this.

- **Shadow color API surface** (2026-03-16)
  - *Context*: Whether the underlying rendering pipeline exposes shadow color as a parameter.
  - *Impact*: If an API exists, the geometry workaround could be simplified (but geometry approach still needed for area metrics and butterfly diagrams).
  - *Status*: Pending — needs consultation with Forma visualization team.

## Stakeholders & Context

- **Primary Stakeholders**: Arcadis (customer requesting shadow color for Canadian submittals)
- **Key Contributors**: Zach Kron, Robin Franke
- **External Dependencies**: Forma Embedded View SDK team (for potential shadow color API exposure)
- **Related Initiatives**: None currently

## Documents in This Initiative

- [Shadow-Extension-Meeting-Summary-20260316.md](./Shadow-Extension-Meeting-Summary-20260316.md) (2026-03-16)
  - *Purpose*: Meeting notes capturing requirements discussion between Zach and Robin
  - *Status*: Final
  - *Key Insights*: Four color controls needed; 3x3 matrix is standard deliverable; shadow-as-geometry is stretch goal for area calculation

- [Shadow Extension (1).docx](./Shadow%20Extension%20(1).docx) (2026-03-16)
  - *Purpose*: Full meeting transcript with detailed discussion of requirements, examples, and technical constraints
  - *Status*: Final
  - *Key Insights*: Rich discussion of real-world submittal examples (Seattle EDG, Canadian rezoning); color choices are strategic/narrative; net-new shadow polygons needed for area quantification

## Lessons Learned

### Build & Dependency Gotchas
- **`@preact/preset-vite` and `vite` versions are tightly coupled.** Running `npm install` without pinned versions pulled `@preact/preset-vite@2.10.4` + `vite@5.4.21`, which produced a build-time crash: `TypeError: Cannot use 'in' operator to search for 'meta' in undefined`. The working pair is `@preact/preset-vite@2.9.4` + `vite@5.4.11`. These are pinned in `package.json` — do not upgrade either independently.
- **`npm start` script uses Unix syntax** (`DEV_SERVER=1 vite`) that fails in Windows PowerShell. Use `npx vite` directly or `$env:DEV_SERVER="1"; npx vite`.
- **`yarn.lock` was removed** during the fork because we switched to npm. If you see yarn-related instructions in old docs, use npm equivalents.
- **polyclip-ts types**: The library exports `Geom` but not `Ring`, `Poly`, or `MultiPoly` as named types. Our local types in `polygon-ops.ts` match the structural shape. The `union()` function accepts variadic `Geom` arguments — pass all polygons at once rather than accumulating in a loop (avoids type narrowing issues).
- **earcut expects flat coordinate arrays**: `earcut([x1,y1,x2,y2,...], holeIndices, 2)` — not nested arrays.

### Forma SDK Constraints
- **No shadow color API exists.** This was confirmed by code inspection. The SDK exposes `Forma.render.elementColors.set()` for building colors but nothing for shadows.
- **No batch hide/unhide API in SDK 0.87.0.** We initially tried `hideElementsBatch()` / `unhideElementsBatch()` but these methods don't exist. The correct approach is to loop and call `Forma.render.hideElement({ path })` sequentially for each element.
- **`Forma.geometry.getFootprint()` returns `{ type: "LineString" | "Polygon", coordinates: [x, y][] }`**. For buildings, expect `Polygon`. Non-building elements may return `LineString` or `undefined`.
- **`Forma.geometry.getTriangles()` returns a flat `Float32Array`** of xyz vertex coordinates. Height is derived as max(z) - min(z). This assumes the mesh's local coordinate system has z = up.
- **`Forma.project.getGeoLocation()` returns `[latitude, longitude]`** or `undefined`. Required for sun position computation.
- **`Forma.render.addMesh()` geometry needs a brief delay** (~200ms) before `Forma.camera.capture()` to ensure the mesh is rendered. Without this delay, captures may miss newly added meshes.
- **`Forma.camera.capture()` returns a canvas element**, not an image URL. Working with pixel data requires `getContext("2d")` and `getImageData()`.

### Shadow Geometry Architecture
- **Minkowski sum via quad union**: The shadow of a prismatic building is the Minkowski sum of its footprint with the shadow line segment. We compute this by creating quads connecting each edge of the original footprint to the corresponding edge of the translated footprint, then unioning all quads + both footprints using polyclip-ts. This handles both convex and non-convex footprints correctly.
- **Design vs. context shadow separation**: Context shadow = union of all context building shadows. Design-only shadow = union(all design shadows) MINUS context shadow. This gives the net-new shadow area introduced by the design buildings.
- **Area metrics use the shoelace formula** applied to polygon rings. Outer ring area minus hole areas.

### Element Classification
- **Classification is now function-based.** Elements with a `properties.functionId` (residential, office, retail, etc.) are classified as design buildings. Everything else is context. This uses the Forma element schema's `functionId` property, which is the field populated when you assign a Function to a building in the Forma UI.
- **`functionId` is marked deprecated in the SDK schema** with a note that "Function tagging will be re-introduced using a new concept." If Forma removes this field in a future SDK version, the classifier will need updating. Watch for this.
- **The `Properties` interface also allows arbitrary keys** (`[k: string]: any`), so if Function moves to a custom namespace via `editProperties`, we may need to check there too.

### Weave (Forma UI Components)
- **Type definitions are incomplete.** The `weave-button` element was missing `disabled` in its type definition. We added it manually in `src/lib/weave.d.ts`. Expect to hit similar gaps with other Weave components.
- **`weave-select` onChange events** fire `CustomEvent<{ value: string; text: string }>`, not standard DOM events. TypeScript requires casting the event parameter to `any` to access `e.detail.value`.

### Testing
- **The extension only works inside Forma.** You cannot open `http://localhost:8081` in a regular browser and expect it to function — all Forma SDK calls will fail because the extension expects to be in Forma's iframe context.
- **Register at APS Developer Portal** with URL `http://localhost:8081` and placement `RIGHT_MENU_ANALYSIS_PANEL` for local development.
- **.docx files can't be read by standard file tools.** If you need to extract text from the requirements doc, use `python-docx`: `py -c "from docx import Document; doc = Document('path'); print('\n'.join(p.text for p in doc.paragraphs))"`

## Success Metrics

- **Shadow color export works**: Baseline 0 → Target: functional export with user-chosen shadow colors
  - *Why it matters*: Core P0 requirement from Arcadis
  - *Measurement method*: Manual QA — exported images show distinct shadow colors

- **3x3 matrix export**: Baseline 0 → Target: single-click 9-image export
  - *Why it matters*: Matches standard deliverable format across jurisdictions
  - *Measurement method*: ZIP contains 9 correctly named/timed images

- **Shadow area metrics**: Baseline 0 → Target: display shadow area in m² after preview
  - *Why it matters*: Quantitative shadow impact data for submittal narratives
  - *Measurement method*: Area displayed in preview UI after computation

- **Butterfly diagram**: Baseline 0 → Target: single-click butterfly diagram export
  - *Why it matters*: Shows daily shadow sweep pattern — common in Canadian and progressive US submittals
  - *Measurement method*: PNG export shows graduated opacity shadow fan with building context

## Technology Stack

- **Language**: TypeScript 5.4
- **UI**: Preact 10.20
- **Build**: Vite 5.4.11 (pinned — do not upgrade independently of @preact/preset-vite)
- **SDK**: forma-embedded-view-sdk (currently 0.87, will update)
- **Design System**: Weave (Autodesk Forma design components)
- **Shadow Computation**: suncalc (sun position), polyclip-ts (polygon booleans), earcut (triangulation)
- **Utilities**: Luxon (timezone), JSZip (export), file-saver (download), Lodash (utilities)
