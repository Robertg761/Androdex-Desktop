import {
  ProviderDriverKind,
  type ModelCapabilities,
  type OllamaSettings,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { createModelCapabilities } from "@t3tools/shared/model";
import {
  buildServerProvider,
  providerModelsFromSettings,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const PROVIDER = ProviderDriverKind.make("ollama");
const OLLAMA_PRESENTATION = {
  displayName: "Ollama",
  showInteractionModeToggle: false,
} as const;

const DEFAULT_OLLAMA_MODEL_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const OllamaModelSchema = Schema.Struct({
  name: Schema.String,
  model: Schema.String,
  details: Schema.optional(
    Schema.Struct({
      parameter_size: Schema.optional(Schema.String),
      family: Schema.optional(Schema.String),
    }),
  ),
});

const OllamaTagsResponseSchema = Schema.Struct({
  models: Schema.Array(OllamaModelSchema),
});

function flattenOllamaModels(
  modelsList: ReadonlyArray<typeof OllamaModelSchema.Type>,
): ReadonlyArray<ServerProviderModel> {
  const models: Array<ServerProviderModel> = [];

  for (const item of modelsList) {
    if (!item.name) continue;
    const subProvider = item.details?.family || undefined;
    models.push({
      slug: item.name,
      name: item.name,
      ...(subProvider ? { subProvider } : {}),
      isCustom: false,
      capabilities: DEFAULT_OLLAMA_MODEL_CAPABILITIES,
    });
  }

  return models.toSorted((left, right) => left.name.localeCompare(right.name));
}

export const makePendingOllamaProvider = (
  ollamaSettings: OllamaSettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = providerModelsFromSettings(
      [],
      PROVIDER,
      ollamaSettings.customModels,
      DEFAULT_OLLAMA_MODEL_CAPABILITIES,
    );

    if (!ollamaSettings.enabled) {
      return buildServerProvider({
        presentation: OLLAMA_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Ollama is disabled in Androdex settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: OLLAMA_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Ollama provider status has not been checked in this session yet.",
      },
    });
  });

export const checkOllamaProviderStatus = Effect.fn("checkOllamaProviderStatus")(function* (
  ollamaSettings: OllamaSettings,
  _processEnv: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, HttpClient.HttpClient> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const customModels = ollamaSettings.customModels;

  const fallback = (message: string) =>
    buildServerProvider({
      presentation: OLLAMA_PRESENTATION,
      enabled: ollamaSettings.enabled,
      checkedAt,
      models: providerModelsFromSettings(
        [],
        PROVIDER,
        customModels,
        DEFAULT_OLLAMA_MODEL_CAPABILITIES,
      ),
      probe: {
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message,
      },
    });

  if (!ollamaSettings.enabled) {
    return buildServerProvider({
      presentation: OLLAMA_PRESENTATION,
      enabled: false,
      checkedAt,
      models: providerModelsFromSettings(
        [],
        PROVIDER,
        customModels,
        DEFAULT_OLLAMA_MODEL_CAPABILITIES,
      ),
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Ollama is disabled in Androdex settings.",
      },
    });
  }

  const endpoint = ollamaSettings.apiEndpoint.trim().replace(/\/$/, "");
  const httpClient = yield* HttpClient.HttpClient;

  const request = HttpClientRequest.get(`${endpoint}/api/tags`).pipe(HttpClientRequest.acceptJson);

  const fetchTags = httpClient
    .execute(request)
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(OllamaTagsResponseSchema)),
      Effect.scoped,
    );

  const result = yield* Effect.exit(fetchTags);

  if (result._tag === "Failure") {
    return fallback(
      `Could not connect to Ollama server at ${endpoint}. Please ensure the service is running locally.`,
    );
  }

  const fetchedModels = flattenOllamaModels(result.value.models);
  const models = providerModelsFromSettings(
    fetchedModels,
    PROVIDER,
    customModels,
    DEFAULT_OLLAMA_MODEL_CAPABILITIES,
  );

  return buildServerProvider({
    presentation: OLLAMA_PRESENTATION,
    enabled: true,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: "local",
      status: "ready",
      auth: {
        status: "authenticated",
        type: "anonymous",
      },
      message: `Ollama is running at ${endpoint} with ${fetchedModels.length} models installed.`,
    },
  });
});
