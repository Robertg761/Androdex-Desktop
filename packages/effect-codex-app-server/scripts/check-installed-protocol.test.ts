import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { parseOfficialProtocolMethods } from "./check-installed-protocol.ts";

describe("parseOfficialProtocolMethods", () => {
  it("extracts method names from official generated TypeScript unions", () => {
    const methods = parseOfficialProtocolMethods(`
      export type ClientRequest =
        | { "method": "initialize", id: RequestId, params: InitializeParams }
        | { "method": "thread/start", id: RequestId, params: ThreadStartParams }
        | { "method": "thread/resume", id: RequestId, params: ThreadResumeParams };
    `);

    assert.deepEqual([...methods].toSorted(), ["initialize", "thread/resume", "thread/start"]);
  });
});
