# OpenClaw Gateway Adapter

This document describes how `@penclipai/adapter-openclaw-gateway` invokes OpenClaw over the Gateway protocol.

## Transport

This adapter always uses WebSocket gateway transport.

- URL must be `ws://` or `wss://`
- Protocol negotiation advertises `minProtocol=3,maxProtocol=4`
- A gateway that omits the returned `protocol` is treated as protocol 3 for backward compatibility
- Connect flow follows gateway protocol:
1. receive `connect.challenge`
2. send `req connect` (protocol range, client, caps, commands, permissions, locale, auth, and device payload)
3. send `req agent`
4. wait for completion via `req agent.wait`
5. stream `event agent` frames into Paperclip logs/transcript parsing

## Gateway Protocol v3/v4

`@penclipai/adapter-openclaw-gateway` supports OpenClaw Gateway protocol v3 and v4.

- v3 gateways continue to receive the same core connect fields (`client`, `role`, `scopes`, `auth`, `device`) plus extra v4 declaration fields that should be ignored by tolerant v3 implementations.
- v4 gateways receive conservative capability declarations:
  - `caps`: `agent`, `agent.wait`
  - `commands`: `agent`, `agent.wait`
  - `permissions.scopes`: `true`
  - top-level `scopes`: the configured scope names
  - `locale` and `userAgent`
- The adapter does not claim support for gateway commands it does not call.
- The `hello-ok.policy` object may include fields such as `maxPayload`, `maxBufferedBytes`, or `tickIntervalMs`; these are parsed safely and unknown policy fields are tolerated.

If you see `PROTOCOL_MISMATCH`, compare the details:

- `expectedProtocol=4` with `clientMinProtocol=3,clientMaxProtocol=3` means the Paperclip adapter is too old; use a build that advertises protocol `3..4`.
- `expectedProtocol` greater than 4 means the OpenClaw Gateway is newer than this adapter; upgrade Paperclip.
- `expectedProtocol` lower than 3 means the gateway is older than this adapter's supported range; upgrade OpenClaw Gateway or run a v3/v4 compatible gateway.

The adapter includes gateway `details` in the returned error message so operators can distinguish adapter-version issues from auth or pairing problems.

## Auth Modes

Gateway credentials can be provided in any of these ways:

- `authToken` / `token` in adapter config
- `headers.x-openclaw-token`
- `headers.x-openclaw-auth` (legacy)
- `password` (shared password mode)

When a token is present and `authorization` header is missing, the adapter derives `Authorization: Bearer <token>`.

## Device Auth

By default the adapter sends a signed `device` payload in `connect` params.

- set `disableDeviceAuth=true` to omit device signing
- set `devicePrivateKeyPem` to pin a stable signing key
- without `devicePrivateKeyPem`, the adapter generates an ephemeral Ed25519 keypair per run
- when `autoPairOnFirstConnect` is enabled (default), the adapter handles one initial `pairing required` by calling `device.pair.list` + `device.pair.approve` over shared auth, then retries once.
- device auth remains nonce-bound to `connect.challenge`; current v4 gateways accept the same top-level `device.signature` shape used by v3 and reject extra `device.signatures` fields.

## Session Strategy

The adapter supports the same session routing model as HTTP OpenClaw mode:

- `sessionKeyStrategy=issue|fixed|run`
- `sessionKey` is used when strategy is `fixed`

Resolved session key is sent as `agent.sessionKey`.

## Payload Mapping

The agent request is built as:

- required fields:
  - `message` (wake text plus optional `payloadTemplate.message`/`payloadTemplate.text` prefix)
  - `idempotencyKey` (Paperclip `runId`)
  - `sessionKey` (resolved strategy)
- optional additions:
  - all `payloadTemplate` fields merged in
  - `agentId` from config if set and not already in template
- protocol-specific Paperclip context:
  - protocol 3 receives root-level `paperclip` structured context for backward compatibility
  - protocol 4 omits root-level `paperclip` because current v4 gateways strictly reject unknown `agent` params; the same operational context remains embedded in `message`

## Timeouts

- `timeoutSec` controls adapter-level request budget
- `waitTimeoutMs` controls `agent.wait.timeoutMs`

If `agent.wait` returns `timeout`, adapter returns `openclaw_gateway_wait_timeout`.

## Troubleshooting

- `openclaw_gateway_protocol_mismatch`: inspect `expectedProtocol`, `clientMinProtocol`, and `clientMaxProtocol` in the error details. Upgrade/downgrade Paperclip or OpenClaw Gateway so the supported ranges overlap.
- `openclaw_gateway_invalid_request`: the gateway rejected connect or request params. Check URL, role, scopes, v4 capability fields, and strict `agent` schema errors such as `unexpected property`.
- `openclaw_gateway_auth_failed`: token/password is missing or wrong. Verify `authToken`, `headers.x-openclaw-token`, or `headers.x-openclaw-auth`.
- `openclaw_gateway_pairing_required`: device auth reached the gateway but the device is not paired. Approve the pending OpenClaw device or ensure `autoPairOnFirstConnect` has a valid shared token/password.
- `openclaw_gateway_timeout`: the WebSocket, connect.challenge, request, or wait step timed out. Confirm the URL points at the Gateway WebSocket endpoint and that the gateway is healthy.

## Log Format

Structured gateway event logs use:

- `[openclaw-gateway] ...` for lifecycle/system logs
- `[openclaw-gateway:event] run=<id> stream=<stream> data=<json>` for `event agent` frames

UI/CLI parsers consume these lines to render transcript updates.

## No-remote-git contract

Like every Paperclip adapter, this one must treat the local execution-workspace
cwd as the only persistence boundary across runs — no `git push` from runtime
code, no assuming a `git remote` exists. The gateway transport here doesn't
touch the workspace directly, but if you extend the adapter to ship code to
the OpenClaw side, use the round-trip helpers in `@paperclipai/adapter-utils`
(`prepareWorkspaceForSshExecution` → `restoreWorkspaceFromSshExecution`)
rather than reaching for a git remote. See
[`packages/adapters/AUTHORING.md`](../AUTHORING.md#no-remote-git-contract-cross-run-persistence)
for the full contract and the pinning test at
[`packages/adapter-utils/src/ssh-fixture.test.ts`](../../adapter-utils/src/ssh-fixture.test.ts).
