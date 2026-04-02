import { Forma } from "forma-embedded-view-sdk/auto";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { DateTime } from "luxon";
import { useState } from "preact/hooks";
import { MatrixConfig, getMatrixTimeSteps, matrixStepFilename } from "./MatrixSelector";
import { captureFrameWithShadows, ShadowExportOptions } from "../lib/shadow-export";
import { prepareScene, type SceneCache } from "../lib/shadow-pipeline";
import { clearShadowPreview } from "../lib/shadow-preview";
import { ShadowColorSettings } from "./ColorControls";

type ExportButtonProps = {
  mode: "matrix" | "custom";
  month: number;
  day: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  resolution: string;
  interval: number;
  matrixConfig: MatrixConfig;
  shadowSettings: ShadowColorSettings;
  buildingColors: Map<string, string>;
  cellSize?: number;
};

export default function ExportButton(props: ExportButtonProps) {
  const {
    mode,
    month,
    day,
    startHour,
    startMinute,
    endHour,
    endMinute,
    resolution,
    interval,
    matrixConfig,
    shadowSettings,
  } = props;

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  const shadowOptions: ShadowExportOptions = {
    designShadowEnabled: shadowSettings.designShadowEnabled,
    designShadowColor: shadowSettings.designShadowColor,
    contextShadowEnabled: shadowSettings.contextShadowEnabled,
    contextShadowColor: shadowSettings.contextShadowColor,
    cellSize: props.cellSize,
  };

  const width = parseInt(resolution.split("x")[0], 10);
  const height = parseInt(resolution.split("x")[1], 10);

  const onClickExport = async () => {
    setExporting(true);
    try {
      await clearShadowPreview();

      const projectTimezone = await Forma.project.getTimezone();
      if (!projectTimezone) {
        throw new Error("Unable to access project timezone");
      }
      const currentDate = await Forma.sun.getDate();
      const year = currentDate.getFullYear();

      setProgress("Preparing scene geometry...");
      const cache = await prepareScene(setProgress, props.cellSize);

      const zip = new JSZip();
      const zipFolder = zip.folder("shadow-study") as JSZip;

      if (mode === "matrix") {
        await exportMatrix(zipFolder, year, projectTimezone, cache);
      } else {
        await exportCustomRange(zipFolder, year, projectTimezone, cache);
      }

      const folderName = mode === "matrix"
        ? "Shadow study - 3x3 Matrix.zip"
        : `Shadow study - ${DateTime.fromObject(
            { year, month, day },
            { zone: projectTimezone },
          ).toLocaleString({ month: "long", day: "2-digit" })}.zip`;

      zipFolder.generateAsync({ type: "blob" }).then((content) => saveAs(content, folderName));

      await Forma.sun.setDate({ date: currentDate });
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  async function exportMatrix(
    zipFolder: JSZip,
    year: number,
    projectTimezone: string,
    cache: SceneCache,
  ) {
    const steps = getMatrixTimeSteps(matrixConfig);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setProgress(`Capturing ${i + 1}/${steps.length}: ${step.label}`);

      const dt = DateTime.fromObject(
        { year, month: step.month, day: step.day, hour: step.hour, minute: step.minute },
        { zone: projectTimezone },
      );

      const { canvas } = await captureFrameWithShadows(
        dt.toJSDate(),
        width,
        height,
        shadowOptions,
        setProgress,
        cache,
      );
      const data = canvas.toDataURL().split("base64,")[1];
      zipFolder.file(matrixStepFilename(step), data, { base64: true });
    }
  }

  async function exportCustomRange(
    zipFolder: JSZip,
    year: number,
    projectTimezone: string,
    cache: SceneCache,
  ) {
    let current = DateTime.fromObject(
      { year, month, day, hour: startHour, minute: startMinute },
      { zone: projectTimezone },
    );
    const endDate = DateTime.fromObject(
      { year, month, day, hour: endHour, minute: endMinute },
      { zone: projectTimezone },
    );

    let stepCount = 0;
    let temp = current;
    while (temp.toMillis() <= endDate.toMillis()) {
      stepCount++;
      temp = temp.plus({ minutes: interval });
    }

    let stepIndex = 0;
    while (current.toMillis() <= endDate.toMillis()) {
      stepIndex++;
      setProgress(`Capturing ${stepIndex}/${stepCount}: ${current.toFormat("HH:mm")}`);

      const { canvas } = await captureFrameWithShadows(
        current.toJSDate(),
        width,
        height,
        shadowOptions,
        setProgress,
        cache,
      );
      const filename = `${current.toFormat("HH-mm")}.png`;
      const data = canvas.toDataURL().split("base64,")[1];
      zipFolder.file(filename, data, { base64: true });

      current = current.plus({ minutes: interval });
    }
  }

  return (
    <div class="row" style={{ flexDirection: "column", height: "auto", gap: "4px" }}>
      <weave-button variant="solid" onClick={onClickExport} disabled={exporting}>
        {exporting ? "Exporting..." : `Export ${mode === "matrix" ? "3×3 matrix" : "images"}`}
      </weave-button>
      {progress && (
        <div style={{ fontSize: "10px", color: "#3c3c3cb2", textAlign: "center" }}>
          {progress}
        </div>
      )}
    </div>
  );
}
