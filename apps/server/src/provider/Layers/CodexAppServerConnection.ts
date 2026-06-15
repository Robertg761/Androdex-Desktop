import type { CodexSettings } from "@t3tools/contracts";

import { expandHomePath } from "../../pathExpansion.ts";

export const DEFAULT_CODEX_APP_SERVER_TOKEN_ENV_VAR = "CODEX_APP_SERVER_TOKEN";
export const CODEX_APP_SERVER_DEFAULT_UNIX_SOCKET_RELATIVE_PATH =
  "app-server-control/app-server-control.sock";
export const CODEX_APP_SERVER_WEBSOCKET_EXPERIMENTAL_WARNING =
  "Codex app-server WebSocket transport is experimental and unsupported; keep it local, SSH-forwarded, VPN-protected, or otherwise private.";

export interface CodexAppServerRemoteConnection {
  readonly url: string;
  readonly transport: "websocket" | "unix-socket";
  readonly isLoopback: boolean;
  readonly warnings: ReadonlyArray<string>;
  readonly bearerToken?: string;
  readonly tokenEnvVar: string;
}

export type CodexAppServerRemoteResolution = CodexAppServerRemoteConnection | undefined;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path);
}

function joinPath(left: string, right: string): string {
  return `${left.replace(/[\\/]+$/u, "")}/${right.replace(/^[\\/]+/u, "")}`;
}

function expandHomePathWithEnvironment(path: string, environment: NodeJS.ProcessEnv): string {
  if (path === "~") {
    return environment.HOME ?? expandHomePath(path);
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return joinPath(environment.HOME ?? expandHomePath("~"), path.slice(2));
  }
  return path;
}

function resolvePath(path: string, environment: NodeJS.ProcessEnv): string {
  const expanded = expandHomePathWithEnvironment(path, environment);
  return isAbsolutePath(expanded) ? expanded : joinPath(process.cwd(), expanded);
}

export function resolveCodexDefaultUnixSocketPath(
  homePath: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuredHome =
    homePath && homePath.trim().length > 0
      ? homePath.trim()
      : (environment.CODEX_HOME ?? "~/.codex");
  return joinPath(
    resolvePath(configuredHome, environment),
    CODEX_APP_SERVER_DEFAULT_UNIX_SOCKET_RELATIVE_PATH,
  );
}

function resolveRemoteUrl(
  url: string,
  settings: CodexSettings,
  environment: NodeJS.ProcessEnv,
): string {
  return url === "unix://"
    ? `unix://${resolveCodexDefaultUnixSocketPath(settings.homePath, environment)}`
    : url;
}

export function parseCodexAppServerUrl(url: string): {
  readonly transport: "websocket" | "unix-socket";
  readonly isLoopback: boolean;
  readonly warnings: ReadonlyArray<string>;
} {
  const trimmed = url.trim();
  if (trimmed.startsWith("unix://")) {
    return {
      transport: "unix-socket",
      isLoopback: true,
      warnings: [],
    };
  }

  const warnings = [CODEX_APP_SERVER_WEBSOCKET_EXPERIMENTAL_WARNING];
  try {
    const parsed = new URL(trimmed);
    const isWebSocket = parsed.protocol === "ws:" || parsed.protocol === "wss:";
    if (!isWebSocket) {
      return {
        transport: "websocket",
        isLoopback: false,
        warnings: [
          ...warnings,
          "Codex app-server URL must use ws://, wss://, or unix://. HTTP(S) URLs are Androdex backend URLs, not raw app-server transports.",
        ],
      };
    }
    const isLoopback = isWebSocket && isLoopbackHostname(parsed.hostname);
    return {
      transport: "websocket",
      isLoopback,
      warnings: isLoopback
        ? warnings
        : [
            ...warnings,
            "Non-loopback Codex app-server URLs can expose raw runtime control; do not expose unauthenticated listeners on shared or public networks.",
          ],
    };
  } catch {
    return {
      transport: "websocket",
      isLoopback: false,
      warnings: [
        ...warnings,
        "Codex app-server URL could not be parsed; expected ws://127.0.0.1:PORT, wss://HOST, or unix://PATH.",
      ],
    };
  }
}

export function resolveCodexAppServerRemoteConnection(
  settings: CodexSettings,
  environment: NodeJS.ProcessEnv = process.env,
): CodexAppServerRemoteResolution {
  const url = settings.appServerUrl.trim();
  if (!url) {
    return undefined;
  }

  const tokenEnvVar =
    settings.appServerTokenEnvVar.trim() || DEFAULT_CODEX_APP_SERVER_TOKEN_ENV_VAR;
  const bearerToken = environment[tokenEnvVar]?.trim();
  const parsed = parseCodexAppServerUrl(url);
  const resolvedUrl = resolveRemoteUrl(url, settings, environment);

  return {
    url: resolvedUrl,
    ...parsed,
    ...(bearerToken ? { bearerToken } : {}),
    tokenEnvVar,
  };
}

export function isCodexAppServerRemoteConnection(
  resolution: CodexAppServerRemoteResolution,
): resolution is CodexAppServerRemoteConnection {
  return resolution !== undefined;
}
