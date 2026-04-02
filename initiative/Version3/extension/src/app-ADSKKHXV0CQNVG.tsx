import { useState, useCallback } from "preact/hooks";
import DateSelector from "./components/DateSelector";
import ExportButton from "./components/ExportButton";
import IntervalSelector from "./components/IntervalSelector";
import ResolutionSelector from "./components/ResolutionSelector";
import TimeSelector from "./components/TimeSelector";
import PreviewButton from "./components/PreviewButton";
import ColorControls, { ShadowColorSettings } from "./components/ColorControls";
import MatrixSelector, { MatrixConfig } from "./components/MatrixSelector";
import ShadowPreviewButton from "./components/ShadowPreviewButton";
import ButterflyExportButton from "./components/ButterflyExportButton";
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

  const [matrixConfig, setMatrixConfig] = useState<MatrixConfig>({
    morningHour: 9,
    noonHour: 12,
    eveningHour: 15,
  });

  const [shadowVersion, setShadowVersion] = useState(0);

  const [shadowSettings, setShadowSettings] = useState<ShadowColorSettings>({
    contextShadowEnabled: false,
    contextShadowColor: "#0E0E0E",
    designShadowEnabled: false,
    designShadowColor: "#6B2D3C",
    analysisAreaColor: "#CC9D83",
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
      <h1>Shadow study v3.009</h1>

      <div class="section-header">Export Mode</div>
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

      <ColorControls
        onShadowSettingsChange={handleShadowSettingsChange}
        onBuildingColorsChange={handleBuildingColorsChange}
      />

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
        onShadowReady={() => setShadowVersion((v) => v + 1)}
      />

      <ShadowROIAnalysis shadowVersion={shadowVersion} />

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
      />

      <ButterflyExportButton
        month={exportMode === "matrix" ? 6 : month}
        day={exportMode === "matrix" ? 21 : day}
        resolution={resolution}
        shadowSettings={shadowSettings}
      />
    </>
  );
}
