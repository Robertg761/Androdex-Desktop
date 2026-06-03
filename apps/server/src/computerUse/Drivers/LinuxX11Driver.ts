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
  runWithDisplay,
} from "./processUtils.ts";
import { setX11Clipboard, x11ClipboardDependency } from "./linuxInput.ts";
import {
  linuxX11MpxDependency,
  probeLinuxX11Mpx,
  startLinuxX11MpxController,
  type LinuxX11MpxController,
} from "./LinuxX11MpxController.ts";

interface X11Session extends ComputerUseDriverSession {
  readonly windowId: string;
  readonly display: string;
  readonly controller: LinuxX11MpxController;
}

const BLOCKED_WINDOW_PATTERNS = [
  /terminal/i,
  /\bconsole\b/i,
  /\bshell\b/i,
  /password/i,
  /keychain/i,
  /keepass/i,
  /1password/i,
  /bitwarden/i,
  /settings/i,
  /software/i,
  /package/i,
  /sudo/i,
  /admin/i,
] as const;

function displayEnv(): string | undefined {
  return process.env.DISPLAY;
}

function appNameFromWmClass(wmClass: string | undefined): string | undefined {
  if (!wmClass || wmClass === "N/A") return undefined;
  const parts = wmClass.split(".").filter((part) => part.length > 0);
  return parts.at(-1) ?? wmClass;
}

function parseWmctrlLine(line: string): ComputerUseTarget | null {
  const columns = line.trim().split(/\s+/);
  if (columns.length < 4) return null;
  const windowId = columns[0];
  const wmClass = columns.length >= 5 ? columns[2] : undefined;
  const titleStart = columns.length >= 5 ? 4 : 3;
  const title = columns.slice(titleStart).join(" ").trim();
  if (!windowId || title.length === 0) return null;
  const sensitive = BLOCKED_WINDOW_PATTERNS.some((pattern) => pattern.test(title));
  const appName = appNameFromWmClass(wmClass) ?? title.split(/\s+-\s+/)[0] ?? title;
  const display = displayEnv();
  return {
    id: `x11:${windowId}` as ComputerUseTarget["id"],
    kind: "desktop-window",
    title,
    appName,
    ...(display ? { display } : {}),
    permissionKey: `linux-app:${appName.toLowerCase()}`,
    allowed: false,
    trustLevel: sensitive ? "sensitive" : "host-desktop",
    driver: "linux-x11",
    ...(sensitive
      ? { reason: "Blocked by the host-desktop safety policy." }
      : { reason: "Host desktop targets require explicit approval." }),
  };
}

function getPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) {
    return { width: 0, height: 0 };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

export class LinuxX11Driver implements ComputerUseDriver {
  readonly kind = "linux-x11" as const;

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const display = displayEnv();
    const dependencies = [
      linuxX11MpxDependency(),
      findCommand("wmctrl"),
      findFirstCommand(["import", "scrot"]),
      x11ClipboardDependency(),
    ];
    if (process.platform === "linux" && display && dependencies[0]?.found) {
      dependencies.push(await probeLinuxX11Mpx(display));
    }
    const missing = dependencies.filter((dependency) => !dependency.found);
    if (process.platform !== "linux" || !display) {
      return {
        driver: this.kind,
        status: "unsupported",
        message: "Independent host X11 control requires Linux with DISPLAY set.",
        dependencies,
      };
    }
    return {
      driver: this.kind,
      status: missing.length === 0 ? "available" : "missing-dependencies",
      message:
        missing.length === 0
          ? "Independent host X11 desktop control is available but requires explicit opt-in."
          : `Missing ${missing.map((dependency) => dependency.name).join(", ")}.`,
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return [];
    }
    const result = await runChecked("wmctrl", ["-lx"], {
      env: { ...process.env },
      timeoutMs: 5_000,
      allowNonZeroExit: true,
    });
    return result.stdout
      .split(/\r?\n/g)
      .map(parseWmctrlLine)
      .filter((target): target is ComputerUseTarget => target !== null);
  }

  async startSession(target: ComputerUseTarget): Promise<X11Session> {
    const windowId = target.id.replace(/^x11:/, "");
    if (target.trustLevel === "sensitive") {
      throw new Error("Sensitive host desktop targets are blocked.");
    }
    const display = displayEnv();
    if (!display) {
      throw new Error("DISPLAY is not set.");
    }
    const controller = await startLinuxX11MpxController(display, windowId, (text) =>
      setX11Clipboard(display, text),
    );
    return {
      id: `driver:linux-x11:${windowId}`,
      target,
      windowId,
      display,
      controller,
    };
  }

  async captureScreenshot(session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    const x11Session = session as X11Session;
    const pngBytes = await readPngFromTempFile(async (filePath) => {
      if (hasCommand("import")) {
        await runWithDisplay(x11Session.display, "import", [
          "-window",
          x11Session.windowId,
          filePath,
        ]);
        return;
      }
      await runWithDisplay(x11Session.display, "scrot", ["-u", filePath]);
    });
    const size = getPngSize(pngBytes);
    return { pngBytes, width: size.width, height: size.height };
  }

  async executeAction(session: ComputerUseDriverSession, action: ComputerUseAction): Promise<void> {
    const x11Session = session as X11Session;
    switch (action.type) {
      case "wait":
        await NodeTimers.setTimeout(action.ms ?? 1_000);
        return;
      case "screenshot":
        await this.captureScreenshot(session);
        return;
      case "clipboard_set":
        await setX11Clipboard(x11Session.display, action.text);
        return;
      default:
        await x11Session.controller.executeAction(action);
        return;
    }
  }

  async stopSession(session: ComputerUseDriverSession): Promise<void> {
    const x11Session = session as X11Session;
    await x11Session.controller.stop();
  }
}
