// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  CodexSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerCodexBackendDiagnosticsInput,
  type ServerCodexBackendDiagnosticsResult,
  type ServerCodexOfficialThreadsInput,
  type ServerCodexOfficialThreadsResult,
  type ServerSettings,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexRpc from "effect-codex-app-server/rpc";
import { UPSTREAM_PROTOCOL_REF } from "effect-codex-app-server/rpc";

import { buildCodexInitializeParams } from "./Layers/CodexProvider.ts";
import {
  isCodexAppServerRemoteConnection,
  parseCodexAppServerUrl,
  resolveCodexAppServerRemoteConnection,
} from "./Layers/CodexAppServerConnection.ts";
import { resolveCodexHomeLayout } from "./Drivers/CodexHomeLayout.ts";
import { mergeProviderInstanceEnvironment } from "./ProviderInstanceEnvironment.ts";
import { spawnAndCollect, type CommandResult } from "./providerSnapshot.ts";

const decodeCodexSettings = Schema.decodeUnknownEffect(CodexSettings);
const CODEX_DRIVER = ProviderDriverKind.make("codex");
const DEFAULT_CODEX_INSTANCE_ID = ProviderInstanceId.make("codex");

interface ProtocolMethodGroups {
  readonly clientRequests: ReadonlySet<string>;
  readonly clientNotifications: ReadonlySet<string>;
  readonly serverRequests: ReadonlySet<string>;
  readonly serverNotifications: ReadonlySet<string>;
}

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function pathExists(path: string): boolean {
  return NodeFS.existsSync(path);
}

function resolveBinaryPath(binaryPath: string, env: NodeJS.ProcessEnv): string {
  if (hasPathSeparator(binaryPath)) {
    return NodePath.resolve(binaryPath);
  }

  const pathValue = env.PATH ?? process.env.PATH ?? "";
  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter((entry) => entry.length > 0)
      : [""];

  for (const directory of pathValue.split(NodePath.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = NodePath.join(directory, `${binaryPath}${extension}`);
      if (pathExists(candidate)) return candidate;
    }
  }

  return binaryPath;
}

function configuredCodexHomePath(config: CodexSettings): string {
  return config.homePath.trim().length > 0 ? config.homePath.trim() : NodePath.join("~", ".codex");
}

function checkMessage(ok: boolean, message: string) {
  return { ok, message };
}

function squashMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function describeProtocolDrift(method: string, params: unknown): string {
  if (typeof params !== "object" || params === null) {
    return method;
  }
  const record = params as Readonly<Record<string, unknown>>;
  return record.schemaDecodeFailed === true ? `${method} (schema decode failed)` : method;
}

function parseOfficialProtocolMethods(fileContents: string): ReadonlySet<string> {
  const methods = new Set<string>();
  const methodPattern = /"method":\s*"([^"]+)"/gu;
  let match: RegExpExecArray | null;
  while ((match = methodPattern.exec(fileContents)) !== null) {
    methods.add(match[1]!);
  }
  return methods;
}

function localProtocolMethods(): ProtocolMethodGroups {
  return {
    clientRequests: new Set(Object.keys(CodexRpc.CLIENT_REQUEST_METHODS)),
    clientNotifications: new Set(Object.keys(CodexRpc.CLIENT_NOTIFICATION_METHODS)),
    serverRequests: new Set(Object.keys(CodexRpc.SERVER_REQUEST_METHODS)),
    serverNotifications: new Set(Object.keys(CodexRpc.SERVER_NOTIFICATION_METHODS)),
  };
}

function readGeneratedProtocolMethods(outputDir: string): ProtocolMethodGroups {
  return {
    clientRequests: parseOfficialProtocolMethods(
      NodeFS.readFileSync(NodePath.join(outputDir, "ClientRequest.ts"), "utf8"),
    ),
    clientNotifications: parseOfficialProtocolMethods(
      NodeFS.readFileSync(NodePath.join(outputDir, "ClientNotification.ts"), "utf8"),
    ),
    serverRequests: parseOfficialProtocolMethods(
      NodeFS.readFileSync(NodePath.join(outputDir, "ServerRequest.ts"), "utf8"),
    ),
    serverNotifications: parseOfficialProtocolMethods(
      NodeFS.readFileSync(NodePath.join(outputDir, "ServerNotification.ts"), "utf8"),
    ),
  };
}

function compareProtocolMethods(input: {
  readonly local: ProtocolMethodGroups;
  readonly installed: ProtocolMethodGroups;
}): ReadonlyArray<string> {
  return (Object.keys(input.local) as Array<keyof ProtocolMethodGroups>).flatMap((group) => {
    const local = input.local[group];
    const installed = input.installed[group];
    const missingLocally = [...installed].filter((method) => !local.has(method)).toSorted();
    const missingFromInstalled = [...local].filter((method) => !installed.has(method)).toSorted();
    if (missingLocally.length === 0 && missingFromInstalled.length === 0) {
      return [];
    }
    return [
      [
        group,
        missingLocally.length > 0 ? `missing locally: ${missingLocally.join(", ")}` : null,
        missingFromInstalled.length > 0
          ? `missing from installed Codex: ${missingFromInstalled.join(", ")}`
          : null,
      ]
        .filter((entry): entry is string => entry !== null)
        .join(" - "),
    ];
  });
}

function readInstalledProtocolDrift(input: {
  readonly binaryPath: string;
  readonly processEnv: Record<string, string>;
}): Effect.Effect<ReadonlyArray<string>, never, ChildProcessSpawner.ChildProcessSpawner> {
  return Effect.gen(function* () {
    const outputDir = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "androdex-codex-protocol-"),
    );
    try {
      const generateResult = yield* spawnAndCollect(
        input.binaryPath,
        ChildProcess.make(input.binaryPath, ["app-server", "generate-ts", "--out", outputDir], {
          env: input.processEnv,
          shell: process.platform === "win32",
        }),
      );
      if (generateResult.code !== 0) {
        return [
          `Installed Codex protocol generation failed with exit code ${generateResult.code}: ${
            generateResult.stderr.trim() || generateResult.stdout.trim() || "no output"
          }`,
        ];
      }

      return compareProtocolMethods({
        local: localProtocolMethods(),
        installed: readGeneratedProtocolMethods(outputDir),
      });
    } finally {
      NodeFS.rmSync(outputDir, { recursive: true, force: true });
    }
  }).pipe(
    Effect.timeoutOption(Duration.seconds(8)),
    Effect.map((option) => (option._tag === "Some" ? option.value : ["Timed out"])),
    Effect.catch((cause: unknown) =>
      Effect.succeed([`Installed Codex protocol generation failed: ${squashMessage(cause)}`]),
    ),
  );
}

function withCodexHomeEnvironment(
  environment: NodeJS.ProcessEnv,
  resolvedHomePath: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  result.CODEX_HOME = resolvedHomePath;
  return result;
}

interface ResolvedCodexDiagnosticsConfig {
  readonly instanceId: ProviderInstanceId;
  readonly environment: NodeJS.ProcessEnv;
  readonly config: CodexSettings;
}

function readCodexConfig(input: {
  readonly settings: ServerSettings;
  readonly instanceId?: ProviderInstanceId;
}): Effect.Effect<ResolvedCodexDiagnosticsConfig, Schema.SchemaError> {
  return Effect.gen(function* () {
    if (input.instanceId !== undefined) {
      const instance = input.settings.providerInstances[input.instanceId];
      if (instance?.driver === CODEX_DRIVER) {
        return {
          instanceId: input.instanceId,
          environment: mergeProviderInstanceEnvironment(instance.environment),
          config: yield* decodeCodexSettings(instance.config ?? {}),
        };
      }
    }

    return {
      instanceId: DEFAULT_CODEX_INSTANCE_ID,
      environment: process.env,
      config: input.settings.providers.codex,
    };
  });
}

function codexClientLayerFor(input: {
  readonly binaryPath: string;
  readonly processEnv: Record<string, string>;
  readonly appServerResolution: ReturnType<typeof resolveCodexAppServerRemoteConnection>;
}): Layer.Layer<
  CodexClient.CodexAppServerClient,
  CodexErrors.CodexAppServerError,
  ChildProcessSpawner.ChildProcessSpawner
> {
  return isCodexAppServerRemoteConnection(input.appServerResolution)
    ? CodexClient.layerWebSocket({
        url: input.appServerResolution.url,
        ...(input.appServerResolution.bearerToken
          ? { bearerToken: input.appServerResolution.bearerToken }
          : {}),
      })
    : CodexClient.layerCommand({
        command: input.binaryPath,
        args: ["app-server"],
        cwd: process.cwd(),
        env: input.processEnv,
      });
}

function sourceLabel(
  source: CodexRpc.ClientRequestResponsesByMethod["thread/list"]["data"][number]["source"],
): string {
  if (typeof source === "string") {
    return source;
  }
  if ("custom" in source) {
    return source.custom;
  }
  return "subAgent";
}

function statusLabel(
  status: CodexRpc.ClientRequestResponsesByMethod["thread/list"]["data"][number]["status"],
): string {
  if (status.type !== "active") {
    return status.type;
  }
  return status.activeFlags.length > 0 ? `active:${status.activeFlags.join(",")}` : "active";
}

export function readCodexBackendDiagnostics(
  input: ServerCodexBackendDiagnosticsInput,
  settings: ServerSettings,
): Effect.Effect<
  ServerCodexBackendDiagnosticsResult,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Path.Path
> {
  return Effect.gen(function* () {
    const readAt = yield* DateTime.now;
    const { instanceId, environment, config } = yield* readCodexConfig({
      settings,
      ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          instanceId: DEFAULT_CODEX_INSTANCE_ID,
          environment: process.env,
          config: settings.providers.codex,
        }),
      ),
    );

    const homeLayout = yield* resolveCodexHomeLayout(config);
    const resolvedHomePath =
      homeLayout.effectiveHomePath ?? NodePath.resolve(NodeOS.homedir(), ".codex");
    const appServerResolution = resolveCodexAppServerRemoteConnection(
      { ...config, homePath: resolvedHomePath },
      environment,
    );
    const appServerUrl = config.appServerUrl.trim();
    const appServerUrlInfo = appServerUrl ? parseCodexAppServerUrl(appServerUrl) : undefined;
    const binaryPath = config.binaryPath;
    const resolvedBinaryPath = resolveBinaryPath(binaryPath, environment);
    const appServerWarnings = [
      ...(appServerResolution?.warnings ?? []),
      ...(config.shadowHomePath.trim().length > 0
        ? [
            "Shadow Codex homes isolate auth. Full official Codex sync requires using the same real CODEX_HOME or the same running app-server.",
          ]
        : []),
    ];

    const processEnv = withCodexHomeEnvironment(environment, resolvedHomePath);
    const versionResult: Result.Result<CommandResult, unknown> = yield* spawnAndCollect(
      binaryPath,
      ChildProcess.make(binaryPath, ["--version"], {
        env: processEnv,
        shell: process.platform === "win32",
      }),
    ).pipe(
      Effect.timeoutOption(Duration.seconds(4)),
      Effect.map((option) =>
        option._tag === "Some" ? Result.succeed(option.value) : Result.fail("Timed out"),
      ),
      Effect.catch((cause: unknown) => Effect.succeed(Result.fail(cause))),
    );
    const version =
      Result.isSuccess(versionResult) && versionResult.success.code === 0
        ? versionResult.success.stdout.trim() || versionResult.success.stderr.trim() || null
        : null;

    const initializeResult: Result.Result<
      {
        readonly initialized: CodexRpc.ClientRequestResponsesByMethod["initialize"];
        readonly protocolDrift: ReadonlyArray<string>;
      },
      unknown
    > = yield* Effect.scoped(
      Effect.gen(function* () {
        const protocolDrift: string[] = [];
        const clientLayer = codexClientLayerFor({
          binaryPath,
          processEnv,
          appServerResolution,
        });

        const clientContext = yield* Layer.build(clientLayer);
        const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
          Effect.provide(clientContext),
        );
        yield* client.handleUnknownServerNotification((method, params) =>
          Effect.sync(() => {
            protocolDrift.push(describeProtocolDrift(method, params));
          }),
        );
        const initialized = yield* client.request("initialize", buildCodexInitializeParams());
        yield* client.notify("initialized", undefined);
        yield* Effect.sleep(Duration.millis(50));
        return {
          initialized,
          protocolDrift,
        };
      }),
    ).pipe(
      Effect.timeoutOption(Duration.seconds(8)),
      Effect.map((option) =>
        option._tag === "Some" ? Result.succeed(option.value) : Result.fail("Timed out"),
      ),
      Effect.catch((cause: unknown) => Effect.succeed(Result.fail(cause))),
    );

    const initializeOk = Result.isSuccess(initializeResult);
    const initializeMessage = initializeOk
      ? "App-server initialize handshake succeeded."
      : `App-server initialize handshake failed: ${squashMessage(initializeResult.failure)}.`;
    const protocolDrift = initializeOk ? initializeResult.success.protocolDrift : [];
    const installedProtocolDrift = appServerResolution
      ? []
      : yield* readInstalledProtocolDrift({ binaryPath, processEnv });
    const protocolOk =
      initializeOk && protocolDrift.length === 0 && installedProtocolDrift.length === 0;
    const protocolMessage = !initializeOk
      ? "Protocol compatibility could not be verified because initialize failed."
      : protocolOk
        ? appServerResolution
          ? "Initialize response and startup notifications matched local generated schemas. Installed-binary method-set comparison is skipped for remote app-server endpoints."
          : "Initialize response, startup notifications, and installed Codex method sets matched local generated schemas."
        : [
            "Initialize response decoded, but protocol compatibility drift was observed.",
            protocolDrift.length > 0
              ? `Unknown or drifted startup notifications: ${protocolDrift.join(", ")}.`
              : null,
            installedProtocolDrift.length > 0
              ? `Installed binary method-set drift: ${installedProtocolDrift.join("; ")}.`
              : null,
          ]
            .filter((entry): entry is string => entry !== null)
            .join(" ");

    return {
      readAt,
      instanceId,
      binaryPath,
      resolvedBinaryPath,
      version,
      homePath: configuredCodexHomePath(config),
      resolvedHomePath,
      shadowHomePath: config.shadowHomePath.trim(),
      authJsonPresent: pathExists(NodePath.join(resolvedHomePath, "auth.json")),
      configTomlPresent: pathExists(NodePath.join(resolvedHomePath, "config.toml")),
      sessionsDirectoryPresent:
        pathExists(NodePath.join(resolvedHomePath, "sessions")) ||
        pathExists(NodePath.join(resolvedHomePath, "sqlite")),
      appServerUrlConfigured: appServerUrl.length > 0,
      appServerUrl,
      appServerTransport: appServerResolution
        ? appServerResolution.transport
        : (appServerUrlInfo?.transport ?? "stdio"),
      appServerTokenEnvVar: appServerResolution?.tokenEnvVar ?? config.appServerTokenEnvVar,
      appServerTokenPresent:
        appServerResolution?.bearerToken !== undefined &&
        appServerResolution.bearerToken.trim().length > 0,
      appServerWarnings,
      initialize: checkMessage(initializeOk, initializeMessage),
      userAgent: initializeOk ? initializeResult.success.initialized.userAgent : null,
      platformFamily: initializeOk ? initializeResult.success.initialized.platformFamily : null,
      platformOs: initializeOk ? initializeResult.success.initialized.platformOs : null,
      protocolCompatibility: checkMessage(protocolOk, protocolMessage),
      schemaUpstreamRef: UPSTREAM_PROTOCOL_REF,
    };
  });
}

export function readCodexOfficialThreads(
  input: ServerCodexOfficialThreadsInput,
  settings: ServerSettings,
): Effect.Effect<
  ServerCodexOfficialThreadsResult,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Path.Path
> {
  return Effect.gen(function* () {
    const readAt = yield* DateTime.now;
    const { instanceId, environment, config } = yield* readCodexConfig({
      settings,
      ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          instanceId: DEFAULT_CODEX_INSTANCE_ID,
          environment: process.env,
          config: settings.providers.codex,
        }),
      ),
    );

    const homeLayout = yield* resolveCodexHomeLayout(config);
    const resolvedHomePath =
      homeLayout.effectiveHomePath ?? NodePath.resolve(NodeOS.homedir(), ".codex");
    const appServerResolution = resolveCodexAppServerRemoteConnection(
      { ...config, homePath: resolvedHomePath },
      environment,
    );
    const appServerUrl = config.appServerUrl.trim();
    const appServerUrlInfo = appServerUrl ? parseCodexAppServerUrl(appServerUrl) : undefined;
    const processEnv = withCodexHomeEnvironment(environment, resolvedHomePath);
    const appServerWarnings = [
      ...(appServerResolution?.warnings ?? []),
      ...(config.shadowHomePath.trim().length > 0
        ? [
            "Shadow Codex homes isolate official thread history. Full sync requires using the same real CODEX_HOME or the same running app-server.",
          ]
        : []),
    ];

    const threadListResult = yield* Effect.scoped(
      Effect.gen(function* () {
        const clientLayer = codexClientLayerFor({
          binaryPath: config.binaryPath,
          processEnv,
          appServerResolution,
        });
        const clientContext = yield* Layer.build(clientLayer);
        const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
          Effect.provide(clientContext),
        );
        yield* client.request("initialize", buildCodexInitializeParams());
        yield* client.notify("initialized", undefined);
        return yield* client.request("thread/list", {
          ...(input.cwd ? { cwd: input.cwd } : {}),
          limit: input.limit ?? 50,
          sortKey: "updated_at",
          sortDirection: "desc",
          sourceKinds: [],
        });
      }),
    ).pipe(
      Effect.timeoutOption(Duration.seconds(8)),
      Effect.map((option) =>
        option._tag === "Some" ? Result.succeed(option.value) : Result.fail(new Error("Timed out")),
      ),
      Effect.catch((cause: unknown) => Effect.succeed(Result.fail(cause))),
    );

    const threadList = Result.isSuccess(threadListResult)
      ? threadListResult.success
      : { data: [], nextCursor: null, backwardsCursor: null };
    if (Result.isFailure(threadListResult)) {
      yield* Effect.logWarning("Failed to list official Codex app-server threads", {
        instanceId,
        cause: squashMessage(threadListResult.failure),
      });
    }

    return {
      readAt,
      instanceId,
      appServerTransport: appServerResolution
        ? appServerResolution.transport
        : (appServerUrlInfo?.transport ?? "stdio"),
      appServerWarnings,
      threadList: checkMessage(
        Result.isSuccess(threadListResult),
        Result.isSuccess(threadListResult)
          ? "Official Codex thread list loaded through app-server."
          : `Official Codex thread list failed: ${squashMessage(threadListResult.failure)}.`,
      ),
      threads: threadList.data.map((thread) => ({
        officialThreadId: thread.id,
        resumeCursor: { threadId: thread.id },
        name: thread.name ?? null,
        preview: thread.preview,
        cwd: thread.cwd,
        sourceLabel: sourceLabel(thread.source),
        statusLabel: statusLabel(thread.status),
        createdAtUnixSeconds: thread.createdAt,
        updatedAtUnixSeconds: thread.updatedAt,
      })),
      nextCursor: threadList.nextCursor ?? null,
      backwardsCursor: threadList.backwardsCursor ?? null,
    };
  });
}
