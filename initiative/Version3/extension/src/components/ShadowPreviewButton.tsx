import { useState, useEffect } from "preact/hooks";
import {
  renderShadowPreview,
  clearShadowPreview,
  ShadowPreviewOptions,
  ShadowPreviewResult,
} from "../lib/shadow-preview";
import { ShadowColorSettings } from "./ColorControls";
import { getAreaFormatter, formatTimeInProjectTz } from "../lib/format-utils";

type ShadowPreviewButtonProps = {
  month?: number;
  day?: number;
  shadowSettings: ShadowColorSettings;
  designPaths?: string[];
  plannedPaths?: string[];
  cellSize?: number;
  onShadowReady?: () => void;
};

export default function ShadowPreviewButton({
  month,
  day,
  shadowSettings,
  designPaths,
  plannedPaths,
  cellSize,
  onShadowReady,
}: ShadowPreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const [areas, setAreas] = useState<ShadowPreviewResult["areas"] | null>(null);
  const [previewTime, setPreviewTime] = useState<string>("");
  const [formatArea, setFormatArea] = useState<(sqM: number) => string>(
    () => (sqM: number) => `${Math.round(sqM).toLocaleString()} m²`,
  );

  useEffect(() => {
    getAreaFormatter().then((fn) => setFormatArea(() => fn));
  }, []);

  const hasShadowColors =
    shadowSettings.designShadowEnabled || shadowSettings.contextShadowEnabled;

  const onClickPreview = async () => {
    if (active) {
      await clearShadowPreview();
      setActive(false);
      setStatus("");
      setAreas(null);
      setPreviewTime("");
      return;
    }

    setLoading(true);
    setAreas(null);
    setPreviewTime("");
    try {
      const options: ShadowPreviewOptions = {
        ...(month !== undefined && day !== undefined ? { month, day } : {}),
        designShadowEnabled: shadowSettings.designShadowEnabled,
        designShadowColor: shadowSettings.designShadowColor,
        contextShadowEnabled: shadowSettings.contextShadowEnabled,
        contextShadowColor: shadowSettings.contextShadowColor,
        plannedShadowEnabled: shadowSettings.plannedShadowEnabled,
        plannedShadowColor: shadowSettings.plannedShadowColor,
        designPaths,
        plannedPaths,
        cellSize,
        onProgress: setStatus,
      };
      const result = await renderShadowPreview(options);
      setAreas(result.areas);
      setPreviewTime(await formatTimeInProjectTz(result.dateUsed));
      setActive(true);
      onShadowReady?.();
    } catch (e) {
      console.error(e);
      setStatus("Preview failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  if (!hasShadowColors) return null;

  return (
    <div class="row" style={{ flexDirection: "column", height: "auto", gap: "4px" }}>
      <weave-button
        variant="outlined"
        onClick={onClickPreview}
        disabled={loading}
      >
        {loading
          ? "Computing..."
          : active
            ? "Clear shadow preview"
            : "Preview shadow colors"}
      </weave-button>
      {status && (
        <div style={{ fontSize: "10px", color: "#3c3c3cb2", textAlign: "center" }}>
          {status}
        </div>
      )}
      {areas && active && (
        <div style={{ fontSize: "10px", color: "#3c3c3c", padding: "4px 0" }}>
          {previewTime && (
            <div style={{ fontStyle: "italic", marginBottom: "2px" }}>
              Preview at {previewTime}
            </div>
          )}
          {shadowSettings.contextShadowEnabled && areas.contextShadowArea > 0 && (
            <div>Context shadow: {formatArea(areas.contextShadowArea)}</div>
          )}
          {shadowSettings.designShadowEnabled && areas.designOnlyShadowArea > 0 && (
            <div>Design shadow (net new): {formatArea(areas.designOnlyShadowArea)}</div>
          )}
          {shadowSettings.plannedShadowEnabled && areas.plannedShadowArea > 0 && (
            <div>Planned shadow: {formatArea(areas.plannedShadowArea)}</div>
          )}
          {areas.totalShadowArea > 0 && (
            <div style={{ fontWeight: "bold" }}>
              Total shadow: {formatArea(areas.totalShadowArea)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
