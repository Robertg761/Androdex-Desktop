import assert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe } from "vitest";
import { it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { makeOllamaTextGeneration } from "./OllamaTextGeneration.ts";

let mockResponse: () => Effect.Effect<Response> = () =>
  Effect.succeed(
    Response.json({
      response: JSON.stringify({
        subject: "Feat: add Ollama backend",
        body: "- Implemented Ollama adapter\n- Added unit tests",
      }),
      done: true,
    }),
  );

const TestHttpClientLive = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.map(mockResponse(), (res) => HttpClientResponse.fromWeb(request, res)),
  ),
);

const testLayer = Layer.mergeAll(NodeServices.layer, TestHttpClientLive);

describe("OllamaTextGeneration tests", () => {
  it.layer(testLayer)("OllamaTextGeneration", (it) => {
    it.effect("generateCommitMessage generates valid structure", () =>
      Effect.gen(function* () {
        mockResponse = () =>
          Effect.succeed(
            Response.json({
              response: JSON.stringify({
                subject: "Feat: add Ollama backend",
                body: "- Implemented Ollama adapter\n- Added unit tests",
                branch: "feat-ollama-backend",
              }),
              done: true,
            }),
          );

        const gen = yield* makeOllamaTextGeneration({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const result = yield* gen.generateCommitMessage({
          cwd: "/dummy",
          branch: "main",
          stagedSummary: "modified files",
          stagedPatch: "diff data",
          includeBranch: true,
          modelSelection: {
            instanceId: ProviderInstanceId.make("ollama"),
            model: "gemma 4 12b",
          },
        });

        assert.equal(result.subject, "Feat: add Ollama backend");
        assert.equal(result.body, "- Implemented Ollama adapter\n- Added unit tests");
        assert.equal(result.branch, "feature/feat-ollama-backend");
      }),
    );

    it.effect("generatePrContent generates valid structure", () =>
      Effect.gen(function* () {
        mockResponse = () =>
          Effect.succeed(
            Response.json({
              response: JSON.stringify({
                title: "Pull Request Title",
                body: "This PR introduces Ollama support.",
              }),
              done: true,
            }),
          );

        const gen = yield* makeOllamaTextGeneration({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const result = yield* gen.generatePrContent({
          cwd: "/dummy",
          baseBranch: "main",
          headBranch: "feat-ollama",
          commitSummary: "various commits",
          diffSummary: "diff summary",
          diffPatch: "diff patch",
          modelSelection: {
            instanceId: ProviderInstanceId.make("ollama"),
            model: "gemma 4 12b",
          },
        });

        assert.equal(result.title, "Pull Request Title");
        assert.equal(result.body, "This PR introduces Ollama support.");
      }),
    );

    it.effect("generateBranchName generates branch name", () =>
      Effect.gen(function* () {
        mockResponse = () =>
          Effect.succeed(
            Response.json({
              response: JSON.stringify({
                branch: "feat-ollama-support",
              }),
              done: true,
            }),
          );

        const gen = yield* makeOllamaTextGeneration({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const result = yield* gen.generateBranchName({
          cwd: "/dummy",
          message: "add support for Ollama backend",
          modelSelection: {
            instanceId: ProviderInstanceId.make("ollama"),
            model: "gemma 4 12b",
          },
        });

        assert.equal(result.branch, "feat-ollama-support");
      }),
    );

    it.effect("generateThreadTitle generates thread title", () =>
      Effect.gen(function* () {
        mockResponse = () =>
          Effect.succeed(
            Response.json({
              response: JSON.stringify({
                title: "Ollama Support Chat",
              }),
              done: true,
            }),
          );

        const gen = yield* makeOllamaTextGeneration({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const result = yield* gen.generateThreadTitle({
          cwd: "/dummy",
          message: "How do I configure Ollama?",
          modelSelection: {
            instanceId: ProviderInstanceId.make("ollama"),
            model: "gemma 4 12b",
          },
        });

        assert.equal(result.title, "Ollama Support Chat");
      }),
    );

    it.effect("handles API errors gracefully", () =>
      Effect.gen(function* () {
        mockResponse = () => Effect.die("API Error");

        const gen = yield* makeOllamaTextGeneration({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const error = yield* gen
          .generateThreadTitle({
            cwd: "/dummy",
            message: "How do I configure Ollama?",
            modelSelection: {
              instanceId: ProviderInstanceId.make("ollama"),
              model: "gemma 4 12b",
            },
          })
          .pipe(Effect.flip);

        assert.equal(error._tag, "TextGenerationError");
        assert.ok(error.detail.includes("Ollama text generation API request failed"));
      }),
    );
  });
});
