import { useState } from "preact/hooks";
import {
  renderShadowPreview,
  clearShadowPreview,
  ShadowPreviewOptions,
} from "../lib/shadow-preview";
import { ShadowColorSettings } from "./ColorControls";
import { formatTimeInProjectTz } from "../lib/format-utils";

type ShadowPreviewButtonProps = {
  shadowSettings: ShadowColorSettings;
  cellSize?: number;
  onShadowReady?: () => void;
};

export default function ShadowPreviewButton({
  shadowSettings,
  cellSize,
  onShadowReady,
}: ShadowPreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const [previewTime, setPreviewTime] = useState<string>("");

  const hasShadowColors =
    shadowSettings.designShadowEnabled || shadowSettings.contextShadowEnabled;

  const onClickPreview = async () => {
    if (active) {
      await clearShadowPreview();
      setActive(false);
      setStatus("");
      setPreviewTime("");
      return;
    }

    setLoading(true);
    setPreviewTime("");
    try {
      const options: ShadowPreviewOptions = {
        designShadowEnabled: shadowSettings.designShadowEnabled,
        designShadowColor: shadowSettings.designShadowColor,
        contextShadowEnabled: shadowSettings.contextShadowEnabled,
        contextShadowColor: shadowSettings.contextShadowColor,
        cellSize,
        onProgress: setStatus,
      };
      const result = await renderShadowPreview(options);
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
      {active && previewTime && (
        <div style={{ fontSize: "10px", color: "#3c3c3c", padding: "4px 0", fontStyle: "italic" }}>
          Preview at {previewTime}
        </div>
      )}
    </div>
  );
}
