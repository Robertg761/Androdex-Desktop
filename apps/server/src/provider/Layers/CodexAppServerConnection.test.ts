import { describe, expect, it } from "vitest";
import { CodexSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  CODEX_APP_SERVER_WEBSOCKET_EXPERIMENTAL_WARNING,
  isCodexAppServerRemoteConnection,
  parseCodexAppServerUrl,
  resolveCodexDefaultUnixSocketPath,
  resolveCodexAppServerRemoteConnection,
} from "./CodexAppServerConnection.ts";

const decodeCodexSettings = Schema.decodeSync(CodexSettings);

describe("CodexAppServerConnection", () => {
  it("is disabled when no remote app-server URL is configured", () => {
    expect(resolveCodexAppServerRemoteConnection(decodeCodexSettings({}), {})).toBeUndefined();
  });

  it("resolves the bearer token from the configured provider environment variable", () => {
    const resolved = resolveCodexAppServerRemoteConnection(
      decodeCodexSettings({
        appServerUrl: "ws://127.0.0.1:8765",
        appServerTokenEnvVar: "REMOTE_CODEX_TOKEN",
      }),
      { REMOTE_CODEX_TOKEN: "secret-token" },
    );

    expect(isCodexAppServerRemoteConnection(resolved)).toBe(true);
    expect(resolved).toEqual({
      url: "ws://127.0.0.1:8765",
      transport: "websocket",
      isLoopback: true,
      warnings: [CODEX_APP_SERVER_WEBSOCKET_EXPERIMENTAL_WARNING],
      bearerToken: "secret-token",
      tokenEnvVar: "REMOTE_CODEX_TOKEN",
    });
  });

  it("omits websocket auth when no token environment variable is set", () => {
    const resolved = resolveCodexAppServerRemoteConnection(
      decodeCodexSettings({ appServerUrl: "wss://codex.example.test/app-server" }),
      {},
    );

    expect(resolved).toEqual({
      url: "wss://codex.example.test/app-server",
      transport: "websocket",
      isLoopback: false,
      warnings: [
        CODEX_APP_SERVER_WEBSOCKET_EXPERIMENTAL_WARNING,
        "Non-loopback Codex app-server URLs can expose raw runtime control; do not expose unauthenticated listeners on shared or public networks.",
      ],
      tokenEnvVar: "CODEX_APP_SERVER_TOKEN",
    });
  });

  it("classifies localhost websocket endpoints as loopback", () => {
    expect(parseCodexAppServerUrl("ws://localhost:4500")).toEqual({
      transport: "websocket",
      isLoopback: true,
      warnings: [CODEX_APP_SERVER_WEBSOCKET_EXPERIMENTAL_WARNING],
    });
  });

  it("warns strongly for non-loopback websocket endpoints", () => {
    const parsed = parseCodexAppServerUrl("ws://192.0.2.10:4500");

    expect(parsed.transport).toBe("websocket");
    expect(parsed.isLoopback).toBe(false);
    expect(parsed.warnings.join(" ")).toContain("Non-loopback Codex app-server URLs");
  });

  it("warns when an HTTP backend URL is used as a raw app-server URL", () => {
    const parsed = parseCodexAppServerUrl("https://androdex.example.test");

    expect(parsed.transport).toBe("websocket");
    expect(parsed.isLoopback).toBe(false);
    expect(parsed.warnings.join(" ")).toContain("must use ws://, wss://, or unix://");
  });

  it("classifies unix socket app-server URLs as local", () => {
    expect(parseCodexAppServerUrl("unix:///tmp/codex-app-server.sock")).toEqual({
      transport: "unix-socket",
      isLoopback: true,
      warnings: [],
    });
  });

  it("classifies the default unix socket app-server URL as local", () => {
    expect(parseCodexAppServerUrl("unix://")).toEqual({
      transport: "unix-socket",
      isLoopback: true,
      warnings: [],
    });
  });

  it("resolves unix:// to Codex's default control socket in the configured home", () => {
    const resolved = resolveCodexAppServerRemoteConnection(
      decodeCodexSettings({
        appServerUrl: "unix://",
        homePath: "~/official-codex-home",
      }),
      { HOME: "/home/tester" },
    );

    expect(resolved).toEqual({
      url: "unix:///home/tester/official-codex-home/app-server-control/app-server-control.sock",
      transport: "unix-socket",
      isLoopback: true,
      warnings: [],
      tokenEnvVar: "CODEX_APP_SERVER_TOKEN",
    });
  });

  it("resolves the default unix socket path from CODEX_HOME when no home path is configured", () => {
    expect(resolveCodexDefaultUnixSocketPath(undefined, { CODEX_HOME: "/tmp/codex-home" })).toBe(
      "/tmp/codex-home/app-server-control/app-server-control.sock",
    );
  });
});
