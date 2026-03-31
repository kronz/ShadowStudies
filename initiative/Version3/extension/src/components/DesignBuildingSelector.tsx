import { Forma } from "forma-embedded-view-sdk/auto";
import { useState } from "preact/hooks";

type DesignBuildingSelectorProps = {
  designPaths: string[];
  onDesignPathsChange: (paths: string[]) => void;
};

export default function DesignBuildingSelector({
  designPaths,
  onDesignPathsChange,
}: DesignBuildingSelectorProps) {
  const [status, setStatus] = useState("");
  const [capturing, setCapturing] = useState(false);

  const captureSelection = async () => {
    setCapturing(true);
    setStatus("");
    try {
      const selectedPaths = await Forma.selection.getSelection();
      console.log("[shadow] Selection captured:", selectedPaths);
      if (selectedPaths.length === 0) {
        setStatus("Nothing selected. Shift-click buildings first.");
        setCapturing(false);
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

      onDesignPathsChange(buildingPaths);
      setStatus(
        `${buildingPaths.length} tagged. Press Escape to deselect and restore panel.`,
      );
    } catch (e) {
      console.error("Selection capture failed:", e);
      setStatus("Failed to read selection. See console.");
    } finally {
      setCapturing(false);
    }
  };

  const clearDesign = () => {
    onDesignPathsChange([]);
    setStatus("");
  };

  if (designPaths.length > 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 0",
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: "bold" }}>
          Design: {designPaths.length} building(s)
        </span>
        <weave-button
          variant="flat"
          onClick={clearDesign}
          style={{ minWidth: "auto" }}
        >
          Clear
        </weave-button>
        <weave-button
          variant="flat"
          onClick={captureSelection}
          disabled={capturing}
          style={{ minWidth: "auto" }}
        >
          Reselect
        </weave-button>
      </div>
    );
  }

  return (
    <div>
      <div class="section-header">Design Buildings</div>
      <div
        style={{
          fontSize: "11px",
          color: "#3c3c3cb2",
          padding: "0 0 4px",
          lineHeight: "1.3",
        }}
      >
        Shift-click buildings, then press below.
        After tagging, press <b>Escape</b> to deselect.
      </div>
      <weave-button
        variant="outlined"
        onClick={captureSelection}
        disabled={capturing}
      >
        {capturing ? "Reading..." : "Set as Design"}
      </weave-button>
      {status && (
        <div style={{ fontSize: "10px", color: "#3c3c3cb2", padding: "2px 0 0" }}>
          {status}
        </div>
      )}
    </div>
  );
}
