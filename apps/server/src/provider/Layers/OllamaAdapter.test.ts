import assert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe } from "vitest";
import { it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { makeOllamaAdapter } from "./OllamaAdapter.ts";

const asThreadId = (value: string): ThreadId => ThreadId.make(value);

let mockResponse: (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<HttpClientResponse.HttpClientResponse> = (req) => {
  const encoder = new TextEncoder();
  const response = HttpClientResponse.fromWeb(req, new Response());
  Object.defineProperty(response, "stream", {
    get() {
      return Stream.make(
        encoder.encode(JSON.stringify({ message: { content: "Hello" } }) + "\n"),
        encoder.encode(JSON.stringify({ message: { content: " world!" } }) + "\n"),
      );
    },
    configurable: true,
  });
  return Effect.succeed(response);
};

const TestHttpClientLive = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => mockResponse(request)),
);

const testLayer = Layer.mergeAll(NodeServices.layer, TestHttpClientLive);

describe("OllamaAdapter tests", () => {
  it.layer(testLayer)("OllamaAdapter", (it) => {
    it.effect("startSession starts session and emits events", () =>
      Effect.gen(function* () {
        const adapter = yield* makeOllamaAdapter({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const threadId = asThreadId("thread-1");

        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.filter((event) => event.threadId === threadId),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild,
        );

        const session = yield* adapter.startSession({
          provider: ProviderDriverKind.make("ollama"),
          threadId,
          runtimeMode: "full-access",
        });

        assert.equal(session.provider, "ollama");
        assert.equal(session.threadId, threadId);

        const events = Array.from(yield* Fiber.join(eventsFiber));
        assert.equal(events.length, 2);
        assert.equal(events[0]?.type, "session.started");
        assert.equal(events[1]?.type, "thread.started");
      }),
    );

    it.effect("sendTurn rejects invalid inputs", () =>
      Effect.gen(function* () {
        const adapter = yield* makeOllamaAdapter({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const threadId = asThreadId("thread-2");
        yield* adapter.startSession({
          provider: ProviderDriverKind.make("ollama"),
          threadId,
          runtimeMode: "full-access",
        });

        // Empty input
        const emptyInputError = yield* adapter
          .sendTurn({
            threadId,
            input: "",
          })
          .pipe(Effect.flip);

        assert.equal(emptyInputError._tag, "ProviderAdapterValidationError");

        // Wrong instance ID
        const wrongInstanceError = yield* adapter
          .sendTurn({
            threadId,
            input: "hello",
            modelSelection: {
              instanceId: ProviderInstanceId.make("other-provider"),
              model: "gemma 4 12b",
            },
          })
          .pipe(Effect.flip);

        assert.equal(wrongInstanceError._tag, "ProviderAdapterValidationError");
      }),
    );

    it.effect("sendTurn streams response and completes turn", () =>
      Effect.gen(function* () {
        const adapter = yield* makeOllamaAdapter({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const threadId = asThreadId("thread-3");
        yield* adapter.startSession({
          provider: ProviderDriverKind.make("ollama"),
          threadId,
          runtimeMode: "full-access",
        });

        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.filter((event) => event.threadId === threadId),
          Stream.filter(
            (event) =>
              event.type === "turn.started" ||
              event.type === "content.delta" ||
              event.type === "turn.completed",
          ),
          Stream.take(4), // turn.started, 2x content.delta, turn.completed
          Stream.runCollect,
          Effect.forkChild,
        );

        yield* adapter.sendTurn({
          threadId,
          input: "Hello there!",
        });

        const events = Array.from(yield* Fiber.join(eventsFiber));
        assert.equal(events.length, 4);

        assert.equal(events[0]?.type, "turn.started");
        assert.equal(events[1]?.type, "content.delta");
        assert.equal((events[1] as any).payload.delta, "Hello");
        assert.equal(events[2]?.type, "content.delta");
        assert.equal((events[2] as any).payload.delta, " world!");
        assert.equal(events[3]?.type, "turn.completed");
        assert.equal((events[3] as any).payload.state, "completed");
      }),
    );

    it.effect("interruptTurn aborts active turn", () =>
      Effect.gen(function* () {
        const adapter = yield* makeOllamaAdapter({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const threadId = asThreadId("thread-4");
        yield* adapter.startSession({
          provider: ProviderDriverKind.make("ollama"),
          threadId,
          runtimeMode: "full-access",
        });

        mockResponse = (req) => {
          const response = HttpClientResponse.fromWeb(req, new Response());
          Object.defineProperty(response, "stream", {
            get() {
              return Stream.never;
            },
            configurable: true,
          });
          return Effect.succeed(response);
        };

        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.filter((event) => event.threadId === threadId),
          Stream.filter((event) => event.type === "turn.completed"),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        );

        const turnResult = yield* adapter.sendTurn({
          threadId,
          input: "Will be cancelled",
        });

        // Yield execution to let the handler start
        yield* TestClock.adjust("50 millis");

        yield* adapter.interruptTurn(threadId, turnResult.turnId);

        const completedEvents = Array.from(yield* Fiber.join(eventsFiber));
        assert.equal(completedEvents.length, 1);
        assert.equal((completedEvents[0] as any).payload.state, "interrupted");
      }),
    );

    it.effect("stopSession stops active session and emits event", () =>
      Effect.gen(function* () {
        const adapter = yield* makeOllamaAdapter({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const threadId = asThreadId("thread-5");
        yield* adapter.startSession({
          provider: ProviderDriverKind.make("ollama"),
          threadId,
          runtimeMode: "full-access",
        });

        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.filter((event) => event.threadId === threadId && event.type === "session.exited"),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        );

        yield* adapter.stopSession(threadId);

        const events = Array.from(yield* Fiber.join(eventsFiber));
        assert.equal(events.length, 1);
        assert.equal(events[0]?.type, "session.exited");

        const hasSession = yield* adapter.hasSession(threadId);
        assert.equal(hasSession, false);
      }),
    );

    it.effect("rollbackThread drops last turns", () =>
      Effect.gen(function* () {
        const adapter = yield* makeOllamaAdapter({
          apiEndpoint: "http://127.0.0.1:11434",
          enabled: true,
        });

        const threadId = asThreadId("thread-6");
        yield* adapter.startSession({
          provider: ProviderDriverKind.make("ollama"),
          threadId,
          runtimeMode: "full-access",
        });

        // Simulate a turn that adds to the messages list
        mockResponse = (req) => {
          const encoder = new TextEncoder();
          const response = HttpClientResponse.fromWeb(req, new Response());
          Object.defineProperty(response, "stream", {
            get() {
              return Stream.make(
                encoder.encode(JSON.stringify({ message: { content: "Response" } }) + "\n"),
              );
            },
            configurable: true,
          });
          return Effect.succeed(response);
        };

        yield* adapter.sendTurn({
          threadId,
          input: "User query",
        });

        // Let the turn finish
        yield* TestClock.adjust("50 millis");

        const sessions = yield* adapter.listSessions();
        assert.equal(sessions.length, 1);

        // Rollback turn
        yield* adapter.rollbackThread(threadId, 1);

        // Verify that after rollback, the session is still present
        const hasSession = yield* adapter.hasSession(threadId);
        assert.equal(hasSession, true);
      }),
    );
  });
});
