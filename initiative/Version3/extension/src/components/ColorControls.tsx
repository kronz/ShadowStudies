import { Forma } from "forma-embedded-view-sdk/auto";
import { useEffect, useState, useCallback } from "preact/hooks";
import {
  getDesignElementPaths,
  getContextElementPaths,
  subscribeToProposalChanges,
} from "../lib/element-classifier";

// Re-exported for other components that import ShadowColorSettings from here

const debounce = <F extends (...args: any[]) => ReturnType<F>>(func: F, waitFor: number) => {
  let timeout: number | undefined;
  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
};

async function colorGround(color: string) {
  const bbox = await Forma.terrain.getBbox();
  const canvas = document.createElement("canvas");
  const width = bbox.max.x - bbox.min.x;
  const height = bbox.max.y - bbox.min.y;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return await Forma.terrain.groundTexture.add({
    name: "shadow-study",
    canvas: canvas,
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1 },
  });
}

export type ShadowColorSettings = {
  contextShadowEnabled: boolean;
  contextShadowColor: string;
  designShadowEnabled: boolean;
  designShadowColor: string;
};

type ColorControlsProps = {
  designPaths: string[];
  onShadowSettingsChange: (settings: ShadowColorSettings) => void;
  onBuildingColorsChange?: (colors: Map<string, string>) => void;
};

export default function ColorControls({ designPaths: designPathOverrides, onShadowSettingsChange, onBuildingColorsChange }: ColorControlsProps) {
  const [contextBuildingEnabled, setContextBuildingEnabled] = useState(false);
  const [contextBuildingColor, setContextBuildingColor] = useState("#e5c185");
  const [designBuildingEnabled, setDesignBuildingEnabled] = useState(false);
  const [designBuildingColor, setDesignBuildingColor] = useState("#f0daa5");
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [terrainColor, setTerrainColor] = useState("#fbf2c4");

  const [contextShadowEnabled, setContextShadowEnabled] = useState(false);
  const [contextShadowColor, setContextShadowColor] = useState("#b8cdab");
  const [designShadowEnabled, setDesignShadowEnabled] = useState(false);
  const [designShadowColor, setDesignShadowColor] = useState("#004343");

  const [designPaths, setDesignPaths] = useState<string[]>([]);
  const [contextPaths, setContextPaths] = useState<string[]>([]);

  useEffect(() => {
    const loadPaths = async () => {
      const overrides = designPathOverrides.length > 0 ? designPathOverrides : undefined;
      const [design, context] = await Promise.all([
        getDesignElementPaths(overrides),
        getContextElementPaths(overrides),
      ]);
      setDesignPaths(design);
      setContextPaths(context);
    };
    loadPaths();
    return subscribeToProposalChanges(loadPaths);
  }, [designPathOverrides]);

  const propagateShadowSettings = useCallback(() => {
    onShadowSettingsChange({
      contextShadowEnabled,
      contextShadowColor,
      designShadowEnabled,
      designShadowColor,
    });
  }, [contextShadowEnabled, contextShadowColor, designShadowEnabled, designShadowColor]);

  useEffect(() => {
    propagateShadowSettings();
  }, [propagateShadowSettings]);

  useEffect(() => {
    Forma.render.elementColors.clearAll();

    const pathsToColor = new Map<string, string>();
    if (contextBuildingEnabled) {
      for (const path of contextPaths) {
        pathsToColor.set(path, contextBuildingColor);
      }
    }
    if (designBuildingEnabled) {
      for (const path of designPaths) {
        pathsToColor.set(path, designBuildingColor);
      }
    }

    if (pathsToColor.size > 0) {
      Forma.render.elementColors.set({ pathsToColor });
    }

    onBuildingColorsChange?.(pathsToColor);
  }, [
    contextBuildingEnabled,
    contextBuildingColor,
    designBuildingEnabled,
    designBuildingColor,
    contextPaths,
    designPaths,
  ]);

  useEffect(() => {
    if (terrainEnabled) {
      colorGround(terrainColor);
    } else {
      Forma.terrain.groundTexture.remove({ name: "shadow-study" });
    }
  }, [terrainEnabled, terrainColor]);

  return (
    <>
      <div class="section-header">Building Colors</div>
      <ColorRow
        label="Context buildings:"
        enabled={contextBuildingEnabled}
        color={contextBuildingColor}
        onToggle={setContextBuildingEnabled}
        onColor={setContextBuildingColor}
      />
      <ColorRow
        label="Design buildings:"
        enabled={designBuildingEnabled}
        color={designBuildingColor}
        onToggle={setDesignBuildingEnabled}
        onColor={setDesignBuildingColor}
      />
      <ColorRow
        label="Terrain:"
        enabled={terrainEnabled}
        color={terrainColor}
        onToggle={setTerrainEnabled}
        onColor={setTerrainColor}
      />

      <div class="section-header">Shadow Colors (Export)</div>
      <ColorRow
        label="Context shadows:"
        enabled={contextShadowEnabled}
        color={contextShadowColor}
        onToggle={setContextShadowEnabled}
        onColor={setContextShadowColor}
      />
      <ColorRow
        label="Design shadows:"
        enabled={designShadowEnabled}
        color={designShadowColor}
        onToggle={setDesignShadowEnabled}
        onColor={setDesignShadowColor}
      />
    </>
  );
}

type ColorRowProps = {
  label: string;
  enabled: boolean;
  color: string;
  onToggle: (v: boolean) => void;
  onColor: (v: string) => void;
};

function ColorRow({ label, enabled, color, onToggle, onColor }: ColorRowProps) {
  return (
    <div class="row">
      <div class="row-title" style={{ width: "50%" }}>
        {label}
      </div>
      <div class="row-item">
        <weave-checkbox
          checked={enabled}
          onChange={(e) => onToggle(e.detail.checked)}
        ></weave-checkbox>
        <input
          type="color"
          class="color-picker"
          value={color}
          onInput={debounce((e: Event) => {
            if (e.target instanceof HTMLInputElement) onColor(e.target.value);
          }, 50)}
        />
      </div>
    </div>
  );
}
