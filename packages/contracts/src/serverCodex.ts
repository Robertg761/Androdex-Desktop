import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const ServerCodexBackendDiagnosticsInput = Schema.Struct({
  instanceId: Schema.optional(ProviderInstanceId),
});
export type ServerCodexBackendDiagnosticsInput = typeof ServerCodexBackendDiagnosticsInput.Type;

export const ServerCodexBackendDiagnosticsCheck = Schema.Struct({
  ok: Schema.Boolean,
  message: Schema.String,
});
export type ServerCodexBackendDiagnosticsCheck = typeof ServerCodexBackendDiagnosticsCheck.Type;

export const ServerCodexBackendDiagnosticsResult = Schema.Struct({
  readAt: Schema.DateTimeUtc,
  instanceId: ProviderInstanceId,
  binaryPath: TrimmedNonEmptyString,
  resolvedBinaryPath: Schema.String,
  version: Schema.NullOr(Schema.String),
  homePath: Schema.String,
  resolvedHomePath: Schema.String,
  shadowHomePath: Schema.String,
  authJsonPresent: Schema.Boolean,
  configTomlPresent: Schema.Boolean,
  sessionsDirectoryPresent: Schema.Boolean,
  appServerUrlConfigured: Schema.Boolean,
  appServerUrl: Schema.String,
  appServerTransport: Schema.Literals(["stdio", "websocket", "unix-socket"]),
  appServerTokenEnvVar: Schema.String,
  appServerTokenPresent: Schema.Boolean,
  appServerWarnings: Schema.Array(Schema.String),
  initialize: ServerCodexBackendDiagnosticsCheck,
  userAgent: Schema.NullOr(Schema.String),
  platformFamily: Schema.NullOr(Schema.String),
  platformOs: Schema.NullOr(Schema.String),
  protocolCompatibility: ServerCodexBackendDiagnosticsCheck,
  schemaUpstreamRef: Schema.String,
});
export type ServerCodexBackendDiagnosticsResult = typeof ServerCodexBackendDiagnosticsResult.Type;

export const ServerCodexOfficialThreadsInput = Schema.Struct({
  instanceId: Schema.optional(ProviderInstanceId),
  cwd: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveInt),
});
export type ServerCodexOfficialThreadsInput = typeof ServerCodexOfficialThreadsInput.Type;

export const ServerCodexOfficialThread = Schema.Struct({
  officialThreadId: Schema.String,
  resumeCursor: Schema.Struct({
    threadId: Schema.String,
  }),
  name: Schema.NullOr(Schema.String),
  preview: Schema.String,
  cwd: Schema.String,
  sourceLabel: Schema.String,
  statusLabel: Schema.String,
  createdAtUnixSeconds: NonNegativeInt,
  updatedAtUnixSeconds: NonNegativeInt,
});
export type ServerCodexOfficialThread = typeof ServerCodexOfficialThread.Type;

export const ServerCodexOfficialThreadsResult = Schema.Struct({
  readAt: Schema.DateTimeUtc,
  instanceId: ProviderInstanceId,
  appServerTransport: Schema.Literals(["stdio", "websocket", "unix-socket"]),
  appServerWarnings: Schema.Array(Schema.String),
  threadList: ServerCodexBackendDiagnosticsCheck,
  threads: Schema.Array(ServerCodexOfficialThread),
  nextCursor: Schema.NullOr(Schema.String),
  backwardsCursor: Schema.NullOr(Schema.String),
});
export type ServerCodexOfficialThreadsResult = typeof ServerCodexOfficialThreadsResult.Type;
