import {
  ApprovalRequestId,
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ProviderTurnStartResult,
  type ProviderUserInputAnswers,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Random from "effect/Random";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import {
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import {
  type ProviderAdapterCapabilities,
  type ProviderAdapterShape,
  type ProviderThreadSnapshot,
  type ProviderThreadTurnSnapshot,
} from "../Services/ProviderAdapter.ts";

const PROVIDER = ProviderDriverKind.make("ollama");

const OllamaStreamChunk = Schema.Struct({
  message: Schema.optional(
    Schema.Struct({
      content: Schema.optional(Schema.String),
    }),
  ),
});

const decodeOllamaStreamChunk = Schema.decodeUnknownExit(Schema.fromJsonString(OllamaStreamChunk));

function tryParseOllamaStreamChunk(trimmed: string) {
  const result = decodeOllamaStreamChunk(trimmed);
  if (Exit.isSuccess(result)) {
    return result.value;
  }
  return undefined;
}

interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OllamaTurnSnapshot {
  readonly id: TurnId;
  readonly items: Array<unknown>;
}

interface OllamaSessionContext {
  session: ProviderSession;
  readonly messages: Array<OllamaMessage>;
  readonly turns: Array<OllamaTurnSnapshot>;
  activeTurnId: TurnId | undefined;
  activeFiber: Fiber.Fiber<any, any> | null;
  readonly stopped: Ref.Ref<boolean>;
  readonly sessionScope: Scope.Closeable;
}

export interface OllamaAdapterLiveOptions {
  readonly instanceId?: ProviderInstanceId;
  readonly environment?: NodeJS.ProcessEnv;
}

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

const buildEventBase = (input: {
  readonly threadId: ThreadId;
  readonly turnId?: TurnId | undefined;
  readonly itemId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly createdAt?: string | undefined;
}) =>
  Effect.gen(function* () {
    const uuid = yield* Random.nextUUIDv4;
    const createdAt = input.createdAt ?? (yield* nowIso);
    return {
      eventId: EventId.make(uuid),
      provider: PROVIDER,
      threadId: input.threadId,
      createdAt,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.itemId ? { itemId: RuntimeItemId.make(input.itemId) } : {}),
      ...(input.requestId ? { requestId: RuntimeRequestId.make(input.requestId) } : {}),
    };
  });

export function makeOllamaAdapter(
  ollamaSettings: { readonly apiEndpoint: string; readonly enabled: boolean },
  options?: OllamaAdapterLiveOptions,
) {
  return Effect.gen(function* () {
    const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("ollama");
    const httpClient = yield* HttpClient.HttpClient;
    const runtimeEvents = yield* Queue.unbounded<ProviderRuntimeEvent>();
    const sessions = new Map<ThreadId, OllamaSessionContext>();

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const contexts = [...sessions.values()];
        sessions.clear();
        for (const ctx of contexts) {
          if (ctx.activeFiber) {
            yield* Fiber.interrupt(ctx.activeFiber);
          }
          yield* Scope.close(ctx.sessionScope, Exit.void).pipe(Effect.ignore);
        }
      }).pipe(Effect.ensuring(Queue.shutdown(runtimeEvents))),
    );

    const emit = (event: ProviderRuntimeEvent) =>
      Queue.offer(runtimeEvents, event).pipe(Effect.asVoid);

    const updateProviderSession = (
      context: OllamaSessionContext,
      patch: Partial<ProviderSession>,
      opts?: { readonly clearActiveTurnId?: boolean; readonly clearLastError?: boolean },
    ): Effect.Effect<ProviderSession> =>
      Effect.gen(function* () {
        const updatedAt = yield* nowIso;
        const nextSession = {
          ...context.session,
          ...patch,
          updatedAt,
        } as ProviderSession & Record<string, unknown>;
        const mutableSession = nextSession as Record<string, unknown>;
        if (opts?.clearActiveTurnId) {
          delete mutableSession.activeTurnId;
        }
        if (opts?.clearLastError) {
          delete mutableSession.lastError;
        }
        context.session = nextSession;
        return nextSession;
      });

    const startSession = (
      input: ProviderSessionStartInput,
    ): Effect.Effect<ProviderSession, ProviderAdapterError> =>
      Effect.gen(function* () {
        const directory = input.cwd ?? "";
        const existing = sessions.get(input.threadId);
        if (existing) {
          if (existing.activeFiber) {
            yield* Fiber.interrupt(existing.activeFiber);
          }
          yield* Scope.close(existing.sessionScope, Exit.void).pipe(Effect.ignore);
          sessions.delete(input.threadId);
        }

        const sessionScope = yield* Scope.make();
        const stopped = yield* Ref.make(false);
        const createdAt = yield* nowIso;

        const session: ProviderSession = {
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          status: "ready",
          runtimeMode: input.runtimeMode,
          cwd: directory,
          ...(input.modelSelection ? { model: input.modelSelection.model } : {}),
          threadId: input.threadId,
          createdAt,
          updatedAt: createdAt,
        };

        const context: OllamaSessionContext = {
          session,
          messages: [],
          turns: [],
          activeTurnId: undefined,
          activeFiber: null,
          stopped,
          sessionScope,
        };

        sessions.set(input.threadId, context);

        yield* emit({
          ...(yield* buildEventBase({ threadId: input.threadId })),
          type: "session.started",
          payload: {
            message: "Ollama session started",
          },
        });

        yield* emit({
          ...(yield* buildEventBase({ threadId: input.threadId })),
          type: "thread.started",
          payload: {
            providerThreadId: `ollama-thread-${input.threadId}`,
          },
        });

        return session;
      });

    const sendTurn = (
      input: ProviderSendTurnInput,
    ): Effect.Effect<ProviderTurnStartResult, ProviderAdapterError> =>
      Effect.gen(function* () {
        const context = sessions.get(input.threadId);
        if (!context || (yield* Ref.get(context.stopped))) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }

        const turnId = TurnId.make(`ollama-turn-${yield* Random.nextUUIDv4}`);
        const modelSelection =
          input.modelSelection ??
          (context.session.model
            ? { instanceId: boundInstanceId, model: context.session.model }
            : undefined);

        if (modelSelection !== undefined && modelSelection.instanceId !== boundInstanceId) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: `Ollama model selection is bound to instance '${modelSelection?.instanceId}', expected '${boundInstanceId}'.`,
          });
        }

        const modelName = modelSelection?.model ?? "gemma 4 12b";
        const text = input.input?.trim() ?? "";

        if (text.length === 0) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: "Ollama turns require text input.",
          });
        }

        context.activeTurnId = turnId;
        yield* updateProviderSession(
          context,
          {
            status: "running",
            activeTurnId: turnId,
            model: modelName,
          },
          { clearLastError: true },
        );

        yield* emit({
          ...(yield* buildEventBase({ threadId: input.threadId, turnId })),
          type: "turn.started",
          payload: {
            model: modelName,
          },
        });

        context.messages.push({ role: "user", content: text });

        const itemId = `ollama-item-${yield* Random.nextUUIDv4}`;
        yield* emit({
          ...(yield* buildEventBase({ threadId: input.threadId, turnId, itemId })),
          type: "item.started",
          payload: {
            itemType: "assistant_message",
            status: "inProgress",
            title: "Assistant message",
          },
        });

        const endpoint = ollamaSettings.apiEndpoint.trim().replace(/\/$/, "");

        const executeRequest = Effect.gen(function* () {
          const req = HttpClientRequest.post(`${endpoint}/api/chat`).pipe(
            HttpClientRequest.bodyJsonUnsafe({
              model: modelName,
              messages: context.messages,
              stream: true,
            }),
          );

          const response = yield* httpClient.execute(req);
          let fullContent = "";
          let buffer = "";

          yield* response.stream.pipe(
            Stream.decodeText(),
            Stream.runForEach((chunk) =>
              Effect.gen(function* () {
                buffer += chunk;
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.length === 0) continue;

                  const parsed = tryParseOllamaStreamChunk(trimmed);
                  const chunkText = parsed?.message?.content ?? "";
                  if (chunkText.length > 0) {
                    fullContent += chunkText;
                    yield* emit({
                      ...(yield* buildEventBase({ threadId: input.threadId, turnId, itemId })),
                      type: "content.delta",
                      payload: {
                        streamKind: "assistant_text",
                        delta: chunkText,
                      },
                    });
                  }
                }
              }),
            ),
          );

          context.messages.push({ role: "assistant", content: fullContent });

          yield* emit({
            ...(yield* buildEventBase({ threadId: input.threadId, turnId, itemId })),
            type: "item.completed",
            payload: {
              itemType: "assistant_message",
              status: "completed",
              title: "Assistant message",
              detail: fullContent,
            },
          });

          context.activeTurnId = undefined;
          context.activeFiber = null;

          yield* updateProviderSession(context, { status: "ready" }, { clearActiveTurnId: true });

          yield* emit({
            ...(yield* buildEventBase({ threadId: input.threadId, turnId })),
            type: "turn.completed",
            payload: {
              state: "completed",
            },
          });
        }).pipe(
          Effect.catch((err) =>
            Effect.gen(function* () {
              context.activeTurnId = undefined;
              context.activeFiber = null;

              const errorMessage = `Ollama request failed: ${(err as any).message ?? String(err)}`;

              yield* updateProviderSession(
                context,
                {
                  status: "ready",
                  lastError: errorMessage,
                },
                { clearActiveTurnId: true },
              );

              yield* emit({
                ...(yield* buildEventBase({ threadId: input.threadId, turnId })),
                type: "turn.completed",
                payload: {
                  state: "failed",
                  errorMessage,
                },
              });

              yield* emit({
                ...(yield* buildEventBase({ threadId: input.threadId })),
                type: "runtime.error",
                payload: {
                  message: errorMessage,
                  class: "provider_error",
                },
              });
            }),
          ),
          Effect.onInterrupt(() =>
            Effect.gen(function* () {
              context.activeTurnId = undefined;
              context.activeFiber = null;

              yield* updateProviderSession(
                context,
                {
                  status: "ready",
                  lastError: "Turn interrupted by user.",
                },
                { clearActiveTurnId: true },
              );

              yield* emit({
                ...(yield* buildEventBase({ threadId: input.threadId, turnId })),
                type: "turn.completed",
                payload: {
                  state: "interrupted",
                  errorMessage: "Turn interrupted by user.",
                },
              });
            }),
          ),
        );

        const fiber = yield* executeRequest.pipe(Effect.forkIn(context.sessionScope));
        context.activeFiber = fiber;

        return {
          threadId: input.threadId,
          turnId,
        };
      });

    const interruptTurn = (
      threadId: ThreadId,
      _turnId?: TurnId,
    ): Effect.Effect<void, ProviderAdapterError> =>
      Effect.gen(function* () {
        const context = sessions.get(threadId);
        if (!context) return;

        if (context.activeFiber) {
          yield* Fiber.interrupt(context.activeFiber);
          context.activeFiber = null;
        }
      });

    const stopSession = (threadId: ThreadId): Effect.Effect<void, ProviderAdapterError> =>
      Effect.gen(function* () {
        const context = sessions.get(threadId);
        if (!context) return;

        yield* Ref.set(context.stopped, true);
        if (context.activeFiber) {
          yield* Fiber.interrupt(context.activeFiber);
          context.activeFiber = null;
        }

        yield* Scope.close(context.sessionScope, Exit.void).pipe(Effect.ignore);
        sessions.delete(threadId);

        yield* emit({
          ...(yield* buildEventBase({ threadId })),
          type: "session.exited",
          payload: {
            exitKind: "graceful",
          },
        });
      });

    const stopAll = (): Effect.Effect<void, ProviderAdapterError> =>
      Effect.gen(function* () {
        const contexts = [...sessions.values()];
        sessions.clear();
        for (const context of contexts) {
          yield* Ref.set(context.stopped, true);
          if (context.activeFiber) {
            yield* Fiber.interrupt(context.activeFiber);
            context.activeFiber = null;
          }
          yield* Scope.close(context.sessionScope, Exit.void).pipe(Effect.ignore);
        }
      });

    const listSessions = (): Effect.Effect<ReadonlyArray<ProviderSession>> =>
      Effect.succeed(Array.from(sessions.values()).map((ctx) => ctx.session));

    const hasSession = (threadId: ThreadId): Effect.Effect<boolean> =>
      Effect.succeed(sessions.has(threadId));

    const readThread = (
      threadId: ThreadId,
    ): Effect.Effect<ProviderThreadSnapshot, ProviderAdapterError> =>
      Effect.gen(function* () {
        const context = sessions.get(threadId);
        if (!context) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId,
          });
        }

        const turns: Array<ProviderThreadTurnSnapshot> = [];
        return {
          threadId,
          turns,
        };
      });

    const rollbackThread = (
      threadId: ThreadId,
      numTurns: number,
    ): Effect.Effect<ProviderThreadSnapshot, ProviderAdapterError> =>
      Effect.gen(function* () {
        const context = sessions.get(threadId);
        if (!context) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId,
          });
        }

        // Standard local rollback: drop the corresponding number of user/assistant messages
        const messagesToDrop = numTurns * 2;
        context.messages.splice(-messagesToDrop);

        return yield* readThread(threadId);
      });

    const respondToRequest = (
      _threadId: ThreadId,
      _requestId: ApprovalRequestId,
      _decision: ProviderApprovalDecision,
    ): Effect.Effect<void, ProviderAdapterError> => Effect.void;

    const respondToUserInput = (
      _threadId: ThreadId,
      _requestId: ApprovalRequestId,
      _answers: ProviderUserInputAnswers,
    ): Effect.Effect<void, ProviderAdapterError> => Effect.void;

    return {
      provider: PROVIDER,
      capabilities: {
        sessionModelSwitch: "in-session",
      } as ProviderAdapterCapabilities,
      startSession,
      sendTurn,
      interruptTurn,
      stopSession,
      listSessions,
      hasSession,
      readThread,
      rollbackThread,
      respondToRequest,
      respondToUserInput,
      stopAll,
      streamEvents: Stream.fromQueue(runtimeEvents),
    } satisfies ProviderAdapterShape<ProviderAdapterError>;
  });
}
