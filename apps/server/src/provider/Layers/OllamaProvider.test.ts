import assert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe } from "vitest";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { OllamaSettings } from "@t3tools/contracts";
import { checkOllamaProviderStatus, makePendingOllamaProvider } from "./OllamaProvider.ts";

const decodeOllamaSettings = Schema.decodeSync(OllamaSettings);

const makeOllamaSettings = (overrides?: Partial<OllamaSettings>): OllamaSettings =>
  decodeOllamaSettings({
    enabled: true,
    apiEndpoint: "http://127.0.0.1:11434",
    customModels: [],
    ...overrides,
  });

let mockResponse: () => Effect.Effect<Response> = () =>
  Effect.succeed(
    Response.json({
      models: [
        { name: "gemma 4 12b", model: "gemma 4 12b", details: { family: "gemma" } },
        { name: "llama3", model: "llama3", details: { family: "llama" } },
      ],
    }),
  );

const TestHttpClientLive = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.map(mockResponse(), (res) => HttpClientResponse.fromWeb(request, res)),
  ),
);

const testLayer = Layer.mergeAll(NodeServices.layer, TestHttpClientLive);

describe("OllamaProvider tests", () => {
  it.effect("makePendingOllamaProvider returns disabled status when disabled", () =>
    Effect.gen(function* () {
      const settings = makeOllamaSettings({ enabled: false });
      const snapshot = yield* makePendingOllamaProvider(settings);

      assert.equal(snapshot.enabled, false);
      assert.equal(snapshot.status, "disabled");
      assert.equal(snapshot.message, "Ollama is disabled in Androdex settings.");
    }),
  );

  it.effect("makePendingOllamaProvider returns pending status when enabled", () =>
    Effect.gen(function* () {
      const settings = makeOllamaSettings({ enabled: true });
      const snapshot = yield* makePendingOllamaProvider(settings);

      assert.equal(snapshot.enabled, true);
      assert.equal(snapshot.status, "warning");
      assert.equal(
        snapshot.message,
        "Ollama provider status has not been checked in this session yet.",
      );
    }),
  );

  it.layer(testLayer)("checkOllamaProviderStatus", (it) => {
    it.effect("returns disabled status when disabled", () =>
      Effect.gen(function* () {
        const settings = makeOllamaSettings({ enabled: false });
        const snapshot = yield* checkOllamaProviderStatus(settings);

        assert.equal(snapshot.enabled, false);
        assert.equal(snapshot.status, "disabled");
        assert.equal(snapshot.message, "Ollama is disabled in Androdex settings.");
      }),
    );

    it.effect("fetches and lists models successfully", () =>
      Effect.gen(function* () {
        mockResponse = () =>
          Effect.succeed(
            Response.json({
              models: [
                { name: "gemma 4 12b", model: "gemma 4 12b", details: { family: "gemma" } },
                { name: "llama3", model: "llama3", details: { family: "llama" } },
              ],
            }),
          );

        const settings = makeOllamaSettings({ enabled: true });
        const snapshot = yield* checkOllamaProviderStatus(settings);

        assert.equal(snapshot.enabled, true);
        assert.equal(snapshot.status, "ready");
        assert.equal(snapshot.installed, true);
        assert.equal(snapshot.version, "local");
        assert.ok(snapshot.message && snapshot.message.includes("2 models installed"));

        // Verify returned models
        const slugs = snapshot.models.map((m) => m.slug);
        assert.deepEqual(slugs, ["gemma 4 12b", "llama3"]);
      }),
    );

    it.effect("handles fetch failures and connection errors gracefully", () =>
      Effect.gen(function* () {
        mockResponse = () => Effect.die("ECONNREFUSED");

        const settings = makeOllamaSettings({
          enabled: true,
          apiEndpoint: "http://127.0.0.1:11434",
        });
        const snapshot = yield* checkOllamaProviderStatus(settings);

        assert.equal(snapshot.enabled, true);
        assert.equal(snapshot.status, "error");
        assert.equal(snapshot.installed, false);
        assert.ok(
          snapshot.message &&
            snapshot.message.includes(
              "Could not connect to Ollama server at http://127.0.0.1:11434",
            ),
        );
      }),
    );
  });
});
