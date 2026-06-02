import {
  DEFAULT_APP_ACCENT_COLOR,
  DEFAULT_APP_THEME_PRESET,
  type AppThemePreset,
} from "@t3tools/contracts/settings";

import { triggerBgPattern } from "./bgEffects";

const LEGACY_DEFAULT_APP_ACCENT_COLOR = "#111111";

export const APP_ACCENT_SWATCHES = [
  DEFAULT_APP_ACCENT_COLOR,
  "#e06c75",
  "#f85149",
  "#00ff41",
  "#e040fb",
  "#4facfe",
  "#c6613f",
  "#0ea5e9",
  "#16a34a",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#334155",
] as const;

type ThemeColors = {
  readonly bg: string;
  readonly fg: string;
  readonly panel: string;
  readonly border: string;
  readonly red: string;
  readonly advanced?: Partial<Record<AdvancedThemeKey, string>>;
};

type AdvancedThemeKey =
  | "aiBubbleBg"
  | "brandColor"
  | "bubbleBorder"
  | "codeBg"
  | "codeFg"
  | "hamburgerColor"
  | "inputBg"
  | "inputBorder"
  | "sendBtnBg"
  | "sendBtnHover"
  | "toggleActive"
  | "userBubbleBg";

type SyntaxColors = {
  readonly bg: string;
  readonly fg: string;
  readonly keyword: string;
  readonly string: string;
  readonly comment: string;
  readonly function: string;
  readonly number: string;
  readonly builtin: string;
  readonly variable: string;
  readonly params: string;
};

type BackgroundPattern =
  | "constellations"
  | "dots"
  | "embers"
  | "none"
  | "perlin-flow"
  | "petals"
  | "rain"
  | "sparkles"
  | "synapse";

type ThemeDefinition = {
  readonly label: string;
  readonly colors: ThemeColors;
};

const ADVANCED_CSS_KEYS: ReadonlyArray<{
  readonly key: AdvancedThemeKey;
  readonly css: string;
}> = [
  { key: "userBubbleBg", css: "--user-bubble-bg" },
  { key: "aiBubbleBg", css: "--ai-bubble-bg" },
  { key: "bubbleBorder", css: "--bubble-border" },
  { key: "brandColor", css: "--brand-color" },
  { key: "hamburgerColor", css: "--hamburger-color" },
  { key: "inputBg", css: "--input-bg" },
  { key: "inputBorder", css: "--input-border" },
  { key: "sendBtnBg", css: "--send-btn-bg" },
  { key: "sendBtnHover", css: "--send-btn-hover" },
  { key: "codeBg", css: "--code-bg" },
  { key: "codeFg", css: "--code-fg" },
  { key: "toggleActive", css: "--toggle-active" },
];

export const ODYSSEUS_THEME_ORDER = [
  "dark",
  "light",
  "midnight",
  "paper",
  "cyberpunk",
  "retrowave",
  "forest",
  "ocean",
  "ume",
  "copper",
  "terminal",
  "organs",
  "lavender",
  "gpt",
  "claude",
  "cute",
] as const satisfies readonly AppThemePreset[];

export const ODYSSEUS_THEME_PRESETS = {
  dark: {
    label: "Dark",
    colors: { bg: "#282c34", fg: "#9cdef2", panel: "#111111", border: "#355a66", red: "#e06c75" },
  },
  light: {
    label: "Light",
    colors: { bg: "#f0ebe3", fg: "#5a5248", panel: "#faf6f0", border: "#d4cdc2", red: "#c47d5a" },
  },
  midnight: {
    label: "Midnight",
    colors: { bg: "#0d1117", fg: "#c9d1d9", panel: "#161b22", border: "#30363d", red: "#f85149" },
  },
  paper: {
    label: "Paper",
    colors: { bg: "#faf8f5", fg: "#3b3836", panel: "#ffffff", border: "#d5d0c8", red: "#c5ac4a" },
  },
  cyberpunk: {
    label: "Cyberpunk",
    colors: { bg: "#0a0a0f", fg: "#0ff0fc", panel: "#12101a", border: "#9b30ff", red: "#e040fb" },
  },
  retrowave: {
    label: "Retrowave",
    colors: { bg: "#1a1a2e", fg: "#e94560", panel: "#16213e", border: "#533483", red: "#e94560" },
  },
  forest: {
    label: "Forest",
    colors: { bg: "#1b2a1b", fg: "#a8d5a2", panel: "#142414", border: "#3d6b3d", red: "#7cb871" },
  },
  ocean: {
    label: "Ocean",
    colors: { bg: "#0b1a2c", fg: "#64d2ff", panel: "#091422", border: "#1e5074", red: "#4facfe" },
  },
  ume: {
    label: "Ume",
    colors: { bg: "#2b1b2e", fg: "#f5c2e7", panel: "#1e1420", border: "#6c4675", red: "#f5a0c0" },
  },
  copper: {
    label: "Copper",
    colors: { bg: "#1c1410", fg: "#e8c39e", panel: "#140f0a", border: "#7a5533", red: "#d4764e" },
  },
  terminal: {
    label: "Terminal",
    colors: { bg: "#000000", fg: "#00ff41", panel: "#0a0a0a", border: "#003b00", red: "#00ff41" },
  },
  organs: {
    label: "Organs",
    colors: { bg: "#0a0406", fg: "#efe1c8", panel: "#15080a", border: "#3a1519", red: "#c83240" },
  },
  lavender: {
    label: "Lavender",
    colors: { bg: "#f3eef8", fg: "#3d3551", panel: "#faf7ff", border: "#cec3de", red: "#9b6dcc" },
  },
  gpt: {
    label: "GPT",
    colors: {
      bg: "#212121",
      fg: "#ececec",
      panel: "#171717",
      border: "#424242",
      red: "#949494",
      advanced: {
        aiBubbleBg: "#171717",
        inputBg: "#2f2f2f",
        sendBtnBg: "#949494",
        sendBtnHover: "#7f7f7f",
        userBubbleBg: "#2f2f2f",
      },
    },
  },
  claude: {
    label: "Claude",
    colors: { bg: "#262624", fg: "#f5f4f0", panel: "#30302e", border: "#4a4a47", red: "#c6613f" },
  },
  cute: {
    label: "Cute",
    colors: { bg: "#fff0f5", fg: "#d4608a", panel: "#fff8fa", border: "#f0c0d0", red: "#ff6b9d" },
  },
} as const satisfies Record<AppThemePreset, ThemeDefinition>;

export const ODYSSEUS_THEME_OPTIONS = ODYSSEUS_THEME_ORDER.map((value) => ({
  value,
  label: ODYSSEUS_THEME_PRESETS[value].label,
  colors: ODYSSEUS_THEME_PRESETS[value].colors,
}));

const THEME_DEFAULT_PATTERN: Partial<Record<AppThemePreset, BackgroundPattern>> = {
  cyberpunk: "synapse",
  dark: "none",
  forest: "petals",
  light: "dots",
  midnight: "rain",
  ocean: "constellations",
  organs: "rain",
  paper: "dots",
  retrowave: "embers",
  terminal: "perlin-flow",
  ume: "petals",
  cute: "sparkles",
};

const THEME_DEFAULT_EFFECT_COLOR: Partial<Record<AppThemePreset, string>> = {
  midnight: "#ffffff",
  organs: "#451616",
  cute: "#ff8cb8",
  ume: "#f5a0c0",
};

const THEME_DEFAULT_INTENSITY: Partial<Record<AppThemePreset, number>> = {
  midnight: 0.5,
  terminal: 0.8,
  organs: 0.65,
};

const THEME_DEFAULT_FROSTED: Partial<Record<AppThemePreset, boolean>> = {
  lavender: true,
};

export function normalizeAppAccentColor(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return DEFAULT_APP_ACCENT_COLOR;
  if (trimmed === LEGACY_DEFAULT_APP_ACCENT_COLOR) return DEFAULT_APP_ACCENT_COLOR;
  return /^#[0-9a-fA-F]{6}$/u.test(trimmed) ? trimmed.toLowerCase() : DEFAULT_APP_ACCENT_COLOR;
}

export function normalizeAppThemePreset(value: string | undefined): AppThemePreset {
  const trimmed = value?.trim().toLowerCase();
  return (
    ODYSSEUS_THEME_ORDER.find((themeName) => themeName === trimmed) ?? DEFAULT_APP_THEME_PRESET
  );
}

export function getOdysseusThemePreset(value: string | undefined): ThemeDefinition {
  return ODYSSEUS_THEME_PRESETS[normalizeAppThemePreset(value)];
}

function resolveReadableForeground(hexColor: string): "#111111" | "#ffffff" {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111111" : "#ffffff";
}

function hexToHsl(hexColor: string): readonly [number, number, number] {
  const hex = hexColor.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }

  return [hue * 360, saturation * 100, lightness * 100];
}

function byteToHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${byteToHex(f(0) * 255)}${byteToHex(f(8) * 255)}${byteToHex(f(4) * 255)}`;
}

function deriveSyntaxColors(colors: ThemeColors): SyntaxColors {
  const [fgH, fgS, fgL] = hexToHsl(colors.fg);
  const [bgH, bgS, bgL] = hexToHsl(colors.bg);
  const [redH, redS] = hexToHsl(colors.red);
  const isDark = bgL < 50;
  const codeBgL = isDark ? Math.max(bgL - 4, 0) : Math.min(bgL + 4, 100);
  return {
    bg: hslToHex(bgH, bgS, codeBgL),
    fg: colors.fg,
    keyword: hslToHex((redH + 280) % 360, Math.min(redS + 10, 80), isDark ? 70 : 45),
    string: hslToHex(40, Math.min(fgS + 20, 70), isDark ? 72 : 42),
    comment: hslToHex(fgH, Math.max(fgS - 20, 5), fgL * 0.5 + bgL * 0.5),
    function: hslToHex(210, Math.min(fgS + 20, 75), isDark ? 70 : 45),
    number: hslToHex(20, Math.min(fgS + 15, 65), isDark ? 68 : 48),
    builtin: hslToHex(180, Math.min(fgS + 15, 60), isDark ? 65 : 40),
    variable: hslToHex((fgH + 30) % 360, Math.min(fgS + 5, 60), fgL),
    params: hslToHex(
      fgH,
      Math.max(fgS - 5, 10),
      isDark ? Math.min(fgL + 8, 85) : Math.max(fgL - 8, 25),
    ),
  };
}

function computeAdvancedDefaults(colors: ThemeColors): Record<AdvancedThemeKey, string> {
  const syntaxColors = deriveSyntaxColors(colors);
  return {
    aiBubbleBg: colors.panel,
    brandColor: colors.red,
    bubbleBorder: colors.border,
    codeBg: syntaxColors.bg,
    codeFg: syntaxColors.fg,
    hamburgerColor: colors.fg,
    inputBg: colors.panel,
    inputBorder: colors.border,
    sendBtnBg: colors.red,
    sendBtnHover: colors.red,
    toggleActive: colors.red,
    userBubbleBg: colors.bg,
  };
}

function setProperties(style: CSSStyleDeclaration, properties: Readonly<Record<string, string>>) {
  for (const [property, value] of Object.entries(properties)) {
    style.setProperty(property, value);
  }
}

export function applyAppThemePreset(value: string | undefined): ThemeDefinition {
  const themeName = normalizeAppThemePreset(value);
  const theme = ODYSSEUS_THEME_PRESETS[themeName];
  if (typeof document === "undefined") return theme;

  const colors: ThemeColors = theme.colors;
  const syntaxColors = deriveSyntaxColors(colors);
  const advancedDefaults = computeAdvancedDefaults(colors);
  const isDark = hexToHsl(colors.bg)[2] < 50;
  const root = document.documentElement;
  const style = root.style;

  root.dataset.appThemePreset = themeName;
  root.dataset.appThemeMode = isDark ? "dark" : "light";
  root.style.colorScheme = isDark ? "dark" : "light";

  setProperties(style, {
    "--bg": colors.bg,
    "--fg": colors.fg,
    "--panel": colors.panel,
    "--border": colors.border,
    "--red": colors.red,
    "--green": "#50fa7b",
    "--warn": "#f0ad4e",
    "--color-error": "#ff4444",
    "--color-error-light": "#ff6666",
    "--color-success": "#4caf50",
    "--color-warning": "#f0ad4e",
    "--color-danger": "#c0392b",
    "--color-recording": "#ff3b30",
    "--color-recording-hover": "#d63031",
    "--color-muted": "#888888",
    "--color-muted-alt": "#6b7280",
    "--color-accent": "#00aaff",
    "--color-agent-active": "#00ff00",
    "--color-brand-blue": "#3b82f6",
    "--color-blind-orange": "#ff9800",
    "--color-save-green": "#4caf50",
    "--color-link-hover": "#66c7ff",
    "--color-subheader": "#6b8a94",
    "--accent-warm": "#d19a66",
    "--accent-primary": colors.red,
    "--accent-error": "#ff4444",
    "--odysseus-theme-accent": colors.red,

    "--hl-bg": syntaxColors.bg,
    "--hl-fg": syntaxColors.fg,
    "--hl-keyword": syntaxColors.keyword,
    "--hl-string": syntaxColors.string,
    "--hl-comment": syntaxColors.comment,
    "--hl-function": syntaxColors.function,
    "--hl-number": syntaxColors.number,
    "--hl-builtin": syntaxColors.builtin,
    "--hl-variable": syntaxColors.variable,
    "--hl-params": syntaxColors.params,

    "--background": "color-mix(in srgb, var(--bg) 94%, var(--panel))",
    "--app-chrome-background": "var(--bg)",
    "--foreground": "var(--fg)",
    "--card": "color-mix(in srgb, var(--panel) 88%, transparent)",
    "--card-foreground": "var(--fg)",
    "--popover": "color-mix(in srgb, var(--panel) 96%, var(--bg))",
    "--popover-foreground": "var(--fg)",
    "--primary": colors.red,
    "--primary-foreground": resolveReadableForeground(colors.red),
    "--secondary": "color-mix(in srgb, var(--fg) 8%, transparent)",
    "--secondary-foreground": "color-mix(in srgb, var(--fg) 82%, transparent)",
    "--muted": "color-mix(in srgb, var(--fg) 6%, transparent)",
    "--muted-foreground": "color-mix(in srgb, var(--fg) 58%, transparent)",
    "--accent": "color-mix(in srgb, var(--red) 14%, transparent)",
    "--accent-foreground": "var(--fg)",
    "--destructive": "var(--color-error)",
    "--destructive-foreground": "var(--color-error-light)",
    "--input": "color-mix(in srgb, var(--border) 82%, transparent)",
    "--ring": colors.red,
    "--sidebar": "color-mix(in srgb, var(--sidebar-bg, var(--panel)) 92%, transparent)",
    "--sidebar-foreground": "var(--fg)",
    "--sidebar-border": "color-mix(in srgb, var(--border) 86%, transparent)",
    "--sidebar-accent": "color-mix(in srgb, var(--red) 13%, transparent)",
    "--sidebar-accent-foreground": "var(--fg)",
    "--info": "var(--hl-function)",
    "--info-foreground": "var(--hl-function)",
    "--success": "var(--color-success)",
    "--success-foreground": "var(--color-success)",
    "--warning": "var(--color-warning)",
    "--warning-foreground": "var(--color-warning)",

    "--font-family": "'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    "--glass-tint": "color-mix(in srgb, var(--panel) 62%, transparent)",
    "--glass-tint-strong": "color-mix(in srgb, var(--panel) 82%, transparent)",
    "--glass-readable-tint": "color-mix(in srgb, var(--panel) 92%, var(--bg))",
    "--glass-floating-tint": "color-mix(in srgb, var(--panel) 98%, var(--bg))",
    "--glass-floating-tint-strong": "color-mix(in srgb, var(--panel) 100%, var(--bg))",
    "--glass-border": "color-mix(in srgb, var(--border) 88%, transparent)",
    "--glass-border-strong": "color-mix(in srgb, var(--fg) 24%, var(--border))",
    "--glass-highlight": "color-mix(in srgb, var(--fg) 24%, transparent)",
    "--glass-lowlight": "color-mix(in srgb, #000000 46%, transparent)",
    "--glass-shadow":
      "0 16px 48px color-mix(in srgb, #000000 32%, transparent), 0 3px 10px color-mix(in srgb, #000000 20%, transparent)",
    "--glass-shadow-floating":
      "0 24px 70px color-mix(in srgb, #000000 44%, transparent), 0 10px 24px color-mix(in srgb, #000000 28%, transparent)",
    "--glass-blur": "18px",
    "--glass-saturate": "155%",
    "--glass-texture-opacity": "0.1",
    "--glass-mesh-opacity": "0.82",
    "--glass-specular-opacity": "0.48",
    "--glass-mesh-silver": "color-mix(in srgb, var(--fg) 10%, transparent)",
    "--glass-mesh-cool": "color-mix(in srgb, var(--red) 12%, transparent)",
    "--glass-mesh-depth": "color-mix(in srgb, var(--border) 22%, transparent)",
  });

  for (const { key, css } of ADVANCED_CSS_KEYS) {
    style.setProperty(css, colors.advanced?.[key] ?? advancedDefaults[key]);
  }

  const pattern = THEME_DEFAULT_PATTERN[themeName] ?? "none";
  document.body.dataset.bgPattern = pattern;
  triggerBgPattern(pattern);
  document.body.classList.toggle("theme-frosted", THEME_DEFAULT_FROSTED[themeName] === true);
  style.setProperty("--bg-effect-color", THEME_DEFAULT_EFFECT_COLOR[themeName] ?? colors.fg);
  style.setProperty("--bg-effect-intensity", String(THEME_DEFAULT_INTENSITY[themeName] ?? 1));
  style.setProperty("--bg-effect-size", "1");

  const themeColor = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
  if (themeColor) {
    themeColor.content = colors.bg;
  }

  return theme;
}

export function applyAppAccentColor(value: string | undefined, fallbackColor?: string): void {
  if (typeof document === "undefined") return;
  const accentColor = normalizeAppAccentColor(value);
  const fallbackAccentColor = normalizeAppAccentColor(fallbackColor);
  const effectiveAccentColor =
    accentColor === DEFAULT_APP_ACCENT_COLOR ? fallbackAccentColor : accentColor;
  document.documentElement.style.setProperty("--accent-primary", effectiveAccentColor);
  document.documentElement.style.setProperty("--red", effectiveAccentColor);
  document.documentElement.style.setProperty("--send-btn-bg", effectiveAccentColor);
  document.documentElement.style.setProperty("--send-btn-hover", effectiveAccentColor);
  document.documentElement.style.setProperty("--toggle-active", effectiveAccentColor);
  document.documentElement.style.setProperty("--brand-color", effectiveAccentColor);
  document.documentElement.style.setProperty("--ring", effectiveAccentColor);
  document.documentElement.style.setProperty("--primary", effectiveAccentColor);
  document.documentElement.style.setProperty(
    "--primary-foreground",
    resolveReadableForeground(effectiveAccentColor),
  );
}
