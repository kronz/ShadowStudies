import { Forma } from "forma-embedded-view-sdk/auto";
import { useState, useEffect } from "preact/hooks";
import { getLastShadowResult } from "../lib/shadow-preview";
import {
  computeShadowPercentageInRegion,
  type AnalysisAreaResult,
} from "../lib/shadow-grid";
import { getAreaFormatter, formatTimeInProjectTz } from "../lib/format-utils";
import { renderAnalysisAreaOutline, clearAnalysisAreaOutline } from "../lib/outline-renderer";

type ShadowROIAnalysisProps = {
  shadowVersion: number;
  analysisAreaColor?: string;
};

export default function ShadowROIAnalysis({
  shadowVersion,
  analysisAreaColor = "#CC9D83",
}: ShadowROIAnalysisProps) {
  const [areaPolygon, setAreaPolygon] = useState<[number, number][] | null>(null);
  const [areaLabel, setAreaLabel] = useState("");
  const [areaResult, setAreaResult] = useState<AnalysisAreaResult | null>(null);
  const [status, setStatus] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [analysisTime, setAnalysisTime] = useState<string>("");
  const [formatArea, setFormatArea] = useState<(sqM: number) => string>(
    () => (sqM: number) => `${Math.round(sqM).toLocaleString()} m²`,
  );

  useEffect(() => {
    getAreaFormatter().then((fn) => setFormatArea(() => fn));
  }, []);

  useEffect(() => {
    if (areaPolygon) {
      renderAnalysisAreaOutline(areaPolygon, analysisAreaColor);
    } else {
      clearAnalysisAreaOutline();
    }
  }, [areaPolygon, analysisAreaColor]);

  useEffect(() => {
    if (!areaPolygon) return;
    const shadowResult = getLastShadowResult();
    if (shadowResult) {
      const result = computeShadowPercentageInRegion(
        shadowResult.classifications,
        shadowResult.grid,
        areaPolygon,
      );
      setAreaResult(result);
      formatTimeInProjectTz(shadowResult.date).then(setAnalysisTime);
      setStatus("");
    }
  }, [shadowVersion, areaPolygon]);

  const captureAnalysisArea = async () => {
    setCapturing(true);
    setStatus("");
    setAreaResult(null);
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

      setAreaPolygon(polygon);
      setAreaLabel(`${paths.length} element(s) selected`);

      const shadowResult = getLastShadowResult();
      if (shadowResult) {
        const result = computeShadowPercentageInRegion(
          shadowResult.classifications,
          shadowResult.grid,
          polygon,
        );
        setAreaResult(result);
      } else {
        setStatus("Run shadow preview to see analysis.");
      }
    } catch (e) {
      console.error("Analysis area selection failed:", e);
      setStatus("Failed to read selection.");
    } finally {
      setCapturing(false);
    }
  };

  const clearAnalysisArea = () => {
    setAreaPolygon(null);
    setAreaLabel("");
    setAreaResult(null);
    setStatus("");
    clearAnalysisAreaOutline();
  };

  return (
    <div style={{ marginTop: "8px" }}>
      {areaPolygon ? (
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
              Analysis Area: {areaLabel}
            </span>
            <weave-button
              variant="flat"
              onClick={clearAnalysisArea}
              style={{ minWidth: "auto" }}
            >
              Clear
            </weave-button>
            <weave-button
              variant="flat"
              onClick={captureAnalysisArea}
              disabled={capturing}
              style={{ minWidth: "auto" }}
            >
              Reselect
            </weave-button>
          </div>

          {areaResult ? (
            <div style={{ fontSize: "10px", color: "#3c3c3c", padding: "4px 0" }}>
              {analysisTime && (
                <div style={{ fontStyle: "italic", marginBottom: "2px" }}>
                  Analysis at {analysisTime}
                </div>
              )}
              <div>Analysis area: {formatArea(areaResult.analysisArea)}</div>
              <div style={{ fontWeight: "bold" }}>
                Shadow coverage: {formatArea(areaResult.shadowArea)} (
                {Math.round(areaResult.percentage)}%)
              </div>
              {areaResult.designShadowCells > 0 && (
                <div>
                  ↳ Design shadow (net new): {Math.round(areaResult.designPercentage)}%
                </div>
              )}
              {areaResult.contextShadowCells > 0 && (
                <div>
                  ↳ Context shadow: {Math.round(areaResult.contextPercentage)}%
                </div>
              )}
              {areaResult.totalCells === 0 && (
                <div style={{ color: "#b35900" }}>
                  No grid cells found in the analysis area. The selected area
                  may be outside the analysis bounds.
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
            onClick={captureAnalysisArea}
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
