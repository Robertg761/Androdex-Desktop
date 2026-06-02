import {
  initConstellations,
  initEmbers,
  initPerlinFlow,
  initPetals,
  initRain,
  initSparkles,
  initSynapse,
} from "./bgEffectsCanvas";

const CANVAS_PATTERNS: Record<string, () => void> = {
  synapse: initSynapse,
  rain: initRain,
  constellations: initConstellations,
  "perlin-flow": initPerlinFlow,
  petals: initPetals,
  sparkles: initSparkles,
  embers: initEmbers,
};

export function triggerBgPattern(pattern: string) {
  if (typeof document === "undefined") return;

  // Clean up any other active canvases
  document
    .querySelectorAll(
      "#synapse-canvas, #rain-canvas, #constellations-canvas, #perlin-flow-canvas, #petals-canvas, #sparkles-canvas, #embers-canvas",
    )
    .forEach((c) => c.remove());

  const initFn = CANVAS_PATTERNS[pattern];
  if (initFn) {
    initFn();
  }
}
