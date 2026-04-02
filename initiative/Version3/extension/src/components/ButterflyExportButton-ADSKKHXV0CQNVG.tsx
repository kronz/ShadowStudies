import { Forma } from "forma-embedded-view-sdk/auto";
import { saveAs } from "file-saver";
import { useState } from "preact/hooks";
import {
  computeButterflyDiagram,
  renderButterflyToCanvas,
  ButterflyConfig,
} from "../lib/butterfly-diagram";
import { ShadowColorSettings } from "./ColorControls";

type ButterflyExportButtonProps = {
  month: number;
  day: number;
  resolution: string;
  shadowSettings: ShadowColorSettings;
  cellSize?: number;
};

export default function ButterflyExportButton({
  month,
  day,
  resolution,
  shadowSettings,
  cellSize,
}: ButterflyExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [intervalHours, setIntervalHours] = useState(1);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(18);

  const hasShadowColors =
    shadowSettings.designShadowEnabled || shadowSettings.contextShadowEnabled;

  if (!hasShadowColors) return null;

  const width = parseInt(resolution.split("x")[0], 10);
  const height = parseInt(resolution.split("x")[1], 10);

  const onExport = async () => {
    setExporting(true);
    try {
      const projectTimezone = await Forma.project.getTimezone();
      if (!projectTimezone) throw new Error("No timezone");

      const currentSunDate = await Forma.sun.getDate();
      const year = currentSunDate.getFullYear();

      const config: ButterflyConfig = {
        month,
        day,
        startHour,
        endHour,
        intervalMinutes: intervalHours * 60,
        year,
        timezone: projectTimezone,
        cellSize,
      };

      const result = await computeButterflyDiagram(config, setStatus);

      setStatus("Rendering butterfly diagram...");
      const canvas = renderButterflyToCanvas(result, width, height, {
        contextShadowEnabled: shadowSettings.contextShadowEnabled,
        contextShadowColor: shadowSettings.contextShadowColor,
        designShadowEnabled: shadowSettings.designShadowEnabled,
        designShadowColor: shadowSettings.designShadowColor,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, `butterfly-${month}-${day}.png`);
        }
      });

      setStatus("Butterfly diagram exported.");
    } catch (e) {
      console.error(e);
      setStatus("Export failed. Check console.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ marginTop: "8px" }}>
      <div class="section-header">Butterfly Diagram</div>

      <div class="row">
        <div class="row-title" style={{ width: "40%" }}>Hours:</div>
        <div class="row-item">
          <weave-select
            value={String(startHour)}
            onChange={(e: any) => setStartHour(parseInt(e.detail.value, 10))}
          >
            {[6, 7, 8, 9].map((h) => (
              <weave-select-option key={String(h)} value={String(h)}>
                {`${h}:00`}
              </weave-select-option>
            ))}
          </weave-select>
          <span style={{ padding: "0 4px" }}>to</span>
          <weave-select
            value={String(endHour)}
            onChange={(e: any) => setEndHour(parseInt(e.detail.value, 10))}
          >
            {[16, 17, 18, 19, 20].map((h) => (
              <weave-select-option key={String(h)} value={String(h)}>
                {`${h}:00`}
              </weave-select-option>
            ))}
          </weave-select>
        </div>
      </div>

      <div class="row">
        <div class="row-title" style={{ width: "40%" }}>Interval:</div>
        <div class="row-item">
          <weave-select
            value={String(intervalHours)}
            onChange={(e: any) => setIntervalHours(parseInt(e.detail.value, 10))}
          >
            <weave-select-option value="1">1 hour</weave-select-option>
            <weave-select-option value="2">2 hours</weave-select-option>
          </weave-select>
        </div>
      </div>

      <weave-button
        variant="outlined"
        onClick={onExport}
        disabled={exporting}
      >
        {exporting ? "Generating..." : "Export butterfly diagram"}
      </weave-button>
      {status && (
        <div style={{ fontSize: "10px", color: "#3c3c3cb2", textAlign: "center", marginTop: "4px" }}>
          {status}
        </div>
      )}
    </div>
  );
}
