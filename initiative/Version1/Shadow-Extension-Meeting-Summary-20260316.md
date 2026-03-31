# Shadow Study Extension — Meeting Summary

**Date:** March 16, 2026  
**Participants:** Zach Kron, Robin Franke  
**Topic:** Shadow study requirements for the Forma shadow analysis extension, driven by Arcadis customer feedback and review of real-world project submittals

---

## Background / Problem Statement

Arcadis has identified a gap in the current Forma shadow study extension. For Canadian project submittals (and likely other jurisdictions), they need the ability to **color the shadows themselves** — not just the buildings and terrain. The extension currently supports recoloring buildings and terrain, but has no control over shadow color.

This limitation prevents firms from producing the differentiated shadow diagrams commonly required in municipal design review submittals, where distinct colors distinguish existing shadows, planned-development shadows, and proposed-development shadows.

---

## Key Findings from Example Projects

Zach and Robin reviewed shadow study deliverables from multiple real-world projects. The key patterns observed:

### Standard Deliverable Format

Most submittals follow a **3 x 3 matrix**: three times of day (morning, noon, evening) across three times of year (summer solstice, equinox, winter solstice). This was consistent across Seattle EDG submittals and Canadian rezoning applications.

### Terminology Is Inconsistent

The same type of analysis goes by different names depending on the jurisdiction and firm:

- "Shadow study"
- "Sun study"
- "Solar study"

### Net-New Shadow Polygons

Several projects (notably a Perkins & Will Seattle submittal) used a multi-layer approach:

1. **Existing shadows** — shadows cast by buildings on site today (light grey)
2. **Planned development shadows** — shadows from already-approved but not-yet-built projects (dark grey)
3. **Proposed development shadows** — net-new shadows introduced by the project seeking approval (colored polygon, e.g. blue outline)

The proposed-development shadows were rendered as **discrete polygon shapes** (not just shading), which allows area calculation — a critical requirement. Arcadis confirmed they need to quantify statements like "at equinox at 12:00 PM there will be an additional 24% of park area covered by shadow."

### Color Choices Are Strategic

The choice of shadow and building colors in submittals is not neutral — it is used to shape the narrative:

- **High-contrast colors (e.g. red)** on proposed buildings draw attention to the new development, which can emphasize or de-emphasize shadow impact depending on context.
- **Low-contrast colors (e.g. blue on grey)** for net-new shadow polygons can make additional shadow impact appear minimal.
- Firms make deliberate choices about what to emphasize and what to downplay.

### Seattle Is the Richest US Source

Seattle's Early Design Guidelines (EDG) process requires multi-family and mixed-use projects to go through a design review checklist. Nearly all reviewed Seattle submittals included shadow/sun studies with similar formatting. Other US cities surveyed (Austin, Bellevue, Boston, Chicago, Denver, Portland, San Francisco) had comparatively little environmental/shadow assessment in their design review processes.

The specific Seattle design guideline driving shadow studies appears to fall under "Sunlight and natural ventilation: take advantage of solar exposure and natural ventilation available on site where possible," though explicit shadow study requirements were difficult to locate in the published guidelines.

### Canadian Examples

The Brentwood Amended Conceptual Master Plan and Pearson Rezoning documents both contain detailed shadow studies. The Pearson rezoning (pp. 190, 199–200) includes shadow justification narratives and highlights areas of concern (e.g. childcare outdoor spaces colored red to indicate sensitivity).

---

## Emerging Requirements

At a minimum, the extension needs **four independent color controls**:

| # | Element | Description |
|---|---------|-------------|
| 1 | Context buildings | Recolor existing/surrounding buildings |
| 2 | Design buildings | Recolor the proposed development buildings |
| 3 | Context shadows | Recolor shadows cast by existing buildings |
| 4 | Design shadows | Recolor shadows cast by proposed buildings |

The simplest first step is adding a "color shadow" control to the existing extension UI. This was agreed to be straightforward and the clear priority.

---

## Stretch Goals / Future Considerations

### Shadow as a Measurable Object

To satisfy area-calculation requirements (e.g. "24% additional shadow coverage on the park"), shadows need to be treated as geometry — not just visual artifacts. This implies:

- Projecting shadow volumes onto ground/terrain surfaces to produce **shadow polygons**
- Performing **Boolean operations** (union, difference) to isolate net-new shadow area
- Calculating polygon areas for quantitative reporting

Robin noted this is a harder problem, but Autodesk has geometry libraries that could support it.

### Butterfly Diagrams

Butterfly diagrams superimpose shadows from multiple times of day/year onto a single image, using additive or multiplicative transparency to show where cumulative shadow impact is greatest. This requires:

- The ability to isolate shadows as independent layers (without building geometry interference)
- Control over how shadow layers composite (additive, multiplicative, subtractive blending)

### Solar Radiation Analysis as a Workaround

Zach previously created butterfly-diagram-like outputs using Forma's **solar radiation analysis API**, which is already exposed programmatically. Solar radiation analysis returns per-point data (hours of sun exposure) that can be manipulated and visualized. However, the output is raster-based and produces jagged edges at practical resolutions — it cannot match the crispness of vector shadow projections.

---

## Technical Notes

- **Revit shadows** are rendered as precise vector graphics, but are not exposed as manipulable objects in the model. You cannot select, measure, or export them as shapes — a long-standing limitation.
- **Forma shadow extension** was originally built in part as a sample/demo for the extension API. Shadow color may not be exposed through existing APIs. The developers who built it (Heinrich and others) may no longer be on the team.
- **Solar radiation analysis** IS exposed through the Forma API and returns usable analytical data, but at the cost of resolution and visual quality compared to native shadow rendering.
- The core technical question is whether the underlying rendering pipeline exposes shadow color as a parameter that an extension can control, or whether it is buried in visualization code without an API surface.

---

## Business Context

Many of the reviewed project submittals come from small firms (sub-10-person offices). This aligns with Autodesk's current strategic interest in reaching "down-market" customers through product-led growth rather than direct sales. AI-assisted research (like the document analysis used to gather these examples) may be key to understanding and serving these smaller markets at scale.

---

## Next Steps

1. **First step:** Add shadow color control to the existing Forma shadow study extension — assess API feasibility.
2. **Gather more examples:** Use AI to scan the collected project documents for shadow/sun/solar study content across jurisdictions.
3. **Explore API surface:** Determine whether Forma's rendering pipeline exposes shadow color as a controllable parameter, potentially consulting with the original extension developers or the visualization team.
4. **Longer term:** Investigate shadow-as-geometry for area calculation and Boolean operations.

---

## Referenced Examples in This Folder

| File(s) | Project / Source |
|---------|-----------------|
| `Brentwood Screenshot *.png`, `Brentwood Amended Conceptual Master Plan.pdf` | Brentwood Amended Conceptual Master Plan (Canada) |
| `StrattfordScreenshot *.png` | Stratford project (Arcadis) |
| `43-Seattle-WA-3040157*.png` | Seattle WA — Perkins & Will EDG submittal with multi-phase shadow polygons |
| `15-Seattle-WA-EDG*.png` | Seattle WA — EDG design guidelines / sun studies |
| `38-Seattle-WA-523FifteenthAveE*.png` | Seattle WA — 523 Fifteenth Ave E (Runeberg Architects) |
