import { useState, useCallback } from "preact/hooks";
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
import DesignBuildingSelector from "./components/DesignBuildingSelector";
import ShadowROIAnalysis from "./components/ShadowROIAnalysis";

type ExportMode = "matrix" | "custom";

export default function App() {
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

  const [designPaths, setDesignPaths] = useState<string[]>([]);
  const [plannedPaths, setPlannedPaths] = useState<string[]>([]);

  const [shadowSettings, setShadowSettings] = useState<ShadowColorSettings>({
    contextShadowEnabled: true,
    contextShadowColor: "#b8cdab",
    designShadowEnabled: true,
    designShadowColor: "#004343",
    plannedShadowEnabled: true,
    plannedShadowColor: "#5e548e",
  });

  const [buildingColors, setBuildingColors] = useState<Map<string, string>>(new Map());

  const handleShadowSettingsChange = useCallback((settings: ShadowColorSettings) => {
    setShadowSettings(settings);
  }, []);

  const handleBuildingColorsChange = useCallback((colors: Map<string, string>) => {
    setBuildingColors(colors);
  }, []);

  return (
    <>
      <h1>Shadow study v3.011</h1>

      <weave-accordion label="Design Buildings" expanded>
        <DesignBuildingSelector
          designPaths={designPaths}
          onDesignPathsChange={setDesignPaths}
          plannedPaths={plannedPaths}
          onPlannedPathsChange={setPlannedPaths}
        />
      </weave-accordion>

      <weave-accordion label="Analysis Area" expanded>
        <ShadowROIAnalysis
          shadowVersion={shadowVersion}
        />
      </weave-accordion>

      <weave-accordion label="Export Settings">
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
      </weave-accordion>

      <weave-accordion label="Shadow Colors">
        <ColorControls
          designPaths={designPaths}
          onShadowSettingsChange={handleShadowSettingsChange}
          onBuildingColorsChange={handleBuildingColorsChange}
        />
      </weave-accordion>

      <weave-accordion label="Preview & Export">
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
          designPaths={designPaths}
          plannedPaths={plannedPaths}
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
          designPaths={designPaths}
          plannedPaths={plannedPaths}
          cellSize={cellSize}
        />

        <ButterflyExportButton
          month={exportMode === "matrix" ? 6 : month}
          day={exportMode === "matrix" ? 21 : day}
          resolution={resolution}
          shadowSettings={shadowSettings}
          designPaths={designPaths}
          plannedPaths={plannedPaths}
          cellSize={cellSize}
        />
      </weave-accordion>
    </>
  );
}
