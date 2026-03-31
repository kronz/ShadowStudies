import { useState } from "preact/hooks";
import {
  renderShadowPreview,
  clearShadowPreview,
  ShadowPreviewOptions,
  ShadowPreviewResult,
} from "../lib/shadow-preview";
import { ShadowColorSettings } from "./ColorControls";

type ShadowPreviewButtonProps = {
  month: number;
  day: number;
  shadowSettings: ShadowColorSettings;
};

function formatArea(sqMeters: number): string {
  if (sqMeters >= 10000) {
    return `${(sqMeters / 10000).toFixed(2)} ha`;
  }
  return `${Math.round(sqMeters).toLocaleString()} m²`;
}

export default function ShadowPreviewButton({
  month,
  day,
  shadowSettings,
}: ShadowPreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const [areas, setAreas] = useState<ShadowPreviewResult["areas"] | null>(null);

  const hasShadowColors =
    shadowSettings.designShadowEnabled || shadowSettings.contextShadowEnabled;

  const onClickPreview = async () => {
    if (active) {
      await clearShadowPreview();
      setActive(false);
      setStatus("");
      setAreas(null);
      return;
    }

    setLoading(true);
    setAreas(null);
    try {
      const options: ShadowPreviewOptions = {
        month,
        day,
        designShadowEnabled: shadowSettings.designShadowEnabled,
        designShadowColor: shadowSettings.designShadowColor,
        contextShadowEnabled: shadowSettings.contextShadowEnabled,
        contextShadowColor: shadowSettings.contextShadowColor,
        onProgress: setStatus,
      };
      const result = await renderShadowPreview(options);
      setAreas(result.areas);
      setActive(true);
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
          {shadowSettings.contextShadowEnabled && areas.contextShadowArea > 0 && (
            <div>Context shadow: {formatArea(areas.contextShadowArea)}</div>
          )}
          {shadowSettings.designShadowEnabled && areas.designOnlyShadowArea > 0 && (
            <div>Design shadow (net new): {formatArea(areas.designOnlyShadowArea)}</div>
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
