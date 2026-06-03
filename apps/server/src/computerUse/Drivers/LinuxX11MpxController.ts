// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { ComputerUseAction } from "@t3tools/contracts";

import type { ProcessRunResult } from "../../processRunner.ts";
import { findCommand, runChecked, type DependencyStatus } from "./processUtils.ts";
import { LINUX_X11_MPX_HELPER_SOURCE } from "./LinuxX11MpxHelperSource.ts";

interface HelperSuccess {
  readonly ok: true;
}

interface HelperFailure {
  readonly ok: false;
  readonly error: string;
}

type HelperResult = HelperSuccess | HelperFailure;

interface MpxProbeResult extends HelperSuccess {
  readonly xiVersion: string;
  readonly xtestVersion: string;
}

interface MpxCreateResult extends HelperSuccess {
  readonly name: string;
  readonly pointerId: number;
  readonly keyboardId: number;
  readonly xtestPointerId: number;
  readonly xtestKeyboardId: number;
}

export interface LinuxX11MpxController {
  readonly name: string;
  readonly pointerId: number;
  readonly keyboardId: number;
  readonly xtestPointerId: number;
  readonly xtestKeyboardId: number;
  readonly executeAction: (action: ComputerUseAction) => Promise<void>;
  readonly stop: () => Promise<void>;
}

let helperPathPromise: Promise<string> | undefined;
let sessionCounter = 0;

function nextSessionName(): string {
  sessionCounter += 1;
  return `Androdex Agent ${process.pid}-${process.hrtime.bigint()}-${sessionCounter}`;
}

async function helperPath(): Promise<string> {
  if (!helperPathPromise) {
    helperPathPromise = (async () => {
      const directory = NodePath.join(NodeOS.tmpdir(), "androdex-computer-use");
      await NodeFS.mkdir(directory, { recursive: true });
      const filePath = NodePath.join(directory, "linux-x11-mpx-helper.py");
      await NodeFS.writeFile(filePath, LINUX_X11_MPX_HELPER_SOURCE, { mode: 0o700 });
      return filePath;
    })();
  }
  return helperPathPromise;
}

function parseHelperResult<T extends HelperResult>(result: ProcessRunResult): T {
  const payload = result.stdout.trim().split(/\r?\n/u).at(-1);
  if (!payload) {
    throw new Error("Linux X11 MPX helper returned no JSON payload.");
  }
  const decoded = JSON.parse(payload) as T;
  if (!decoded.ok) {
    throw new Error(decoded.error);
  }
  return decoded;
}

async function runHelper<T extends HelperResult>(
  display: string,
  args: readonly string[],
): Promise<T> {
  const filePath = await helperPath();
  const result = await runChecked("python3", [filePath, ...args], {
    env: { ...process.env, DISPLAY: display },
    timeoutMs: 15_000,
  });
  return parseHelperResult<T>(result);
}

function serializableAction(action: ComputerUseAction): ComputerUseAction {
  if (action.type === "keypress") {
    return {
      ...action,
      keys: action.keys.map((key) => key.toLowerCase()),
    };
  }
  return action;
}

function helperActionArgs(
  controller: Pick<
    LinuxX11MpxController,
    "pointerId" | "keyboardId" | "xtestPointerId" | "xtestKeyboardId"
  >,
  windowId: string,
  action: ComputerUseAction,
): ReadonlyArray<string> {
  return [
    "action",
    "--pointer-id",
    String(controller.pointerId),
    "--keyboard-id",
    String(controller.keyboardId),
    "--xtest-pointer-id",
    String(controller.xtestPointerId),
    "--xtest-keyboard-id",
    String(controller.xtestKeyboardId),
    "--window-id",
    windowId,
    "--action-json",
    JSON.stringify(serializableAction(action)),
  ];
}

export function linuxX11MpxDependency(): DependencyStatus {
  return findCommand("python3");
}

export async function probeLinuxX11Mpx(display: string): Promise<DependencyStatus> {
  const python = linuxX11MpxDependency();
  if (!python.found) {
    return python;
  }
  try {
    const probe = await runHelper<MpxProbeResult>(display, ["probe"]);
    return {
      name: "xinput2|xtest",
      found: true,
      detail: `XI2 ${probe.xiVersion}, XTEST ${probe.xtestVersion}`,
    };
  } catch (error) {
    return {
      name: "xinput2|xtest",
      found: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function startLinuxX11MpxController(
  display: string,
  windowId: string,
  onTypeText: (text: string) => Promise<void>,
): Promise<LinuxX11MpxController> {
  const created = await runHelper<MpxCreateResult>(display, [
    "create",
    "--name",
    nextSessionName(),
  ]);
  const controller: LinuxX11MpxController = {
    name: created.name,
    pointerId: created.pointerId,
    keyboardId: created.keyboardId,
    xtestPointerId: created.xtestPointerId,
    xtestKeyboardId: created.xtestKeyboardId,
    executeAction: async (action) => {
      if (action.type === "type") {
        await onTypeText(action.text);
        await runHelper(
          display,
          helperActionArgs(controller, windowId, {
            type: "keypress",
            keys: ["ctrl", "v"],
          }),
        );
        return;
      }
      if (
        action.type === "wait" ||
        action.type === "screenshot" ||
        action.type === "clipboard_set"
      ) {
        return;
      }
      await runHelper(display, helperActionArgs(controller, windowId, action));
    },
    stop: async () => {
      await runHelper(display, ["remove", "--pointer-id", String(created.pointerId)]);
    },
  };
  return controller;
}
