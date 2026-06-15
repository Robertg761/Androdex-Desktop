// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import type * as NodeStream from "node:stream";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { DEFAULT_SERVER_SETTINGS, type ServerSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { readCodexBackendDiagnostics } from "./CodexBackendDiagnostics.ts";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function encodeServerTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }

  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function decodeClientTextFrames(input: Buffer): string[] {
  const messages: string[] = [];
  let offset = 0;

  while (offset + 6 <= input.length) {
    const opcode = input[offset]! & 0x0f;
    const masked = (input[offset + 1]! & 0x80) !== 0;
    let payloadLength = input[offset + 1]! & 0x7f;
    offset += 2;

    if (payloadLength === 126) {
      if (offset + 2 > input.length) break;
      payloadLength = input.readUInt16BE(offset);
      offset += 2;
    }

    if (!masked || offset + 4 + payloadLength > input.length) {
      break;
    }

    const mask = input.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(input.subarray(offset, offset + payloadLength));
    offset += payloadLength;
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = payload[index]! ^ mask[index % 4]!;
    }

    if (opcode === 1) {
      messages.push(payload.toString("utf8"));
    }
  }

  return messages;
}

function writeJson(socket: Pick<NodeStream.Duplex, "write">, message: unknown) {
  socket.write(encodeServerTextFrame(JSON.stringify(message)));
}

async function withMockCodexWebSocketServer<A>(run: (url: string) => Promise<A>): Promise<A> {
  const server = NodeHttp.createServer();
  const sockets = new Set<NodeStream.Duplex>();
  server.on("upgrade", (request, socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
    const websocketKey = request.headers["sec-websocket-key"];
    if (typeof websocketKey !== "string") {
      socket.destroy();
      return;
    }

    const accept = NodeCrypto.createHash("sha1")
      .update(`${websocketKey}${WEBSOCKET_GUID}`)
      .digest("base64");
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"),
    );

    socket.on("data", (chunk) => {
      for (const frame of decodeClientTextFrames(chunk)) {
        const message = JSON.parse(frame) as {
          readonly id?: number | string;
          readonly method?: string;
        };
        if (message.method === "initialize") {
          writeJson(socket, {
            id: message.id,
            result: {
              codexHome: process.cwd(),
              platformFamily: "unix",
              platformOs: "linux",
              userAgent: "mock-codex-app-server",
            },
          });
          continue;
        }
        if (message.method === "initialized") {
          writeJson(socket, {
            method: "future/notification",
            params: {
              feature: "startup-drift",
            },
          });
          writeJson(socket, {
            method: "item/agentMessage/delta",
            params: {
              threadId: "thread-1",
            },
          });
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP WebSocket test server address.");
  }

  try {
    return await run(`ws://127.0.0.1:${address.port}`);
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function makeSettings(appServerUrl: string): ServerSettings {
  return {
    ...DEFAULT_SERVER_SETTINGS,
    providers: {
      ...DEFAULT_SERVER_SETTINGS.providers,
      codex: {
        ...DEFAULT_SERVER_SETTINGS.providers.codex,
        binaryPath: process.execPath,
        appServerUrl,
      },
    },
  };
}

describe("CodexBackendDiagnostics", () => {
  it("reports unknown and drifted startup notifications as protocol compatibility warnings", async () => {
    await withMockCodexWebSocketServer(async (appServerUrl) => {
      const diagnostics = await Effect.runPromise(
        readCodexBackendDiagnostics({}, makeSettings(appServerUrl)).pipe(
          Effect.provide(NodeServices.layer),
        ),
      );

      expect(diagnostics.initialize.ok).toBe(true);
      expect(diagnostics.userAgent).toBe("mock-codex-app-server");
      expect(diagnostics.protocolCompatibility.ok).toBe(false);
      expect(diagnostics.protocolCompatibility.message).toContain("future/notification");
      expect(diagnostics.protocolCompatibility.message).toContain(
        "item/agentMessage/delta (schema decode failed)",
      );
    });
  });
});
