import { useState, useCallback, useEffect } from "preact/hooks";
import DateSelector from "./components/DateSelector";
import ExportButton from "./components/ExportButton";
import IntervalSelector from "./components/IntervalSelector";
import ResolutionSelector from "./components/ResolutionSelector";
import CellSizeSelector from "./components/CellSizeSelector";
import TimeSelector from "./components/TimeSelector";
import PreviewButton from "./components/PreviewButton";
import ColorControls, { ShadowColorSettings } from "./components/ColorControls";
import MatrixSelector, { MatrixConfig } from "./components/MatrixSelector";
import ShadowPreviewButton from "./components/ShadowPreviewButton";
import ButterflyExportButton from "./components/ButterflyExportButton";
import ShadowROIAnalysis from "./components/ShadowROIAnalysis";
import { type AnalysisAreaResult } from "./lib/shadow-grid";
import { getAreaFormatter } from "./lib/format-utils";

type ExportMode = "matrix" | "custom";
type PanelId = "analysis" | "export-settings" | "colors" | "preview-export";

export default function App() {
  const [openPanel, setOpenPanel] = useState<PanelId | null>("analysis");
  const [exportMode, setExportMode] = useState<ExportMode>("matrix");

  const [month, setMonth] = useState(9);
  const [day, setDay] = useState(21);
  const [interval, setInterval] = useState(180);
  const [startHour, setStartHour] = useState(8);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(18);
  const [endMinute, setEndMinute] = useState(0);
  const [resolution, setResolution] = useState("2048x1536");
  const [cellSize, setCellSize] = useState(2);
  const [shadowVersion, setShadowVersion] = useState(0);

  const [matrixConfig, setMatrixConfig] = useState<MatrixConfig>({
    morningHour: 9,
    noonHour: 12,
    eveningHour: 15,
  });

  const [shadowSettings, setShadowSettings] = useState<ShadowColorSettings>({
    contextShadowEnabled: true,
    contextShadowColor: "#4F4F4F",
    designShadowEnabled: true,
    designShadowColor: "#589BD5",
    analysisAreaColor: "#28C274",
  });

  const [buildingColors, setBuildingColors] = useState<Map<string, string>>(new Map());

  const [analysisResult, setAnalysisResult] = useState<AnalysisAreaResult | null>(null);
  const [analysisTime, setAnalysisTime] = useState("");
  const [formatArea, setFormatArea] = useState<(sqM: number) => string>(
    () => (sqM: number) => `${Math.round(sqM).toLocaleString()} m²`,
  );

  useEffect(() => {
    getAreaFormatter().then((fn) => setFormatArea(() => fn));
  }, []);

  const handleShadowSettingsChange = useCallback((settings: ShadowColorSettings) => {
    setShadowSettings(settings);
  }, []);

  const handleBuildingColorsChange = useCallback((colors: Map<string, string>) => {
    setBuildingColors(colors);
  }, []);

  const handleAnalysisResult = useCallback(
    (result: AnalysisAreaResult | null, time: string) => {
      setAnalysisResult(result);
      setAnalysisTime(time);
    },
    [],
  );

  const togglePanel = useCallback(
    (panel: PanelId) => () => {
      setOpenPanel((prev) => (prev === panel ? null : panel));
    },
    [],
  );

  return (
    <>
      <h1>Shadow study v3.016</h1>

      <weave-accordion
        label="Analysis Area"
        expanded={openPanel === "analysis"}
        onClick={togglePanel("analysis")}
      >
        <div onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ShadowROIAnalysis
            shadowVersion={shadowVersion}
            analysisAreaColor={shadowSettings.analysisAreaColor}
            onAnalysisResult={handleAnalysisResult}
          />
        </div>
      </weave-accordion>

      <weave-accordion
        label="Export Settings"
        expanded={openPanel === "export-settings"}
        onClick={togglePanel("export-settings")}
      >
        <div onClick={(e: MouseEvent) => e.stopPropagation()}>
          <div class="mode-toggle">
            <weave-button
              variant={exportMode === "matrix" ? "solid" : "outlined"}
              onClick={() => setExportMode("matrix")}
            >
              3×3 Matrix
            </weave-button>
            <weave-button
              variant={exportMode === "custom" ? "solid" : "outlined"}
              onClick={() => setExportMode("custom")}
            >
              Custom Range
            </weave-button>
          </div>

          {exportMode === "matrix" ? (
            <MatrixSelector config={matrixConfig} onConfigChange={setMatrixConfig} />
          ) : (
            <>
              <DateSelector month={month} setMonth={setMonth} day={day} setDay={setDay} />
              <TimeSelector
                startHour={startHour}
                setStartHour={setStartHour}
                startMinute={startMinute}
                setStartMinute={setStartMinute}
                endHour={endHour}
                setEndHour={setEndHour}
                endMinute={endMinute}
                setEndMinute={setEndMinute}
              />
              <IntervalSelector interval={interval} setInterval={setInterval} />
            </>
          )}

          <ResolutionSelector resolution={resolution} setResolution={setResolution} />
          <CellSizeSelector cellSize={cellSize} setCellSize={setCellSize} />
        </div>
      </weave-accordion>

      <weave-accordion
        label="Analysis Colors"
        expanded={openPanel === "colors"}
        onClick={togglePanel("colors")}
      >
        <div onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ColorControls
            onShadowSettingsChange={handleShadowSettingsChange}
            onBuildingColorsChange={handleBuildingColorsChange}
          />
        </div>
      </weave-accordion>

      <weave-accordion
        label="Preview & Export"
        expanded={openPanel === "preview-export"}
        onClick={togglePanel("preview-export")}
      >
        <div onClick={(e: MouseEvent) => e.stopPropagation()}>
          {analysisResult && (
            <div style={{ fontSize: "10px", color: "#3c3c3c", padding: "4px 0 8px", borderBottom: "1px solid #e0e0e0", marginBottom: "8px" }}>
              <div style={{ fontWeight: "bold", fontSize: "11px", marginBottom: "2px" }}>
                Analysis Metrics
              </div>
              {analysisTime && (
                <div style={{ fontStyle: "italic", marginBottom: "2px" }}>
                  Analysis at {analysisTime}
                </div>
              )}
              <div>Analysis area: {formatArea(analysisResult.analysisArea)}</div>
              <div style={{ fontWeight: "bold" }}>
                Shadow coverage: {formatArea(analysisResult.shadowArea)} (
                {Math.round(analysisResult.percentage)}%)
              </div>
              {analysisResult.designShadowCells > 0 && (
                <div>
                  ↳ Design shadow (net new): {Math.round(analysisResult.designPercentage)}%
                </div>
              )}
              {analysisResult.contextShadowCells > 0 && (
                <div>
                  ↳ Context shadow: {Math.round(analysisResult.contextPercentage)}%
                </div>
              )}
              {analysisResult.totalCells === 0 && (
                <div style={{ color: "#b35900" }}>
                  No grid cells found in the analysis area. The selected area
                  may be outside the analysis bounds.
                </div>
              )}
            </div>
          )}

          {exportMode === "custom" && (
            <PreviewButton
              month={month}
              day={day}
              startHour={startHour}
              startMinute={startMinute}
              endHour={endHour}
              endMinute={endMinute}
              interval={interval}
            />
          )}

          <ShadowPreviewButton
            shadowSettings={shadowSettings}
            cellSize={cellSize}
            onShadowReady={() => setShadowVersion((v) => v + 1)}
          />

          <ExportButton
            mode={exportMode}
            month={month}
            day={day}
            startHour={startHour}
            startMinute={startMinute}
            endHour={endHour}
            endMinute={endMinute}
            resolution={resolution}
            interval={interval}
            matrixConfig={matrixConfig}
            shadowSettings={shadowSettings}
            buildingColors={buildingColors}
            cellSize={cellSize}
          />

          <ButterflyExportButton
            month={exportMode === "matrix" ? 6 : month}
            day={exportMode === "matrix" ? 21 : day}
            resolution={resolution}
            shadowSettings={shadowSettings}
            cellSize={cellSize}
          />
        </div>
      </weave-accordion>
    </>
  );
}
