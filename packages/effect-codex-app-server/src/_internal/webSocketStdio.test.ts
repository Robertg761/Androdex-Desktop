import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import * as Effect from "effect/Effect";

import {
  makeWebSocketStdio,
  parseUnixSocketWebSocketUrl,
  resolveDefaultUnixSocketPath,
} from "./webSocketStdio.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseUnixSocketWebSocketUrl", () => {
  it("returns undefined for TCP WebSocket URLs", () => {
    expect(parseUnixSocketWebSocketUrl("ws://127.0.0.1:4500")).toBeUndefined();
  });

  it("extracts Unix socket paths", () => {
    expect(parseUnixSocketWebSocketUrl("unix:///tmp/codex-app-server.sock")).toBe(
      "/tmp/codex-app-server.sock",
    );
  });

  it("resolves the default Codex control socket for unix://", () => {
    vi.stubEnv("CODEX_HOME", "/tmp/codex-home");

    expect(parseUnixSocketWebSocketUrl("unix://")).toBe(
      "/tmp/codex-home/app-server-control/app-server-control.sock",
    );
  });

  it("resolves the default Codex control socket from CODEX_HOME", () => {
    vi.stubEnv("CODEX_HOME", "/tmp/other-codex-home");

    expect(resolveDefaultUnixSocketPath()).toBe(
      "/tmp/other-codex-home/app-server-control/app-server-control.sock",
    );
  });
});

describe("makeWebSocketStdio", () => {
  it("propagates bearer auth headers to WebSocket app-server endpoints", async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    const authorization = new Promise<string | undefined>((resolve) => {
      server.once("connection", (socket, request) => {
        resolve(request.headers.authorization);
        socket.close();
      });
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected TCP WebSocket test server address.");
    }

    try {
      const url = `ws://127.0.0.1:${address.port}`;
      const observed = await Effect.runPromise(
        Effect.scoped(
          makeWebSocketStdio({
            url,
            bearerToken: "secret-token",
          }).pipe(Effect.flatMap(() => Effect.promise(() => authorization))),
        ).pipe(Effect.orDie),
      );

      expect(observed).toBe("Bearer secret-token");
    } finally {
      server.close();
    }
  });
});
