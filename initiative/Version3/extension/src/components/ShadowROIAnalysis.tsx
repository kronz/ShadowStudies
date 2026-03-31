import { Forma } from "forma-embedded-view-sdk/auto";
import { useState, useEffect } from "preact/hooks";
import { getLastShadowResult } from "../lib/shadow-preview";
import {
  computeShadowPercentageInRegion,
  type ROIResult,
} from "../lib/shadow-grid";

type ShadowROIAnalysisProps = {
  shadowVersion: number;
};

function formatArea(sqMeters: number): string {
  if (sqMeters >= 10000) {
    return `${(sqMeters / 10000).toFixed(2)} ha`;
  }
  return `${Math.round(sqMeters).toLocaleString()} m²`;
}

export default function ShadowROIAnalysis({
  shadowVersion,
}: ShadowROIAnalysisProps) {
  const [roiPolygon, setRoiPolygon] = useState<[number, number][] | null>(null);
  const [roiLabel, setRoiLabel] = useState("");
  const [roiResult, setRoiResult] = useState<ROIResult | null>(null);
  const [status, setStatus] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!roiPolygon) return;
    const shadowResult = getLastShadowResult();
    if (shadowResult) {
      const result = computeShadowPercentageInRegion(
        shadowResult.classifications,
        shadowResult.grid,
        roiPolygon,
      );
      setRoiResult(result);
      setStatus("");
    }
  }, [shadowVersion, roiPolygon]);

  const captureROI = async () => {
    setCapturing(true);
    setStatus("");
    setRoiResult(null);
    try {
      const paths = await Forma.selection.getSelection();
      if (paths.length === 0) {
        setStatus("Nothing selected. Click an element first.");
        return;
      }

      let polygon: [number, number][] | null = null;
      for (const path of paths) {
        try {
          const fp = await Forma.geometry.getFootprint({ path });
          if (fp && fp.type === "Polygon" && fp.coordinates.length >= 3) {
            polygon = fp.coordinates.map(
              ([x, y]: number[]) => [x, y] as [number, number],
            );
            break;
          }
        } catch {
          continue;
        }
      }

      if (!polygon) {
        setStatus("No footprint polygon found for selected element(s).");
        return;
      }

      setRoiPolygon(polygon);
      setRoiLabel(`${paths.length} element(s) selected`);

      const shadowResult = getLastShadowResult();
      if (shadowResult) {
        const result = computeShadowPercentageInRegion(
          shadowResult.classifications,
          shadowResult.grid,
          polygon,
        );
        setRoiResult(result);
      } else {
        setStatus("Run shadow preview to see analysis.");
      }
    } catch (e) {
      console.error("ROI selection failed:", e);
      setStatus("Failed to read selection.");
    } finally {
      setCapturing(false);
    }
  };

  const clearROI = () => {
    setRoiPolygon(null);
    setRoiLabel("");
    setRoiResult(null);
    setStatus("");
  };

  return (
    <div style={{ marginTop: "8px" }}>
      <div class="section-header">Shadow Analysis (ROI)</div>

      {roiPolygon ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 0",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "bold" }}>
              ROI: {roiLabel}
            </span>
            <weave-button
              variant="flat"
              onClick={clearROI}
              style={{ minWidth: "auto" }}
            >
              Clear
            </weave-button>
            <weave-button
              variant="flat"
              onClick={captureROI}
              disabled={capturing}
              style={{ minWidth: "auto" }}
            >
              Reselect
            </weave-button>
          </div>

          {roiResult ? (
            <div style={{ fontSize: "10px", color: "#3c3c3c", padding: "4px 0" }}>
              <div>ROI area: {formatArea(roiResult.roiArea)}</div>
              <div style={{ fontWeight: "bold" }}>
                Shadow coverage: {formatArea(roiResult.shadowArea)} (
                {roiResult.percentage.toFixed(1)}%)
              </div>
              {roiResult.designShadowCells > 0 && (
                <div>
                  ↳ Design shadow (net new): {roiResult.designPercentage.toFixed(1)}%
                </div>
              )}
              {roiResult.contextShadowCells > 0 && (
                <div>
                  ↳ Context shadow: {roiResult.contextPercentage.toFixed(1)}%
                </div>
              )}
              {roiResult.totalCells === 0 && (
                <div style={{ color: "#b35900" }}>
                  No grid cells found inside ROI. The selected area may be
                  outside the analysis bounds.
                </div>
              )}
            </div>
          ) : (
            !status && (
              <div
                style={{
                  fontSize: "10px",
                  color: "#3c3c3cb2",
                  padding: "2px 0 0",
                }}
              >
                Run shadow preview to see analysis.
              </div>
            )
          )}
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: "11px",
              color: "#3c3c3cb2",
              padding: "0 0 4px",
              lineHeight: "1.3",
            }}
          >
            Select a parcel or open space, then press below to analyze shadow
            coverage within that area.
          </div>
          <weave-button
            variant="outlined"
            onClick={captureROI}
            disabled={capturing}
          >
            {capturing ? "Reading..." : "Set analysis area"}
          </weave-button>
        </>
      )}

      {status && (
        <div
          style={{
            fontSize: "10px",
            color: "#3c3c3cb2",
            padding: "2px 0 0",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
