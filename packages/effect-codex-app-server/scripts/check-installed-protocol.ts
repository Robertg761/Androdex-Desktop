#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CLIENT_NOTIFICATION_METHODS,
  CLIENT_REQUEST_METHODS,
  SERVER_NOTIFICATION_METHODS,
  SERVER_REQUEST_METHODS,
  UPSTREAM_PROTOCOL_REF,
} from "../src/_generated/meta.gen.ts";

export interface ProtocolMethodGroups {
  readonly clientRequests: ReadonlySet<string>;
  readonly clientNotifications: ReadonlySet<string>;
  readonly serverRequests: ReadonlySet<string>;
  readonly serverNotifications: ReadonlySet<string>;
}

interface ProtocolDrift {
  readonly group: keyof ProtocolMethodGroups;
  readonly missingLocally: ReadonlyArray<string>;
  readonly missingFromInstalled: ReadonlyArray<string>;
}

export function parseOfficialProtocolMethods(fileContents: string): ReadonlySet<string> {
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
    clientRequests: new Set(Object.keys(CLIENT_REQUEST_METHODS)),
    clientNotifications: new Set(Object.keys(CLIENT_NOTIFICATION_METHODS)),
    serverRequests: new Set(Object.keys(SERVER_REQUEST_METHODS)),
    serverNotifications: new Set(Object.keys(SERVER_NOTIFICATION_METHODS)),
  };
}

function readOfficialProtocolMethods(outputDir: string): ProtocolMethodGroups {
  return {
    clientRequests: parseOfficialProtocolMethods(
      readFileSync(join(outputDir, "ClientRequest.ts"), "utf8"),
    ),
    clientNotifications: parseOfficialProtocolMethods(
      readFileSync(join(outputDir, "ClientNotification.ts"), "utf8"),
    ),
    serverRequests: parseOfficialProtocolMethods(
      readFileSync(join(outputDir, "ServerRequest.ts"), "utf8"),
    ),
    serverNotifications: parseOfficialProtocolMethods(
      readFileSync(join(outputDir, "ServerNotification.ts"), "utf8"),
    ),
  };
}

function compareProtocolMethods(input: {
  readonly local: ProtocolMethodGroups;
  readonly installed: ProtocolMethodGroups;
}): ReadonlyArray<ProtocolDrift> {
  return (Object.keys(input.local) as Array<keyof ProtocolMethodGroups>).flatMap((group) => {
    const local = input.local[group];
    const installed = input.installed[group];
    const missingLocally = [...installed].filter((method) => !local.has(method)).toSorted();
    const missingFromInstalled = [...local].filter((method) => !installed.has(method)).toSorted();
    return missingLocally.length === 0 && missingFromInstalled.length === 0
      ? []
      : [{ group, missingLocally, missingFromInstalled }];
  });
}

function formatDrift(drift: ProtocolDrift): string {
  const lines = [`${drift.group}:`];
  if (drift.missingLocally.length > 0) {
    lines.push(`  missing locally: ${drift.missingLocally.join(", ")}`);
  }
  if (drift.missingFromInstalled.length > 0) {
    lines.push(`  missing from installed Codex: ${drift.missingFromInstalled.join(", ")}`);
  }
  return lines.join("\n");
}

function readArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function shouldRunMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

function main() {
  const binary = readArgValue("--binary") ?? process.env.CODEX_BINARY ?? "codex";
  const includeExperimental = process.argv.includes("--experimental");
  const outputDir = mkdtempSync(join(tmpdir(), "codex-app-server-protocol-"));

  try {
    const version = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
    const args = ["app-server", "generate-ts", "--out", outputDir];
    if (includeExperimental) {
      args.push("--experimental");
    }
    execFileSync(binary, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

    const drift = compareProtocolMethods({
      local: localProtocolMethods(),
      installed: readOfficialProtocolMethods(outputDir),
    });

    console.log(`Installed Codex: ${version}`);
    console.log(`Local upstream protocol ref: ${UPSTREAM_PROTOCOL_REF}`);
    console.log(
      `Generated from installed binary: ${binary}${includeExperimental ? " --experimental" : ""}`,
    );

    if (drift.length === 0) {
      console.log("Protocol method sets match.");
      return;
    }

    console.error("Protocol method drift detected:");
    for (const entry of drift) {
      console.error(formatDrift(entry));
    }
    process.exitCode = 1;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

if (shouldRunMain()) {
  main();
}
