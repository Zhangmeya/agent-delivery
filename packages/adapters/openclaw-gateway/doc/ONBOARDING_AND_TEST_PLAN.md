# OpenClaw Gateway Onboarding and Test Plan

## Scope
This plan is now **gateway-only**. Paperclip supports OpenClaw through `openclaw_gateway` only.

- Removed path: legacy `openclaw` adapter (`/v1/responses`, `/hooks/*`, SSE/webhook transport switching)
- Supported path: `openclaw_gateway` over WebSocket (`ws://` or `wss://`)

## Requirements
1. OpenClaw test image must be stock/clean every run.
2. Onboarding must work from one primary prompt pasted into OpenClaw (optional one follow-up ping allowed).
3. Device auth stays enabled by default; pairing is persisted via `adapterConfig.devicePrivateKeyPem`.
4. Invite/access flow must be secure:
- invite prompt endpoint is board-permission protected
- CEO agent is allowed to invoke the invite prompt endpoint for their own company
5. E2E pass criteria must include the 3 functional task cases.

## Current Product Flow
1. Board/CEO opens company settings.
2. Click `Generate OpenClaw Invite Prompt`.
3. Paste generated prompt into OpenClaw chat.
4. OpenClaw submits invite acceptance with:
- `adapterType: "openclaw_gateway"`
- `agentDefaultsPayload.url: ws://... | wss://...`
- `agentDefaultsPayload.headers["x-openclaw-token"]`
5. Board approves join request.
6. OpenClaw claims API key and installs/uses Paperclip skill.
7. First task run may trigger pairing approval once; after approval, pairing persists via stored device key.

## Technical Contract (Gateway)
Gateway protocol support:
- Paperclip advertises `minProtocol=3,maxProtocol=4`.
- Protocol 3 gateways must continue to work.
- Protocol 4-only gateways should accept the current adapter. If a preflight or run returns `PROTOCOL_MISMATCH` with `expectedProtocol=4` and `clientMinProtocol=3,clientMaxProtocol=3`, the Paperclip adapter is too old and must be upgraded to a v4-compatible build.
- If `expectedProtocol` is greater than 4, the OpenClaw Gateway is newer than this adapter; upgrade Paperclip before publishing or assigning production agents.

`agentDefaultsPayload` minimum:
```json
{
  "url": "ws://127.0.0.1:18789",
  "headers": { "x-openclaw-token": "<gateway-token>" }
}
```

Recommended fields:
```json
{
  "paperclipApiUrl": "http://host.docker.internal:3100",
  "waitTimeoutMs": 120000,
  "sessionKeyStrategy": "issue",
  "role": "operator",
  "scopes": ["operator.admin"]
}
```

Security/pairing defaults:
- `disableDeviceAuth`: default false
- `devicePrivateKeyPem`: generated during join if missing

## Codex Automation Workflow

### 0) Reset and boot
```bash
OPENCLAW_DOCKER_DIR=/tmp/openclaw-docker
if [ -d "$OPENCLAW_DOCKER_DIR" ]; then
  docker compose -f "$OPENCLAW_DOCKER_DIR/docker-compose.yml" down --remove-orphans || true
fi

docker image rm openclaw:local || true
OPENCLAW_RESET_STATE=1 OPENCLAW_BUILD=1 ./scripts/smoke/openclaw-docker-ui.sh
```

### 1) Start Paperclip
```bash
pnpm dev --bind lan
curl -fsS http://127.0.0.1:3100/api/health
```

### 2) Invite + join + approval
- create invite prompt via `POST /api/companies/:companyId/openclaw/invite-prompt`
- paste prompt to OpenClaw
- approve join request
- assert created agent:
  - `adapterType == openclaw_gateway`
  - token header exists and length >= 16
  - `devicePrivateKeyPem` exists

### 3) Pairing stabilization
- if first run returns `pairing required`, approve pending device in OpenClaw
- rerun task and confirm success
- assert later runs do not require re-pairing for same agent

Preflight interpretation:
- `openclaw_gateway_probe_ok`: URL, token/password, role/scopes, and protocol overlap are good enough for connect.
- `PROTOCOL_MISMATCH`: adapter/gateway protocol ranges do not overlap; inspect `expectedProtocol`, `clientMinProtocol`, `clientMaxProtocol`, and `minimumProbeProtocol`.
- `pairing required`: protocol and shared auth are far enough along to create a device pairing request; approve the OpenClaw device or allow automatic pairing with a valid shared token/password.
- `missing token`, `invalid token`, `UNAUTHORIZED`, or `AUTH_REQUIRED`: gateway credentials are wrong or absent. Re-check `agentDefaultsPayload.headers["x-openclaw-token"]`, `authToken`, and the gateway's configured token.
- `invalid connect params`: the gateway rejected the connect shape; confirm the adapter is sending v3/v4-compatible client/caps array, commands array, and permissions fields.
- `invalid agent params` / `unexpected property`: the gateway accepted connect but rejected the `agent` request shape; confirm protocol 4 runs are not sending legacy root-level `paperclip` structured context.

### 4) Functional E2E assertions
1. Task assigned to OpenClaw is completed and closed.
2. Task asking OpenClaw to send main-webchat message succeeds (message visible in main chat).
3. In `/new` OpenClaw session, OpenClaw can still create a Paperclip task.

## Manual Smoke Checklist
Use [doc/OPENCLAW_ONBOARDING.md](../../../../doc/OPENCLAW_ONBOARDING.md) as the operator runbook.

Before assigning real work:
1. Confirm gateway URL is the WebSocket endpoint, for example `ws://127.0.0.1:18789/`.
2. Confirm token/password by running the adapter environment test or a read-only `connect.challenge` probe.
3. Confirm `devicePrivateKeyPem` exists for the agent unless `disableDeviceAuth=true` is intentionally set.
4. Confirm logs show `[openclaw-gateway] connected protocol=3` or `protocol=4`.

## Regression Gates
Required before merge:
```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

If full suite is too heavy locally, run at least:
```bash
pnpm --filter @penclipai/server test:run -- openclaw-gateway
pnpm --filter @penclipai/server typecheck
pnpm --filter @penclipai/ui typecheck
pnpm --filter paperclipai typecheck
```
