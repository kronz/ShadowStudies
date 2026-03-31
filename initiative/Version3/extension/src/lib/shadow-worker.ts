/// <reference lib="webworker" />
import { castShadowRays } from "./ray-caster";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent) => {
  const { grid, buildings, sun } = e.data;
  const classifications = castShadowRays(grid, buildings, sun);
  ctx.postMessage(classifications, [classifications.buffer]);
};
