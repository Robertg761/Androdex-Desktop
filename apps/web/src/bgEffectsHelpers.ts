// Helper functions for Perlin noise
export function bgNoise2d(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function bgSmoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = bgNoise2d(ix, iy);
  const b = bgNoise2d(ix + 1, iy);
  const cc = bgNoise2d(ix, iy + 1);
  const d = bgNoise2d(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy;
}

// Helpers to get CSS variables
export function getColor(): string {
  if (typeof document === "undefined") return "#9cdef2";
  const s = getComputedStyle(document.documentElement);
  return (
    s.getPropertyValue("--bg-effect-color").trim() || s.getPropertyValue("--fg").trim() || "#9cdef2"
  );
}

export function getBg(): string {
  if (typeof document === "undefined") return "#282c34";
  const s = getComputedStyle(document.documentElement);
  return s.getPropertyValue("--bg").trim() || "#282c34";
}

export function getEffectSize(): number {
  if (typeof document === "undefined") return 1;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--bg-effect-size"),
  );
  return isNaN(v) ? 1 : v;
}

export function getEffectIntensity(): number {
  if (typeof document === "undefined") return 1;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--bg-effect-intensity"),
  );
  return isNaN(v) ? 1 : v;
}

// Helper to construct a canvas and append it to the liquid-glass backdrop or body
export function createBgCanvas(id: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (document.getElementById(id)) return null;

  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;";

  const backdrop = document.querySelector(".liquid-glass-backdrop");
  if (backdrop) {
    backdrop.appendChild(canvas);
  } else {
    // Fallback to prepending to body with fixed positioning if backdrop is not rendered yet
    canvas.style.position = "fixed";
    document.body.prepend(canvas);
  }
  return canvas;
}

export function rgba(colorStr: string, a: number): string {
  const hex = colorStr.trim();
  if (hex.startsWith("#")) {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    if (h.length === 3) {
      const r = (n >> 8) & 15;
      const g = (n >> 4) & 15;
      const b = n & 15;
      return `rgba(${(r << 4) | r},${(g << 4) | g},${(b << 4) | b},${a})`;
    }
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  if (hex.startsWith("rgb")) {
    return hex;
  }
  return hex;
}
