import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPUTER_USE_SETTINGS,
  type ComputerUseSettings,
  type ComputerUseTarget,
} from "@t3tools/contracts";

import { evaluateActionPolicy, evaluateTargetPolicy } from "./ComputerUsePolicy.ts";

const settings: ComputerUseSettings = DEFAULT_COMPUTER_USE_SETTINGS;

const isolatedTarget = {
  id: "target:browser" as ComputerUseTarget["id"],
  kind: "browser",
  title: "Isolated browser",
  allowed: true,
  trustLevel: "isolated",
  driver: "browser",
} as const satisfies ComputerUseTarget;

describe("ComputerUsePolicy", () => {
  it("allows an already-approved isolated target", () => {
    expect(evaluateTargetPolicy(isolatedTarget, settings)).toEqual({ type: "allow" });
  });

  it("requires approval for a new non-sensitive target when the safety gate is enabled", () => {
    expect(evaluateTargetPolicy({ ...isolatedTarget, allowed: false }, settings)).toMatchObject({
      type: "approval-required",
    });
  });

  it("allows approved host-desktop targets by default while blocking sensitive targets", () => {
    expect(
      evaluateTargetPolicy(
        {
          ...isolatedTarget,
          id: "target:terminal" as ComputerUseTarget["id"],
          kind: "desktop-window",
          title: "Terminal",
          trustLevel: "sensitive",
          driver: "linux-x11",
        },
        settings,
      ),
    ).toMatchObject({ type: "block" });

    const hostDesktopTarget = {
      ...isolatedTarget,
      id: "target:x11" as ComputerUseTarget["id"],
      kind: "desktop-window",
      title: "Firefox",
      trustLevel: "host-desktop",
      driver: "linux-x11",
    } as const satisfies ComputerUseTarget;

    expect(evaluateTargetPolicy(hostDesktopTarget, settings)).toEqual({ type: "allow" });

    expect(
      evaluateTargetPolicy(hostDesktopTarget, { ...settings, hostDesktopEnabled: false }),
    ).toEqual({ type: "block", reason: "Host desktop control is disabled." });

    expect(
      evaluateTargetPolicy(
        {
          ...isolatedTarget,
          id: "target:codex" as ComputerUseTarget["id"],
          kind: "desktop-window",
          title: "Codex",
          trustLevel: "host-desktop",
          driver: "linux",
        },
        { ...settings, hostDesktopEnabled: true },
      ),
    ).toEqual({ type: "block", reason: "Target title matches the sensitive-target blocklist." });
  });

  it("allows approved Linux host-desktop targets when host control is enabled", () => {
    for (const driver of ["linux", "linux-x11", "linux-wayland"] as const) {
      expect(
        evaluateTargetPolicy(
          {
            ...isolatedTarget,
            id: `target:${driver}` as ComputerUseTarget["id"],
            kind: "desktop-display",
            title: "Desktop",
            allowed: true,
            trustLevel: "host-desktop",
            driver,
          },
          {
            ...settings,
            hostDesktopEnabled: true,
          },
        ),
      ).toEqual({ type: "allow" });
    }
  });

  it("requires approval for sensitive-looking typed text", () => {
    expect(
      evaluateActionPolicy({ type: "type", text: "api_key=sk-example" }, isolatedTarget, settings),
    ).toMatchObject({ type: "approval-required" });
  });

  it("blocks clipboard access and requires review for host-desktop typing by default", () => {
    expect(
      evaluateActionPolicy({ type: "keypress", keys: ["ctrl", "v"] }, isolatedTarget, settings),
    ).toEqual({ type: "block", reason: "Clipboard paste is disabled." });

    expect(
      evaluateActionPolicy({ type: "keypress", keys: ["cmd", "v"] }, isolatedTarget, settings),
    ).toEqual({ type: "block", reason: "Clipboard paste is disabled." });

    expect(
      evaluateActionPolicy({ type: "clipboard_set", text: "hello" }, isolatedTarget, settings),
    ).toEqual({ type: "block", reason: "Clipboard access is disabled." });

    expect(
      evaluateActionPolicy(
        { type: "type", text: "hello" },
        {
          ...isolatedTarget,
          id: "target:x11" as ComputerUseTarget["id"],
          kind: "desktop-window",
          trustLevel: "host-desktop",
          driver: "linux-x11",
        },
        {
          ...settings,
          hostDesktopEnabled: true,
        },
      ),
    ).toEqual({
      type: "approval-required",
      reason: "Typing into a host desktop target requires review.",
    });
  });
});
