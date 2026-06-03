import { findFirstCommand, hasCommand, runWithDisplayInput, runWithInput } from "./processUtils.ts";

const COMMAND_MODIFIERS = new Set(["cmd", "command", "meta"]);
const MODIFIERS = new Set(["alt", "cmd", "command", "control", "ctrl", "meta", "option", "shift"]);

export function clipboardDependency(): ReturnType<typeof findFirstCommand> {
  return findFirstCommand(["xclip", "xsel", "wl-copy"]);
}

export function x11ClipboardDependency(): ReturnType<typeof findFirstCommand> {
  if (process.env.WAYLAND_DISPLAY) {
    return findFirstCommand(["xclip", "xsel", "wl-copy"]);
  }
  return findFirstCommand(["xclip", "xsel"]);
}

export function waylandClipboardDependency(): ReturnType<typeof findFirstCommand> {
  return findFirstCommand(["wl-copy"]);
}

export function normalizeLinuxShortcutKeys(keys: readonly string[]): ReadonlyArray<string> {
  const hasCommandModifier = keys.some((key) => COMMAND_MODIFIERS.has(key.toLowerCase()));
  const hasNonModifier = keys.some((key) => !MODIFIERS.has(key.toLowerCase()));
  if (!hasCommandModifier || !hasNonModifier) {
    return keys;
  }
  return keys.map((key) => (COMMAND_MODIFIERS.has(key.toLowerCase()) ? "ctrl" : key));
}

export function normalizeX11Key(key: string): string {
  const lowered = key.toLowerCase();
  switch (lowered) {
    case "ctrl":
    case "control":
      return "ctrl";
    case "cmd":
    case "command":
    case "meta":
      return "super";
    case "option":
    case "alt":
      return "alt";
    case "return":
      return "Return";
    case "escape":
    case "esc":
      return "Escape";
    case "backspace":
      return "BackSpace";
    case "delete":
      return "Delete";
    case "tab":
      return "Tab";
    case "space":
      return "space";
    default:
      return key.length === 1 ? key : lowered;
  }
}

export function normalizeX11KeySequence(keys: readonly string[]): string {
  return normalizeLinuxShortcutKeys(keys).map(normalizeX11Key).join("+");
}

export async function setX11Clipboard(display: string, text: string): Promise<void> {
  if (hasCommand("xclip")) {
    await runWithDisplayInput(display, "xclip", ["-selection", "clipboard"], text);
    return;
  }
  if (hasCommand("xsel")) {
    await runWithDisplayInput(display, "xsel", ["--clipboard", "--input"], text);
    return;
  }
  if (process.env.WAYLAND_DISPLAY && hasCommand("wl-copy")) {
    await runWithInput("wl-copy", [], text);
    return;
  }
  throw new Error("No X11 clipboard command is available. Install xclip, xsel, or wl-clipboard.");
}

export async function setWaylandClipboard(text: string, seat?: string): Promise<void> {
  if (hasCommand("wl-copy")) {
    await runWithInput("wl-copy", seat ? ["--seat", seat] : [], text);
    return;
  }
  throw new Error("No Wayland clipboard command is available. Install wl-clipboard.");
}
