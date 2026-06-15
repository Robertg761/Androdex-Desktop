import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";

const run = Effect.gen(function* () {
  console.log("Creating stream...");
  const stream = Stream.never;

  const effectToRun = stream
    .pipe(
      Stream.decodeText(),
      Stream.runForEach((chunk) =>
        Effect.gen(function* () {
          console.log("Chunk received:", chunk);
        }),
      ),
    )
    .pipe(
      Effect.onInterrupt(() =>
        Effect.sync(() => console.log("Stream fiber was interrupted successfully!")),
      ),
    );

  console.log("Forking fiber...");
  const fiber = yield* Effect.fork(effectToRun);

  yield* Effect.sleep("500 millis");

  console.log("Interrupting fiber...");
  yield* Fiber.interrupt(fiber);
  console.log("Interruption completed!");
});

Effect.runPromise(run).catch(console.error);
