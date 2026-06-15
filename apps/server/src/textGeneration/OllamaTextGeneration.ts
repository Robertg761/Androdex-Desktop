import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { TextGenerationError, type ModelSelection } from "@t3tools/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { extractJsonObject } from "@t3tools/shared/schemaJson";

import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import { type TextGenerationShape } from "./TextGeneration.ts";
import {
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "./TextGenerationUtils.ts";

const OllamaGenerateResponseSchema = Schema.Struct({
  response: Schema.String,
  done: Schema.Boolean,
});

export const makeOllamaTextGeneration = Effect.fn("makeOllamaTextGeneration")(function* (
  ollamaSettings: { readonly apiEndpoint: string; readonly enabled: boolean },
  _environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<TextGenerationShape, never, HttpClient.HttpClient> {
  const httpClient = yield* HttpClient.HttpClient;

  const runOllamaJson = Effect.fn("runOllamaJson")(function* <S extends Schema.Top>(input: {
    readonly operation:
      | "generateCommitMessage"
      | "generatePrContent"
      | "generateBranchName"
      | "generateThreadTitle";
    readonly prompt: string;
    readonly outputSchemaJson: S;
    readonly modelSelection: ModelSelection;
  }) {
    const endpoint = ollamaSettings.apiEndpoint.trim().replace(/\/$/, "");
    const modelName = input.modelSelection.model;

    const request = HttpClientRequest.post(`${endpoint}/api/generate`).pipe(
      HttpClientRequest.bodyJsonUnsafe({
        model: modelName,
        prompt: input.prompt,
        format: "json",
        stream: false,
      }),
    );

    const callApi = Effect.gen(function* () {
      const response = yield* httpClient.execute(request);
      return yield* HttpClientResponse.schemaBodyJson(OllamaGenerateResponseSchema)(response).pipe(
        Effect.scoped,
      );
    });

    const result = yield* Effect.exit(callApi);

    if (result._tag === "Failure") {
      return yield* new TextGenerationError({
        operation: input.operation,
        detail: `Ollama text generation API request failed: ${String(result.cause)}`,
        cause: result.cause,
      });
    }

    const rawOutput = result.value.response;
    const decodeOutput = Schema.decodeEffect(Schema.fromJsonString(input.outputSchemaJson));
    return yield* decodeOutput(extractJsonObject(rawOutput)).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(
          new TextGenerationError({
            operation: input.operation,
            detail: "Ollama returned invalid structured output.",
            cause,
          }),
        ),
      ),
    );
  });

  const generateCommitMessage: TextGenerationShape["generateCommitMessage"] = Effect.fn(
    "OllamaTextGeneration.generateCommitMessage",
  )(function* (input) {
    const { prompt, outputSchema } = buildCommitMessagePrompt({
      branch: input.branch,
      stagedSummary: input.stagedSummary,
      stagedPatch: input.stagedPatch,
      includeBranch: input.includeBranch === true,
    });
    const generated = yield* runOllamaJson({
      operation: "generateCommitMessage",
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      subject: sanitizeCommitSubject(generated.subject),
      body: generated.body.trim(),
      ...("branch" in generated && typeof generated.branch === "string"
        ? { branch: sanitizeFeatureBranchName(generated.branch) }
        : {}),
    };
  });

  const generatePrContent: TextGenerationShape["generatePrContent"] = Effect.fn(
    "OllamaTextGeneration.generatePrContent",
  )(function* (input) {
    const { prompt, outputSchema } = buildPrContentPrompt({
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      commitSummary: input.commitSummary,
      diffSummary: input.diffSummary,
      diffPatch: input.diffPatch,
    });
    const generated = yield* runOllamaJson({
      operation: "generatePrContent",
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      title: sanitizePrTitle(generated.title),
      body: generated.body.trim(),
    };
  });

  const generateBranchName: TextGenerationShape["generateBranchName"] = Effect.fn(
    "OllamaTextGeneration.generateBranchName",
  )(function* (input) {
    const { prompt, outputSchema } = buildBranchNamePrompt({
      message: input.message,
    });
    const generated = yield* runOllamaJson({
      operation: "generateBranchName",
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      branch: sanitizeBranchFragment(generated.branch),
    };
  });

  const generateThreadTitle: TextGenerationShape["generateThreadTitle"] = Effect.fn(
    "OllamaTextGeneration.generateThreadTitle",
  )(function* (input) {
    const { prompt, outputSchema } = buildThreadTitlePrompt({
      message: input.message,
    });
    const generated = yield* runOllamaJson({
      operation: "generateThreadTitle",
      prompt,
      outputSchemaJson: outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      title: sanitizeThreadTitle(generated.title),
    };
  });

  return {
    generateCommitMessage,
    generatePrContent,
    generateBranchName,
    generateThreadTitle,
  } satisfies TextGenerationShape;
});
