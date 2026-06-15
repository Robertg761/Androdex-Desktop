# Official Codex Backend

Androdex should treat `codex app-server` as the source of truth for Codex runtime behavior. The
server-side Codex provider starts or connects to official app-server, then projects its JSON-RPC
events into Androdex orchestration state for the UI.

Official reference: https://developers.openai.com/codex/sdk/#app-server

## Recommended Modes

### Local Stable

Use the official `codex` binary and let Androdex spawn app-server over stdio:

```text
providers.codex.binaryPath = codex
providers.codex.homePath = ~/.codex
providers.codex.appServerUrl = empty
```

This is the stable default transport. Androdex runs `codex app-server`, sends `initialize`, then
starts or resumes threads through app-server APIs.

### Local Shared Endpoint

Start a local official app-server yourself:

```bash
codex app-server --listen ws://127.0.0.1:4500
```

Configure Androdex:

```text
providers.codex.appServerUrl = ws://127.0.0.1:4500
providers.codex.appServerTokenEnvVar = CODEX_APP_SERVER_TOKEN
```

WebSocket transport is experimental and unsupported by OpenAI. Keep it on loopback, behind SSH
forwarding, VPN, or another private channel. Do not expose a raw app-server listener to shared or
public networks.

For non-loopback listeners, use the official app-server WebSocket auth flags and put the resulting
client token in the configured environment variable before starting Androdex. Current Codex builds
support capability-token and signed-bearer-token modes:

```bash
codex app-server --listen ws://127.0.0.1:4500 \
  --ws-auth capability-token \
  --ws-token-file /path/to/codex-app-server.token
```

### Local Unix Socket

Where available, start app-server on a Unix socket:

```bash
codex app-server --listen unix:///tmp/codex-app-server.sock
```

Codex also supports its default control socket:

```bash
codex app-server --listen unix://
```

Configure:

```text
providers.codex.appServerUrl = unix:///tmp/codex-app-server.sock
```

Or, for the default control socket:

```text
providers.codex.appServerUrl = unix://
```

`unix://PATH` is local-only and avoids opening a TCP listener. Bare `unix://` resolves through the
configured Codex home to `CODEX_HOME/app-server-control/app-server-control.sock`, matching Codex's
default control socket convention.

### Remote SSH

For SSH hosts, run the official Codex binary on the remote host and communicate through SSH-managed
or SSH-forwarded local-only transport. The remote host should own:

- the Codex binary
- `CODEX_HOME`, credentials, and session state
- tools, MCP servers, skills, plugins, and filesystem
- sandbox and approval behavior

Do not expose raw app-server transports on public networks. Prefer SSH forwarding, VPN, or mesh
networking.

The simplest remote mode is an SSH command that starts app-server remotely and forwards the remote
loopback listener to local loopback:

```bash
ssh -L 4500:127.0.0.1:4500 my-ssh-host \
  'codex app-server --listen ws://127.0.0.1:4500'
```

Then configure the local Androdex backend with:

```text
providers.codex.appServerUrl = ws://127.0.0.1:4500
```

This makes the provider talk to the remote host's Codex binary, Codex home, credentials, tools, MCP
servers, skills, plugins, and filesystem while keeping the app-server transport off shared networks.

Desktop builds expose this through the Codex provider card as "SSH-managed official app-server".
The action uses the core `SshEnvironmentManager.ensureCodexAppServer` primitive to start
`codex app-server --listen ws://127.0.0.1:PORT` on the remote host, forward it to a local
`ws://127.0.0.1:PORT/` app-server URL, and save that URL to `providers.codex.appServerUrl`.

This is separate from the existing desktop SSH environment UI, which launches a full remote
Androdex backend for remote environment pairing. The Codex provider's SSH action is for using the
remote host's official Codex install directly as the Codex runtime source of truth.

## Sync Semantics

Full sync requires using the same real Codex home or the same running app-server. In practice:

- `providers.codex.homePath = ~/.codex` shares official Codex auth/config/session state.
- `providers.codex.shadowHomePath` isolates account auth while symlinking shared state for
  multi-account use.
- A shadow home is not full official sync with other Codex clients unless the real Codex home or
  running app-server is shared.

Androdex stores the official app-server thread id in `ProviderSession.resumeCursor.threadId`. On
restart or reconnect, the Codex runtime calls `thread/resume` with that id and only falls back to a
fresh `thread/start` for recoverable missing-thread errors.

The server exposes a read-only `server.listCodexOfficialThreads` RPC backed by app-server
`thread/list`. It returns official Codex thread ids and `{ threadId }` resume cursors without
creating Androdex projection threads. Use this as the reconciliation/import primitive: the official
thread id remains the durable cursor, and any Androdex-local records created from it are UI
projection state.

## Runtime Ownership

Official app-server owns:

- thread start, resume, fork, read, rollback, archive, and listing APIs where available
- turns and streaming notifications
- approvals and user-input requests
- command, file-change, tool, MCP, skill, plugin, auth, model, sandbox, and cwd behavior
- Codex home state and official resume semantics

Androdex owns:

- provider instance settings
- local projection state for sidebar/thread UI
- event logging and orchestration read models
- optional UI-only provider grouping, display name, and accent color

## Current Code Map

- `apps/server/src/provider/Layers/CodexSessionRuntime.ts`
  - Spawns `codex app-server` over stdio when `options.appServer` is absent.
  - Connects to a configured app-server URL through `CodexClient.layerWebSocket` when
    `options.appServer` is present.
  - Sets `CODEX_HOME` from the resolved provider `homePath`.
  - Calls `initialize`, emits `initialized`, then calls `thread/start` or `thread/resume`.
  - Stores the official app-server thread id as `resumeCursor: { threadId }`.
  - Registers app-server server requests for approvals, user input, and dynamic tools.
  - Registers app-server notifications and emits provider events for projection.

- `apps/server/src/provider/Layers/CodexAdapter.ts`
  - Converts provider start/send/interrupt/respond calls into `CodexSessionRuntime` calls.
  - Resolves `providers.codex.appServerUrl` through `CodexAppServerConnection`.
  - Projects provider events into Androdex `ProviderRuntimeEvent` objects.

- `apps/server/src/provider/Layers/CodexAppServerConnection.ts`
  - Resolves remote app-server URL config.
  - Reads bearer tokens from `providers.codex.appServerTokenEnvVar`, defaulting to
    `CODEX_APP_SERVER_TOKEN`.
  - Classifies WebSocket vs Unix socket URLs and warns for unsafe WebSocket exposure.

- `packages/effect-codex-app-server`
  - Contains generated Codex app-server schemas and typed JSON-RPC client helpers.
  - Provides stdio child-process transport, WebSocket transport, and Unix-socket WebSocket
    transport.
  - Unknown or drifted notifications are preserved through the unknown-notification hook.

- `packages/ssh/src/tunnel.ts`
  - Launches a full remote Androdex backend for desktop SSH environments.
  - Provides `ensureCodexAppServer` for SSH-managed official Codex app-server endpoints forwarded
    over local-only SSH tunnels.

- `apps/server/src/provider/Drivers/CodexHomeLayout.ts`
  - Resolves `homePath` and `shadowHomePath`.
  - Materializes shadow homes for multi-account configurations.
  - Defines continuation identity from the shared real Codex home.

- `apps/server/src/provider/CodexBackendDiagnostics.ts`
  - Reports binary, version, home, auth/config/session file presence, transport, initialize
    handshake result, platform fields, and schema compatibility status.
  - Lists official app-server threads through `thread/list` for read-only reconciliation surfaces.

## Schema Regeneration

The checked-in protocol bindings are version-specific. The official Codex binary can emit raw
TypeScript and JSON Schema protocol artifacts for inspection:

```bash
codex app-server generate-ts --out /tmp/codex-app-server-ts
codex app-server generate-json-schema --out /tmp/codex-app-server-json-schema
```

Do not copy those raw files directly into `packages/effect-codex-app-server/src/_generated`; this
package stores transformed Effect schemas plus local method maps. To check the installed official
binary against the checked-in local method maps, run:

```bash
cd packages/effect-codex-app-server
bun run check:installed-protocol
```

The existing Effect-schema generator can refresh local bindings from the pinned open-source Codex
repo ref:

```bash
cd packages/effect-codex-app-server
bun run generate
```

After regeneration, run:

```bash
bun fmt
bun lint
bun typecheck
bun run test --filter effect-codex-app-server
```

## Limitations

- Codex web and the IDE extension are not fully open source.
- OpenAI's secure relay and mobile infrastructure are not public app-server endpoints.
- WebSocket app-server transport is experimental and unsupported; keep it local or protected.
- Account, workspace, admin, and managed-configuration policies can gate features.
- File-based auth detection only checks local files. Codex may use an OS credential store instead.
