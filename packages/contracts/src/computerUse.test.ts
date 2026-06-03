import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import {
  ComputerUseAction,
  ComputerUseDriverKind,
  ComputerUseRpcSchemas,
  ComputerUseSettings,
  DEFAULT_COMPUTER_USE_SETTINGS,
  ExecuteComputerUseActionsInput,
  ProviderInstanceId,
  StartComputerUseSessionInput,
  ThreadId,
} from "./index.ts";

const decodeAction = Schema.decodeUnknownSync(ComputerUseAction);
const decodeExecuteActions = Schema.decodeUnknownSync(ExecuteComputerUseActionsInput);
const decodeStartSession = Schema.decodeUnknownSync(StartComputerUseSessionInput);
const decodeSettings = Schema.decodeUnknownSync(ComputerUseSettings);

describe("Computer Use contracts", () => {
  it("keeps Computer Use disabled with Linux desktop as the default driver", () => {
    expect(DEFAULT_COMPUTER_USE_SETTINGS).toEqual({
      enabled: false,
      defaultDriver: "linux",
      askBeforeNewTarget: true,
      askBeforeSensitiveAction: true,
      clipboardEnabled: false,
      hostDesktopEnabled: false,
      allowedTargets: [],
    });
  });

  it("backfills allowed targets for older persisted settings", () => {
    expect(
      decodeSettings({
        enabled: true,
        defaultDriver: "linux",
        askBeforeNewTarget: true,
        askBeforeSensitiveAction: true,
        clipboardEnabled: false,
        hostDesktopEnabled: true,
      }),
    ).toMatchObject({ allowedTargets: [] });
  });

  it("decodes the supported driver set", () => {
    const decodeDriver = Schema.decodeUnknownSync(ComputerUseDriverKind);

    expect(decodeDriver("linux")).toBe("linux");
    expect(decodeDriver("container")).toBe("container");
    expect(decodeDriver("browser")).toBe("browser");
    expect(decodeDriver("linux-x11")).toBe("linux-x11");
    expect(decodeDriver("linux-wayland")).toBe("linux-wayland");
    expect(() => decodeDriver("macos")).toThrow();
  });

  it("validates computer actions and rejects empty action batches", () => {
    expect(decodeAction({ type: "click", x: 10, y: 20 })).toEqual({
      type: "click",
      x: 10,
      y: 20,
    });
    expect(decodeAction({ type: "keypress", keys: ["ctrl", "l"] })).toEqual({
      type: "keypress",
      keys: ["ctrl", "l"],
    });
    expect(decodeAction({ type: "clipboard_set", text: "paste me" })).toEqual({
      type: "clipboard_set",
      text: "paste me",
    });
    expect(() => decodeExecuteActions({ sessionId: "session-1", actions: [] })).toThrow();
  });

  it("decodes provider-scoped session starts", () => {
    expect(
      decodeStartSession({
        threadId: ThreadId.make("thread-computer-use"),
        providerId: ProviderInstanceId.make("codex"),
        driver: "browser",
        targetHint: "localhost",
        reason: "Inspect the web app.",
      }),
    ).toMatchObject({
      threadId: "thread-computer-use",
      providerId: "codex",
      driver: "browser",
      targetHint: "localhost",
    });
  });

  it("exposes stream item schemas for websocket subscriptions", () => {
    expect(ComputerUseRpcSchemas.subscribeEvents.output).toBeDefined();
  });
});
