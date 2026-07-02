---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm penclip issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm penclip issue get <issue-id-or-identifier>

# Create issue
pnpm penclip issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm penclip issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm penclip issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm penclip issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm penclip issue release <issue-id>
```

## Company Commands

```sh
pnpm penclip company list
pnpm penclip company get <company-id>
pnpm penclip company current [--company-id <company-id>]

# Export to portable folder package (writes manifest + markdown files)
pnpm penclip company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm penclip company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# Apply import
pnpm penclip company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

With agent authentication, use `company list` or `company current` to resolve
the scoped company. `company list` first tries the board-wide list; if that is
forbidden, it falls back to `--company-id`, `PAPERCLIP_COMPANY_ID`, context, or
`/api/agents/me` and returns only that scoped company. `company create` requires
board/instance-admin authentication because it is an instance-wide setup
command.

## Agent Commands

```sh
pnpm penclip agent list
pnpm penclip agent get <agent-id>
```

## Skills Commands

```sh
# Browse app-shipped catalog skills without changing company state
pnpm penclip skills browse [--kind bundled|optional] [--category software-development] [--query github]
pnpm penclip skills search "pull request" [--json]

# Inspect catalog metadata and file inventory before install
pnpm penclip skills inspect github-pr-workflow

# Install a catalog skill into the company skill library
# This does not attach the skill to any agent.
pnpm penclip skills install github-pr-workflow --company-id <company-id>
pnpm penclip skills install github-pr-workflow --as pr-flow --force --company-id <company-id>

# External sources still use import instead of catalog install
pnpm penclip skills import ./skills/my-skill --company-id <company-id>
pnpm penclip skills import owner/repo/path/to/skill --company-id <company-id>

# Attach desired company skills to an agent after install/import
pnpm penclip skills agent sync <agent-id> --skill github-pr-workflow --company-id <company-id>
```

## Approval Commands

```sh
# List approvals
pnpm penclip approval list [--status pending]

# Get approval
pnpm penclip approval get <approval-id>

# Create approval
pnpm penclip approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm penclip approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm penclip approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm penclip approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm penclip approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm penclip approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm penclip activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm penclip dashboard get
```

## Instance Settings

```sh
pnpm paperclipai instance settings:general
pnpm paperclipai instance settings:general:update --payload-json '{...}'
pnpm paperclipai instance settings:experimental
pnpm paperclipai instance settings:experimental:update --payload-json '{...}'
```

Experimental features are opt-in and are provided without compatibility guarantees. They may break, change, or be removed at any time. Use them at your own risk.

## Heartbeat

```sh
pnpm penclip heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
