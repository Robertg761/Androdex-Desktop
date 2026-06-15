import { describe, expect, it } from "vitest";
import type { ServerCodexBackendDiagnosticsResult } from "@t3tools/contracts";

import { deriveCodexBackendDiagnosticsRows } from "./DiagnosticsSettings";

describe("deriveCodexBackendDiagnosticsRows", () => {
  it("formats the official Codex backend diagnostics table values", () => {
    const diagnostics = {
      readAt: "2026-06-03T00:00:00.000Z",
      instanceId: "codex",
      binaryPath: "codex",
      resolvedBinaryPath: "/usr/local/bin/codex",
      version: "codex-cli 0.136.0",
      homePath: "~/.codex",
      resolvedHomePath: "/home/example/.codex",
      shadowHomePath: null,
      authJsonPresent: true,
      configTomlPresent: true,
      sessionsDirectoryPresent: false,
      appServerUrlConfigured: true,
      appServerUrl: "unix:///tmp/codex-app-server.sock",
      appServerTransport: "unix-socket",
      appServerTokenEnvVar: "CODEX_APP_SERVER_TOKEN",
      appServerTokenPresent: false,
      appServerWarnings: [],
      initialize: {
        ok: true,
        message: "app-server initialized successfully.",
      },
      userAgent: "codex_cli_rs/0.136.0",
      platformFamily: "unix",
      platformOs: "linux",
      protocolCompatibility: {
        ok: true,
        message: "initialize response decoded with local protocol schemas.",
      },
      schemaUpstreamRef: "07b695190f30a450e4921f71f77473e564395c59",
    } as unknown as ServerCodexBackendDiagnosticsResult;

    expect(deriveCodexBackendDiagnosticsRows(diagnostics)).toContainEqual([
      "Binary",
      "/usr/local/bin/codex",
    ]);
    expect(deriveCodexBackendDiagnosticsRows(diagnostics)).toContainEqual([
      "CODEX_HOME",
      "/home/example/.codex",
    ]);
    expect(deriveCodexBackendDiagnosticsRows(diagnostics)).toContainEqual([
      "Transport",
      "unix-socket: unix:///tmp/codex-app-server.sock",
    ]);
    expect(deriveCodexBackendDiagnosticsRows(diagnostics)).toContainEqual([
      "Sessions",
      "session state not found",
    ]);
  });
});
