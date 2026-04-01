import { Forma } from "forma-embedded-view-sdk/auto";
import { useState } from "preact/hooks";

type DesignBuildingSelectorProps = {
  designPaths: string[];
  onDesignPathsChange: (paths: string[]) => void;
  plannedPaths?: string[];
  onPlannedPathsChange?: (paths: string[]) => void;
};

export default function DesignBuildingSelector({
  designPaths,
  onDesignPathsChange,
  plannedPaths = [],
  onPlannedPathsChange,
}: DesignBuildingSelectorProps) {
  const [status, setStatus] = useState("");
  const [capturing, setCapturing] = useState<"design" | "planned" | null>(null);

  const captureSelection = async (mode: "design" | "planned") => {
    setCapturing(mode);
    setStatus("");
    try {
      const selectedPaths = await Forma.selection.getSelection();
      if (selectedPaths.length === 0) {
        setStatus("Nothing selected. Shift-click buildings first.");
        setCapturing(null);
        return;
      }

      let buildingPaths: string[];
      try {
        const allBuildingPaths = await Forma.geometry.getPathsByCategory({
          category: "buildings",
        });
        const buildingSet = new Set(allBuildingPaths);
        buildingPaths = selectedPaths.filter((p) => buildingSet.has(p));
        if (buildingPaths.length === 0) buildingPaths = selectedPaths;
      } catch {
        buildingPaths = selectedPaths;
      }

      if (mode === "design") {
        onDesignPathsChange(buildingPaths);
      } else {
        onPlannedPathsChange?.(buildingPaths);
      }
      setStatus(
        `${buildingPaths.length} tagged as ${mode}. Press Escape to deselect and restore panel.`,
      );
    } catch (e) {
      console.error("Selection capture failed:", e);
      setStatus("Failed to read selection. See console.");
    } finally {
      setCapturing(null);
    }
  };

  const clearDesign = () => {
    onDesignPathsChange([]);
    setStatus("");
  };

  const clearPlanned = () => {
    onPlannedPathsChange?.([]);
    setStatus("");
  };

  return (
    <div>
      <div class="section-header">Design Buildings</div>

      {designPaths.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
          <span style={{ fontSize: "11px", fontWeight: "bold" }}>
            Design: {designPaths.length} building(s)
          </span>
          <weave-button variant="flat" onClick={clearDesign} style={{ minWidth: "auto" }}>
            Clear
          </weave-button>
          <weave-button variant="flat" onClick={() => captureSelection("design")} disabled={!!capturing} style={{ minWidth: "auto" }}>
            Reselect
          </weave-button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: "11px", color: "#3c3c3cb2", padding: "0 0 4px", lineHeight: "1.3" }}>
            Shift-click buildings, then press below.
            After tagging, press <b>Escape</b> to deselect.
          </div>
          <weave-button variant="outlined" onClick={() => captureSelection("design")} disabled={!!capturing}>
            {capturing === "design" ? "Reading..." : "Set as Design"}
          </weave-button>
        </>
      )}

      {onPlannedPathsChange && (
        <>
          <div class="section-header" style={{ marginTop: "8px" }}>Planned Buildings</div>

          {plannedPaths.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
              <span style={{ fontSize: "11px", fontWeight: "bold" }}>
                Planned: {plannedPaths.length} building(s)
              </span>
              <weave-button variant="flat" onClick={clearPlanned} style={{ minWidth: "auto" }}>
                Clear
              </weave-button>
              <weave-button variant="flat" onClick={() => captureSelection("planned")} disabled={!!capturing} style={{ minWidth: "auto" }}>
                Reselect
              </weave-button>
            </div>
          ) : (
            <weave-button variant="outlined" onClick={() => captureSelection("planned")} disabled={!!capturing}>
              {capturing === "planned" ? "Reading..." : "Set as Planned"}
            </weave-button>
          )}
        </>
      )}

      {status && (
        <div style={{ fontSize: "10px", color: "#3c3c3cb2", padding: "2px 0 0" }}>
          {status}
        </div>
      )}
    </div>
  );
}
