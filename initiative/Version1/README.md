# Shadow Study Extension V2

A Forma Site Design extension that produces **shadow study deliverables** — the images architects submit to cities showing how proposed buildings will cast shadows on surrounding neighborhoods.

## Why This Exists

When developers propose new buildings, cities often require a **shadow study** showing how the building will affect sunlight in the surrounding area. These studies are standard for design review submittals in Seattle, across Canada, and increasingly elsewhere.

The original Forma shadow study extension could color buildings and terrain, but **could not color the shadows themselves**. This is a dealbreaker for firms like Arcadis, who need to clearly distinguish:

- Shadows from **existing** ("context") buildings — usually shown in grey
- Shadows from the **proposed** ("design") building — shown in a distinct color (blue, purple, etc.)

This extension adds that capability.

## What It Does

### Four-Way Color Control
You can independently set colors for:
1. **Context buildings** (existing surrounding buildings)
2. **Design buildings** (the proposed development)
3. **Context shadows** (shadows from existing buildings)
4. **Design shadows** (new shadows from the proposed building)

### 3×3 Matrix Export
The standard deliverable format: **3 times of day × 3 times of year** = 9 images. One click exports all 9 as a ZIP file.

| | Summer Solstice | Equinox | Winter Solstice |
|---|---|---|---|
| **Morning** | ☀️ | ☀️ | ☀️ |
| **Noon** | ☀️ | ☀️ | ☀️ |
| **Evening** | ☀️ | ☀️ | ☀️ |

### Custom Range Export
For non-standard requirements: pick a specific date, time range, and interval.

### Live Shadow Preview
An interactive preview that colors shadows directly in the 3D scene. Lower resolution than the export (grid-based rather than pixel-perfect) but useful for quick checks.

## How It Works (Non-Technical)

The Forma platform doesn't let extensions control shadow color directly. So this extension uses two creative workarounds:

### For Exports: "Spot the Difference"
1. Takes a screenshot of the scene **with** the proposed building
2. Takes a screenshot **without** the proposed building (temporarily hides it)
3. Compares the two images pixel-by-pixel
4. Wherever the first image is darker (because the proposed building cast a shadow), it recolors those pixels with your chosen shadow color

This produces pixel-perfect results in the exported images.

### For Live Preview: "Sun Map Overlay"
1. Runs Forma's built-in sun analysis, which calculates how many hours of direct sunlight each point on the ground receives
2. Spots with low sun hours = shadow
3. Renders colored tiles on the ground where shadows fall

This is lower resolution (you'll see a grid pattern) but gives instant visual feedback.

## Project Architecture

```
initiative/Version1/
├── README.md               ← You are here
├── GETTING-STARTED.md      ← Setup instructions (start here if you're new)
├── CLAUDE.md               ← Living project doc: decisions, status, blockers
├── Shadow Extension (1).docx   ← Original requirements discussion
├── Shadow-Extension-Meeting-Summary-20260316.md  ← Meeting notes
│
└── extension/              ← The actual extension code
    ├── package.json        ← Dependencies and scripts
    ├── vite.config.ts      ← Build configuration
    ├── tsconfig.json       ← TypeScript configuration
    ├── index.html          ← Entry HTML page
    │
    └── src/
        ├── app.tsx                 ← Main UI component (start reading here)
        ├── main.tsx                ← Bootstraps the app
        ├── styles.css              ← Styles
        │
        ├── components/
        │   ├── ColorControls.tsx       ← Four-way color picker UI
        │   ├── MatrixSelector.tsx       ← 3×3 matrix configuration UI
        │   ├── ExportButton.tsx         ← Export logic (matrix + custom)
        │   ├── ShadowPreviewButton.tsx  ← Live preview trigger
        │   ├── DateSelector.tsx         ← Date input (custom mode)
        │   ├── TimeSelector.tsx         ← Time range input (custom mode)
        │   ├── IntervalSelector.tsx     ← Interval input (custom mode)
        │   ├── ResolutionSelector.tsx   ← Image resolution selector
        │   └── PreviewButton.tsx        ← Camera preview (custom mode)
        │
        └── lib/
            ├── shadow-diff.ts          ← Pixel differencing engine (exports)
            ├── shadow-preview.ts       ← Sun analysis overlay (live preview)
            ├── element-classifier.ts   ← Design vs. context element logic
            ├── weave.d.ts              ← Type defs for Forma UI components
            └── preact.d.ts             ← Preact type helpers
```

## What's Working

- [x] Four independent color controls (context/design buildings + shadows)
- [x] 3×3 matrix export mode
- [x] Custom range export mode
- [x] Shadow recoloring in exports via pixel differencing
- [x] Live shadow preview via sun analysis overlay
- [x] Element classification scaffold (placeholder — needs tuning)
- [x] Clean build and typecheck

## What Needs Testing and Tuning

- **Element classification**: Currently treats all elements as "design." Needs testing in a real Forma project with both context and design buildings to develop the right heuristic.
- **Shadow detection thresholds**: The pixel-differencing algorithm has numeric thresholds that were set as educated guesses. They need empirical tuning in real scenes.
- **Sun analysis threshold**: The live preview's "what counts as shadow" threshold needs calibration.

See `CLAUDE.md` for the full list of open questions and blockers.

## Related

- **Original extension**: `content/aps-forma-extension-shadow-study-main/` — the V1 we forked from
- **Forma SDK docs**: [Autodesk Forma Developer Documentation](https://aps.autodesk.com/en/docs/forma/v1/overview/introduction/)
- **Meeting notes**: `Shadow-Extension-Meeting-Summary-20260316.md`
