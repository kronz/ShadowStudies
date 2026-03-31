import { Forma } from "forma-embedded-view-sdk/auto";
import { getDesignElementPaths } from "./element-classifier";

/**
 * Sentinel color used to mask design building body pixels.
 * Chosen to be far from any natural scene color so it's easy to
 * detect unambiguously.
 */
const SENTINEL_COLOR = "#ff00ff";
const SENTINEL_R = 255;
const SENTINEL_G = 0;
const SENTINEL_B = 255;

/**
 * How close a pixel must be to the sentinel color to be classified
 * as building body (per-channel Euclidean distance).
 */
const SENTINEL_TOLERANCE = 30;

/**
 * Luminance difference required for a pixel to be classified as
 * a design shadow. Needs empirical tuning per scene.
 */
const SHADOW_DIFF_THRESHOLD = 15;

/**
 * Maximum luminance in the context-only capture for a pixel to be
 * classified as a context shadow. Needs empirical tuning per scene.
 */
const CONTEXT_SHADOW_LUMINANCE_CEILING = 180;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

async function captureScene(width: number, height: number): Promise<HTMLCanvasElement> {
  return Forma.camera.capture({ width, height });
}

function isSentinel(r: number, g: number, b: number): boolean {
  const dr = r - SENTINEL_R;
  const dg = g - SENTINEL_G;
  const db = b - SENTINEL_B;
  return Math.sqrt(dr * dr + dg * dg + db * db) < SENTINEL_TOLERANCE;
}

/**
 * Three-capture pipeline for shadow isolation:
 *
 * 1. MASK capture: color design buildings with a sentinel color,
 *    capture the scene. Sentinel pixels = building body to exclude.
 * 2. FULL capture: restore any user-applied colors, capture with all
 *    buildings + shadows. This is the "natural" image the export is
 *    based on.
 * 3. CONTEXT capture: hide design buildings, capture. Only context
 *    buildings and their shadows remain.
 *
 * User-applied element colors are saved before step 1 and restored
 * after step 2, so the sentinel colors don't leak into the final
 * export image or persist in the scene.
 *
 * @param userColors Optional map of element paths to user-applied
 *   hex colors (from ColorControls). If provided, these are restored
 *   after the mask capture.
 */
export async function captureShadowTriple(
  width: number,
  height: number,
  userColors?: Map<string, string>,
): Promise<{
  mask: HTMLCanvasElement;
  full: HTMLCanvasElement;
  contextOnly: HTMLCanvasElement;
  designPaths: string[];
}> {
  const designPaths = await getDesignElementPaths();

  // Step 1: Sentinel mask — color design buildings magenta
  const sentinelColors = new Map<string, string>();
  for (const path of designPaths) {
    sentinelColors.set(path, SENTINEL_COLOR);
  }
  if (sentinelColors.size > 0) {
    await Forma.render.elementColors.set({ pathsToColor: sentinelColors });
  }
  const mask = await captureScene(width, height);

  // Step 2: Full scene — restore user colors (or clear), capture natural
  await Forma.render.elementColors.clearAll();
  if (userColors && userColors.size > 0) {
    await Forma.render.elementColors.set({ pathsToColor: userColors });
  }
  const full = await captureScene(width, height);

  // Step 3: Context only — hide design buildings
  for (const path of designPaths) {
    await Forma.render.hideElement({ path });
  }
  const contextOnly = await captureScene(width, height);

  // Restore: unhide everything
  for (const path of designPaths) {
    await Forma.render.unhideElement({ path });
  }

  return { mask, full, contextOnly, designPaths };
}

export type ShadowRecolorOptions = {
  designShadowEnabled: boolean;
  designShadowColor: string;
  contextShadowEnabled: boolean;
  contextShadowColor: string;
};

/**
 * Identifies and recolors shadow pixels using three captures.
 *
 * Per pixel:
 * 1. If the mask capture has sentinel color → building body, skip.
 * 2. Compare full vs contextOnly luminance. If full is significantly
 *    darker → design shadow (exists only when design buildings present).
 * 3. If the pixel is dark in contextOnly → context shadow.
 * 4. Otherwise → no shadow, keep original pixel.
 */
export function recolorShadows(
  mask: HTMLCanvasElement,
  full: HTMLCanvasElement,
  contextOnly: HTMLCanvasElement,
  options: ShadowRecolorOptions,
): HTMLCanvasElement {
  const width = full.width;
  const height = full.height;

  const maskData = mask.getContext("2d")!.getImageData(0, 0, width, height).data;
  const fullData = full.getContext("2d")!.getImageData(0, 0, width, height).data;
  const ctxData = contextOnly.getContext("2d")!.getImageData(0, 0, width, height).data;

  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const ctxResult = result.getContext("2d")!;
  const resultImg = ctxResult.createImageData(width, height);
  const out = resultImg.data;

  const designRgb = hexToRgb(options.designShadowColor);
  const contextRgb = hexToRgb(options.contextShadowColor);

  for (let i = 0; i < fullData.length; i += 4) {
    const rF = fullData[i];
    const gF = fullData[i + 1];
    const bF = fullData[i + 2];
    const aF = fullData[i + 3];

    // Building body mask: if sentinel in the mask capture, keep original pixel
    if (isSentinel(maskData[i], maskData[i + 1], maskData[i + 2])) {
      out[i] = rF;
      out[i + 1] = gF;
      out[i + 2] = bF;
      out[i + 3] = aF;
      continue;
    }

    const rC = ctxData[i];
    const gC = ctxData[i + 1];
    const bC = ctxData[i + 2];

    const lumFull = luminance(rF, gF, bF);
    const lumCtx = luminance(rC, gC, bC);
    const lumDiff = lumCtx - lumFull;

    const isDesignShadow = lumDiff > SHADOW_DIFF_THRESHOLD;
    const isContextShadow = !isDesignShadow && lumCtx < CONTEXT_SHADOW_LUMINANCE_CEILING;

    if (isDesignShadow && options.designShadowEnabled) {
      const blendAlpha = Math.min(lumDiff / 80, 0.85);
      out[i] = Math.round(rF * (1 - blendAlpha) + designRgb[0] * blendAlpha);
      out[i + 1] = Math.round(gF * (1 - blendAlpha) + designRgb[1] * blendAlpha);
      out[i + 2] = Math.round(bF * (1 - blendAlpha) + designRgb[2] * blendAlpha);
      out[i + 3] = aF;
    } else if (isContextShadow && options.contextShadowEnabled) {
      const shadowIntensity = 1 - lumCtx / 255;
      const blendAlpha = Math.min(shadowIntensity * 1.2, 0.7);
      out[i] = Math.round(rF * (1 - blendAlpha) + contextRgb[0] * blendAlpha);
      out[i + 1] = Math.round(gF * (1 - blendAlpha) + contextRgb[1] * blendAlpha);
      out[i + 2] = Math.round(bF * (1 - blendAlpha) + contextRgb[2] * blendAlpha);
      out[i + 3] = aF;
    } else {
      out[i] = rF;
      out[i + 1] = gF;
      out[i + 2] = bF;
      out[i + 3] = aF;
    }
  }

  ctxResult.putImageData(resultImg, 0, 0);
  return result;
}

/**
 * Full pipeline: three-capture, mask, diff, recolor.
 *
 * @param userColors Optional map of element paths to user-applied hex
 *   colors. Pass this so the pipeline can restore building colors after
 *   the sentinel mask capture.
 */
export async function captureWithShadowRecolor(
  width: number,
  height: number,
  options: ShadowRecolorOptions,
  userColors?: Map<string, string>,
): Promise<HTMLCanvasElement> {
  const hasShadowRecolor = options.designShadowEnabled || options.contextShadowEnabled;

  if (!hasShadowRecolor) {
    return captureScene(width, height);
  }

  const { mask, full, contextOnly } = await captureShadowTriple(width, height, userColors);
  return recolorShadows(mask, full, contextOnly, options);
}
