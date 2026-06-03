// @effect-diagnostics nodeBuiltinImport:off
import * as NodeTimers from "node:timers/promises";

import type {
  ComputerUseAction,
  ComputerUseDriverHealth,
  ComputerUseTarget,
} from "@t3tools/contracts";

import type {
  ComputerUseDriver,
  ComputerUseDriverSession,
  ComputerUseScreenshotBytes,
} from "./ComputerUseDriver.ts";
import {
  findCommand,
  findFirstCommand,
  hasCommand,
  readPngFromTempFile,
  runChecked,
} from "./processUtils.ts";
import {
  normalizeLinuxShortcutKeys,
  setWaylandClipboard,
  waylandClipboardDependency,
} from "./linuxInput.ts";

interface WaylandSession extends ComputerUseDriverSession {
  readonly screenshotCommand: "spectacle" | "grim";
  readonly targetWindowId?: string;
}

interface KWinPluginHealth {
  readonly ok?: boolean;
  readonly running?: boolean;
  readonly service?: string;
  readonly path?: string;
  readonly interface?: string;
  readonly seat?: string;
  readonly eventSeat?: string;
  readonly overlay?: boolean;
  readonly workspace?: boolean;
  readonly effects?: boolean;
}

interface KWinPluginWindow {
  readonly id: string;
  readonly title: string;
  readonly appId?: string;
  readonly resourceClass?: string;
  readonly pid?: number;
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly visible?: boolean;
  readonly focusable?: boolean;
  readonly normal?: boolean;
  readonly desktop?: boolean;
  readonly dock?: boolean;
  readonly minimized?: boolean;
}

const DEFAULT_WIDTH = 0;
const DEFAULT_HEIGHT = 0;
const KWIN_SERVICE = "org.t3tools.Androdex.ComputerUse";
const KWIN_OBJECT_PATH = "/org/t3tools/Androdex/ComputerUse";
const KWIN_INTERFACE = "org.t3tools.Androdex.ComputerUse1";
const KWIN_PLUGIN_ID = "AndrodexComputerUsePlugin";
const KWIN_CLIPBOARD_SEAT: string | undefined = undefined;
const KWIN_TARGET_PREFIX = "wayland:kwin:";
const LINUX_LEFT_BUTTON = 272;
const LINUX_RIGHT_BUTTON = 273;
const LINUX_MIDDLE_BUTTON = 274;

const KEY_CODES: Readonly<Record<string, number>> = {
  alt: 56,
  backspace: 14,
  ctrl: 29,
  delete: 111,
  down: 108,
  end: 107,
  enter: 28,
  esc: 1,
  escape: 1,
  home: 102,
  left: 105,
  meta: 125,
  pagedown: 109,
  pageup: 104,
  return: 28,
  right: 106,
  shift: 42,
  space: 57,
  super: 125,
  tab: 15,
  up: 103,
  a: 30,
  b: 48,
  c: 46,
  d: 32,
  e: 18,
  f: 33,
  g: 34,
  h: 35,
  i: 23,
  j: 36,
  k: 37,
  l: 38,
  m: 50,
  n: 49,
  o: 24,
  p: 25,
  q: 16,
  r: 19,
  s: 31,
  t: 20,
  u: 22,
  v: 47,
  w: 17,
  x: 45,
  y: 21,
  z: 44,
  "0": 11,
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 6,
  "6": 7,
  "7": 8,
  "8": 9,
  "9": 10,
};

function isWaylandSession(): boolean {
  return Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === "wayland";
}

function screenshotCommand(): "spectacle" | "grim" | undefined {
  if (hasCommand("spectacle")) return "spectacle";
  if (hasCommand("grim")) return "grim";
  return undefined;
}

function getPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function nativeButton(button: Extract<ComputerUseAction, { type: "click" }>["button"]): number {
  switch (button) {
    case "right":
      return LINUX_RIGHT_BUTTON;
    case "middle":
      return LINUX_MIDDLE_BUTTON;
    default:
      return LINUX_LEFT_BUTTON;
  }
}

function normalizeKeyName(key: string): string {
  const lowered = key.toLowerCase();
  switch (lowered) {
    case "cmd":
    case "command":
      return "meta";
    case "control":
      return "ctrl";
    case "option":
      return "alt";
    default:
      return lowered;
  }
}

function keySequence(keys: readonly string[]): number[] {
  const normalizedKeys = normalizeLinuxShortcutKeys(keys);
  const codes = normalizedKeys
    .map((key) => KEY_CODES[normalizeKeyName(key)])
    .filter((code): code is number => code !== undefined);
  if (codes.length !== normalizedKeys.length) {
    const unsupported = normalizedKeys.find(
      (key) => KEY_CODES[normalizeKeyName(key)] === undefined,
    );
    throw new Error(`Unsupported Wayland keypress key: ${unsupported ?? "unknown"}.`);
  }
  return codes;
}

async function tryLoadKWinPlugin(): Promise<void> {
  await runChecked(
    "busctl",
    [
      "--user",
      "call",
      "org.kde.KWin",
      "/Plugins",
      "org.kde.KWin.Plugins",
      "LoadPlugin",
      "s",
      KWIN_PLUGIN_ID,
    ],
    { timeoutMs: 5_000, allowNonZeroExit: true },
  );
}

async function callKWin(method: string, signature?: string, args: readonly string[] = []) {
  const result = await runChecked(
    "busctl",
    [
      "--user",
      "--json=short",
      "call",
      KWIN_SERVICE,
      KWIN_OBJECT_PATH,
      KWIN_INTERFACE,
      method,
      ...(signature ? [signature, ...args] : []),
    ],
    { timeoutMs: 10_000, maxBufferBytes: 4 * 1024 * 1024 },
  );
  return JSON.parse(result.stdout) as { data?: readonly unknown[] };
}

async function callKWinJson<T>(method: string): Promise<T> {
  const result = await callKWin(method);
  const value = result.data?.[0];
  if (typeof value !== "string") {
    throw new Error(`KWin ${method} returned an unexpected D-Bus value.`);
  }
  return JSON.parse(value) as T;
}

async function callKWinBool(
  method: string,
  signature?: string,
  args: readonly string[] = [],
): Promise<void> {
  const result = await callKWin(method, signature, args);
  if (result.data?.[0] !== true) {
    throw new Error(`KWin ${method} returned false.`);
  }
}

async function healthFromKWinPlugin(): Promise<KWinPluginHealth> {
  await tryLoadKWinPlugin();
  return callKWinJson<KWinPluginHealth>("healthJson");
}

function windowTargetId(windowId: string): ComputerUseTarget["id"] {
  return `${KWIN_TARGET_PREFIX}window:${windowId}` as ComputerUseTarget["id"];
}

function desktopTargetId(): ComputerUseTarget["id"] {
  return `${KWIN_TARGET_PREFIX}desktop` as ComputerUseTarget["id"];
}

function targetWindowId(target: ComputerUseTarget): string | undefined {
  const prefix = `${KWIN_TARGET_PREFIX}window:`;
  return target.id.startsWith(prefix) ? target.id.slice(prefix.length) : undefined;
}

function normalizeBounds(
  bounds: KWinPluginWindow["bounds"],
): ComputerUseTarget["bounds"] | undefined {
  if (!bounds) return undefined;
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

function desktopBounds(
  windows: readonly KWinPluginWindow[],
): ComputerUseTarget["bounds"] | undefined {
  const bounds = windows.flatMap((window) => (window.bounds ? [window.bounds] : []));
  if (bounds.length === 0) return undefined;
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(0, Math.round(maxX - minX)),
    height: Math.max(0, Math.round(maxY - minY)),
  };
}

function windowToTarget(window: KWinPluginWindow): ComputerUseTarget | undefined {
  if (
    !window.visible ||
    !window.focusable ||
    window.desktop ||
    window.dock ||
    window.minimized ||
    !window.bounds
  ) {
    return undefined;
  }

  const title = window.title || window.appId || window.resourceClass || "Wayland window";
  const bounds = normalizeBounds(window.bounds);
  return {
    id: windowTargetId(window.id),
    kind: "desktop-window",
    title,
    ...(window.appId || window.resourceClass
      ? { appName: window.appId || window.resourceClass }
      : {}),
    ...(typeof window.pid === "number" && window.pid >= 0 ? { pid: window.pid } : {}),
    ...(process.env.WAYLAND_DISPLAY ? { display: process.env.WAYLAND_DISPLAY } : {}),
    ...(bounds ? { bounds } : {}),
    allowed: false,
    trustLevel: "host-desktop",
    driver: "linux-wayland",
    permissionKey: `kwin-wayland-window:${window.id}`,
    reason: "Native KWin Wayland windows require explicit approval.",
  };
}

function scrollDeltaToV120(delta: number): number {
  if (delta === 0) return 0;
  const steps = Math.max(1, Math.min(12, Math.ceil(Math.abs(delta) / 120)));
  return Math.sign(delta) * steps * 120;
}

async function pressAndRelease(button: number): Promise<void> {
  await callKWinBool("button", "ub", [String(button), "true"]);
  await NodeTimers.setTimeout(50);
  await callKWinBool("button", "ub", [String(button), "false"]);
  await NodeTimers.setTimeout(75);
}

async function sendKeySequence(keys: readonly string[]): Promise<void> {
  const codes = keySequence(keys);
  for (const code of codes) {
    await callKWinBool("key", "ub", [String(code), "true"]);
  }
  for (const code of codes.toReversed()) {
    await callKWinBool("key", "ub", [String(code), "false"]);
  }
}

export class LinuxWaylandDriver implements ComputerUseDriver {
  readonly kind = "linux-wayland" as const;

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const busctl = findCommand("busctl");
    const screenshot = findFirstCommand(["spectacle", "grim"]);
    const clipboard = waylandClipboardDependency();
    let pluginHealth: KWinPluginHealth | undefined;
    try {
      pluginHealth = await healthFromKWinPlugin();
    } catch {
      pluginHealth = undefined;
    }
    const dependencies = [
      busctl,
      screenshot,
      clipboard,
      {
        name: "kwin-androdex-computer-use-plugin",
        found: pluginHealth?.ok === true,
        ...(pluginHealth?.seat ? { detail: `seat=${pluginHealth.seat}` } : {}),
      },
      {
        name: "kwin-agent-overlay-cursor",
        found: pluginHealth?.ok === true && pluginHealth.overlay === true,
        ...(pluginHealth?.overlay === false
          ? { detail: "KWin overlay cursor is unavailable." }
          : {}),
      },
    ];
    if (process.platform !== "linux" || !isWaylandSession()) {
      return {
        driver: this.kind,
        status: "unsupported",
        message: "Wayland computer-use control requires a Linux Wayland session.",
        dependencies,
      };
    }
    const missing = dependencies.filter((dependency) => !dependency.found);
    if (missing.length > 0) {
      return {
        driver: this.kind,
        status: "missing-dependencies",
        message: `KWin native Wayland computer-use control is missing: ${missing.map((dependency) => dependency.name).join(", ")}.`,
        dependencies,
      };
    }
    return {
      driver: this.kind,
      status: "available",
      message:
        "KWin native Wayland computer-use control is available through the Androdex agent cursor.",
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return [];
    }
    const windows = await callKWinJson<KWinPluginWindow[]>("windowsJson");
    const targets = windows
      .map(windowToTarget)
      .filter((target): target is ComputerUseTarget => target !== undefined);
    const bounds = desktopBounds(windows);
    return [
      {
        id: desktopTargetId(),
        kind: "desktop-display",
        title: "KWin Wayland desktop",
        ...(process.env.XDG_CURRENT_DESKTOP ? { appName: process.env.XDG_CURRENT_DESKTOP } : {}),
        ...(process.env.WAYLAND_DISPLAY ? { display: process.env.WAYLAND_DISPLAY } : {}),
        ...(bounds ? { bounds } : {}),
        allowed: false,
        trustLevel: "host-desktop",
        driver: this.kind,
        permissionKey: "kwin-wayland-desktop",
        reason: "Native KWin Wayland desktop control requires explicit approval.",
      },
      ...targets,
    ];
  }

  async startSession(target: ComputerUseTarget): Promise<ComputerUseDriverSession> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      throw new Error(health.message);
    }
    const command = screenshotCommand();
    if (!command) {
      throw new Error("No Wayland screenshot command is available.");
    }
    const focusedWindowId = targetWindowId(target);
    const session: WaylandSession = {
      id: `driver:linux-wayland:${target.id}`,
      target,
      screenshotCommand: command,
      ...(focusedWindowId ? { targetWindowId: focusedWindowId } : {}),
    };
    await callKWinBool("start");
    if (session.targetWindowId) {
      await callKWinBool("focusWindow", "s", [session.targetWindowId]);
    } else {
      await callKWinBool("clearFocusWindow");
    }
    return session;
  }

  async captureScreenshot(session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    const waylandSession = session as WaylandSession;
    const pngBytes = await readPngFromTempFile(async (filePath) => {
      if (waylandSession.screenshotCommand === "spectacle") {
        await runChecked("spectacle", [
          "--background",
          "--nonotify",
          "--fullscreen",
          "--pointer",
          "--output",
          filePath,
        ]);
        return;
      }
      await runChecked("grim", [filePath]);
    });
    const size = getPngSize(pngBytes);
    return { pngBytes, width: size.width, height: size.height };
  }

  async executeAction(session: ComputerUseDriverSession, action: ComputerUseAction): Promise<void> {
    switch (action.type) {
      case "click":
        await callKWinBool("movePointer", "dd", [String(action.x), String(action.y)]);
        await pressAndRelease(nativeButton(action.button));
        return;
      case "double_click":
        await callKWinBool("movePointer", "dd", [String(action.x), String(action.y)]);
        await pressAndRelease(LINUX_LEFT_BUTTON);
        await pressAndRelease(LINUX_LEFT_BUTTON);
        return;
      case "move":
        await callKWinBool("movePointer", "dd", [String(action.x), String(action.y)]);
        return;
      case "drag": {
        const [first, ...rest] = action.path;
        if (!first) return;
        await callKWinBool("movePointer", "dd", [String(first.x), String(first.y)]);
        await callKWinBool("button", "ub", [String(LINUX_LEFT_BUTTON), "true"]);
        for (const point of rest) {
          await callKWinBool("movePointer", "dd", [String(point.x), String(point.y)]);
        }
        await callKWinBool("button", "ub", [String(LINUX_LEFT_BUTTON), "false"]);
        return;
      }
      case "scroll": {
        const scrollX = action.scrollX ?? 0;
        const scrollY = action.scrollY ?? 0;
        if (scrollX === 0 && scrollY === 0) {
          return;
        }
        await callKWinBool("movePointer", "dd", [String(action.x), String(action.y)]);
        await callKWinBool("axis", "dd", [
          String(scrollDeltaToV120(scrollX)),
          String(scrollDeltaToV120(scrollY)),
        ]);
        return;
      }
      case "type":
        await setWaylandClipboard(action.text, KWIN_CLIPBOARD_SEAT);
        await sendKeySequence(["ctrl", "v"]);
        return;
      case "keypress":
        await sendKeySequence(action.keys);
        return;
      case "wait":
        await NodeTimers.setTimeout(action.ms ?? 1_000);
        return;
      case "screenshot":
        await this.captureScreenshot(session);
        return;
      case "clipboard_set":
        await setWaylandClipboard(action.text, KWIN_CLIPBOARD_SEAT);
        return;
    }
  }

  async stopSession(_session: ComputerUseDriverSession): Promise<void> {
    await callKWinBool("stop");
  }
}
