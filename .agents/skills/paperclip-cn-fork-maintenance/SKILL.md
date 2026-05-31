---
name: paperclip-cn-fork-maintenance
description: Maintain the long-lived Paperclip CN fork by focusing on zh-CN localization completeness, Windows compatibility, Electron packaging health, external adapter boundaries, and rebrand boundary discipline. Prefer short command-style invocations such as `$paperclip-cn-fork-maintenance sync-fork`, `review-drift`, `audit-i18n`, `audit-windows`, `audit-electron`, `audit-adapters`, or `audit-rebrand`. Use when reviewing `origin/master..private/master`, preparing upstream syncs, checking untranslated UI text, auditing Windows command/path/junction behavior, validating desktop packaging, preserving external-only adapter installs such as Hermes, or normalizing `paperclipai` to `penclip` without over-changing command surfaces.
---

# Paperclip CN Fork Maintenance

Keep the fork aligned with upstream structure while preserving only the intended long-lived differences.

This skill is for maintainers working on five long-term fork concerns:

1. zh-CN localization completeness
2. Windows compatibility
3. Electron packaging
4. External adapter boundary discipline
5. Rebrand boundary discipline

## Preferred Invocation

Use this skill with a short subcommand first, then optional extra scope.

Examples:

```text
$paperclip-cn-fork-maintenance sync-fork
$paperclip-cn-fork-maintenance review-drift
$paperclip-cn-fork-maintenance audit-i18n
$paperclip-cn-fork-maintenance audit-i18n-keys
$paperclip-cn-fork-maintenance audit-windows
$paperclip-cn-fork-maintenance audit-electron
$paperclip-cn-fork-maintenance audit-adapters
$paperclip-cn-fork-maintenance audit-rebrand
```

If needed, add a focused tail:

```text
$paperclip-cn-fork-maintenance sync-fork from origin/master into private/master
$paperclip-cn-fork-maintenance review-drift for origin/master..private/master
$paperclip-cn-fork-maintenance audit-i18n for issues and onboarding
```

## Command Table

Use these subcommands as stable entrypoints. Treat them as the default behavior unless the user adds a focused tail that narrows scope.

| Command | Purpose | Default Input | Expected Output |
|---|---|---|---|
| `sync-fork` | Run a full upstream merge maintenance flow | current fork branch + upstream default branch | merged branch, review/fix pass, verification evidence, and PR when quality is ready |
| `sync-fork-review` | Review an already-merged sync branch before fixing | current branch after merge | findings ordered by severity with long-term concern classification |
| `sync-fork-fix` | Fix the review findings on the current sync branch | current branch + latest findings | minimal patches plus fresh verification |
| `sync-fork-pr` | Prepare and open the sync PR after checks are green | current branch | staged summary, final checks, pushed branch, PR |
| `review-drift` | Classify `origin/master..private/master` or another explicit range | fork-vs-upstream diff range | keep/trim/revert recommendations |
| `audit-i18n` | Audit zh-CN completeness and command wording | touched UI/docs scope | missing translations, wrong command normalization, key gaps |
| `audit-i18n-keys` | Snapshot or compare locale key definitions and static usages | locale catalogs + source tree | key usage counts, unused candidates, parity gaps, duplicate keys, and likely zh-CN regressions |
| `audit-windows` | Audit Windows command/path/junction behavior | touched scripts/runtime/tests | compatibility gaps and risky command surfaces |
| `audit-electron` | Audit desktop packaging and desktop isolation | touched desktop/runtime scope | packaging risks, desktop leakage, missing verification |
| `audit-adapters` | Audit external adapter boundaries | touched adapter manager/runtime scope | hardcoded adapter drift, missing external install checks, built-in dependency regressions |
| `audit-rebrand` | Audit rebrand boundaries | touched user-visible and technical identifier scope | wrong layer replacements, stale command names, overreach |

## `sync-fork` Lifecycle

Interpret `sync-fork` as a multi-stage pipeline:

1. prepare and inspect
2. capture an i18n key baseline before pulling upstream changes
3. merge upstream
4. run at least one review pass
5. fix findings
6. capture and compare the post-merge i18n key snapshot
7. rerun review if needed
8. verify quality gates
9. create PR automatically when the branch is review-ready

If the branch is not PR-ready, stop with explicit blockers instead of silently handing off partial work.

## `sync-fork` Quality Gate

Do not consider `sync-fork` complete until all are true:

- the branch has absorbed upstream structure
- the five long-term fork concerns still hold
- at least one review -> fix pass has been completed
- required verification is green
- a PR has been opened unless the user explicitly asked to stop before PR creation

## Field Lessons

Keep these as reusable maintenance rules, not as one-off incident notes:

- PR status must be evaluated on the latest head SHA. Ignore stale failures from older commits.
- A PR is merge-ready only after every required check is terminal green and draft status has been cleared.
- Stable `latest` releases should run the stable workflow in dry-run mode before the live publish.
- After a live stable release, verify the external surfaces directly: npm `latest`, git tag, GitHub Release, release workflow jobs, smoke job, and desktop assets when installers are expected.
- In PowerShell sessions, pass environment variables into bash release helpers inline, for example `bash -c 'RELEASE_REMOTE=private ./scripts/release.sh stable --date YYYY-MM-DD --print-version'`.
- If local canary or stable tags conflict with the remote during release work, refresh tags explicitly from the fork remote before trusting local tag state.

## Default Verification Commands

Unless the user explicitly narrows verification, use these as the default gate set for `sync-fork` and `sync-fork-fix`:

```bash
pnpm test:upstream-merge-harness
pnpm -r typecheck
pnpm test:run
pnpm build
```

If the touched diff is narrower, still consider these targeted checks first when they better protect the invariant:

- `pnpm test:windows-compat` for Windows / Electron / worktree compatibility work
- `pnpm --filter @penclipai/desktop-electron run pack` for packaged Electron verification
- targeted `vitest run ...` for touched helper, route, or component regressions
- focused locale-catalog and i18n key snapshot checks when changing `common.json`

Do not drop the full gate set casually. Only skip a gate when:

- the task is docs-only, or
- the user explicitly narrows verification, or
- a gate is clearly unrelated and you explain why

## Default Branch / PR Rules

For `sync-fork` and `sync-fork-pr`, use stable naming unless the user requests otherwise:

- working branch: `codex/upstream-sync-YYYYMMDD`
- safety branch: `codex/upstream-sync-YYYYMMDD-safety`
- PR target: fork `master`
- PR title: `[codex] Sync upstream master and preserve CN fork boundaries`

If the branch already exists, continue on it rather than creating a second sync branch.

## Default PR Body Expectations

When `sync-fork-pr` opens the PR, include:

- what upstream range was merged
- which of the five long-term concerns were touched
- what drift was intentionally preserved
- what drift outside the five long-term concerns was trimmed
- verification commands actually run
- any remaining manual review risks

Do not write the PR like a changelog dump. Keep it grouped by behavior and maintenance concern.

## PR / Release Handoff

Keep this skill focused on preserving fork boundaries during maintenance work.

- Once a sync PR exists, use or reference `$prcheckloop` for CI polling and repair instead of duplicating that loop here.
- Before merging a PR, confirm the latest PR head SHA, all status contexts/check runs, mergeability, and draft status. Do not merge based on an older green SHA.
- After a sync PR merges to the fork `master`, confirm the automatic canary before treating the commit as a stable candidate.
- For merge-to-latest release work, use or reference `$release` plus `doc/RELEASING.md` and `doc/PUBLISHING.md`.
- If a package is newly public or changes to `publishFromCi: true`, complete the one-time npm bootstrap and trusted publisher setup described in `doc/PUBLISHING.md` before merge.
- Prefer the GitHub release workflow and trusted publishing for normal latest releases. Treat local `NPM_TOKEN` / OTP publishing as bootstrap or emergency-only.
- After a stable release, verify surfaces rather than only the workflow summary: npm `latest` / dist-tags, GitHub Release and tag, release workflow jobs, and desktop assets when stable installers are expected. Keep exact commands in `doc/RELEASING.md`.

## Output Templates

Use these default output shapes unless the user explicitly asks for a different format.

### `sync-fork` Output Template

```text
SYNC-FORK REPORT
================

Upstream Range:
- upstream remote/ref:
- fork base:
- merge base:

Touched Concerns:
- zh-CN localization:
- Windows compatibility:
- Electron packaging:
- external adapters:
- rebrand boundary:

Review/Fix Summary:
- review rounds completed:
- top findings fixed:
- intentionally preserved deltas:
- merge-touched UI files re-localized:

I18n Key Audit:
- pre-sync snapshot:
- post-sync snapshot:
- compare result:

Verification:
- pnpm test:upstream-merge-harness:
- pnpm -r typecheck:
- pnpm test:run:
- pnpm build:
- extra targeted checks:

PR:
- branch:
- safety branch:
- PR url:

Remaining Risks:
- none / explicit blockers
```

### `sync-fork-review` Output Template

```text
SYNC-FORK REVIEW
================

Branch:
- current branch:
- compare target:

Findings:
- [severity] file/path: issue

Concern Classification:
- localization:
- Windows:
- Electron:
- external adapters:
- rebrand:
- outside-scope drift:

Recommended Fix Order:
1.
2.
3.
```

### `review-drift` Output Template

```text
DRIFT REVIEW
============

Range:
- reviewed diff:

Keep:
- intended fork differences

Trim:
- weakly justified drift

Do Not Touch:
- upstream baseline items

Open Questions:
- explicit unknowns, if any
```

## `sync-fork-review` vs `review-drift`

- `sync-fork-review` is for one branch that has already gone through an upstream merge and needs PR-readiness review.
- `review-drift` is for broader fork-vs-upstream classification work, including historical drift not tied to one sync branch.

## Subcommands

### `sync-fork`

Run the full upstream-sync workflow:

- confirm remote roles
- inspect incoming upstream range before merge
- capture `.omx/i18n-key-audit/pre-sync.json` before pulling upstream changes
- merge upstream structure
- re-apply only the intended fork deltas
- recheck every merge-touched UI/component/locale file for lost existing Chinese translations
- capture `.omx/i18n-key-audit/post-sync.json` after fixes and compare it with the baseline
- run at least one review -> fix cycle
- rerun verification until the branch is PR-ready
- create the PR automatically when quality is good enough

Use this for the normal long-running upstream merge task.

### `sync-fork-review`

Run a PR-readiness review on the current sync branch after merge work is done.

- assume the branch already contains the upstream merge result
- review only what blocks PR quality
- prioritize regressions, incomplete fork deltas, and weak tests
- produce findings that are directly actionable in one fix pass

### `sync-fork-fix`

Fix the findings produced by `sync-fork-review`.

- prefer the smallest patch that preserves upstream structure
- keep the work limited to review findings and directly related regressions
- rerun the relevant checks immediately after the fixes

### `review-drift`

Review `origin/master..private/master` and classify changes into:

1. intended fork difference
2. required compatibility support
3. upstream baseline already
4. unnecessary or weakly justified drift

Use this when deciding what to keep, trim, or revert before or after sync.

### `sync-fork-pr`

Open the PR for the current sync branch after review/fix and verification are complete.

- summarize what was preserved and what was trimmed
- include verification evidence
- call out any intentional residual differences
- default to a draft PR unless the user asked for ready-for-review directly

## Command Defaults

Use these defaults when the user gives only the short command:

- `sync-fork`
  - assume upstream is `origin/master`
  - assume fork target is `private/master` when that remote exists; otherwise use the current tracked fork remote
  - create/update the sync branch
  - merge, review, fix, verify, and open a draft PR

- `sync-fork-review`
  - review the current branch against fork `master`
  - findings first, ordered by severity

- `sync-fork-fix`
  - fix the latest known findings on the current branch
  - rerun the most relevant targeted checks plus the default gate set

- `sync-fork-pr`
  - assume the current branch is already verified
  - push if needed and open/update the PR

- `review-drift`
  - inspect `origin/master..private/master`
  - classify drift instead of changing code

- `audit-i18n`
  - inspect touched UI/components/locales for untranslated text and wrong command wording, including nested tabs, dialogs, toasts, aria labels, placeholders, empty/error states, system notices, and run/event panels

- `audit-i18n-keys`
  - snapshot or compare locale key definitions and static source usages with the skill-local script

- `audit-windows`
  - inspect touched scripts/runtime/tests for Windows-only hazards

- `audit-electron`
  - inspect desktop package isolation, root `desktop:*` script aliases, packaged UI sizing, and smoke/build coverage

- `audit-adapters`
  - inspect external adapter install/loader surfaces, OpenClaw Gateway compatibility, and prevent built-in adapter regressions

- `audit-rebrand`
  - inspect brand copy vs technical identifier boundary discipline

### `audit-i18n`

Audit zh-CN localization completeness and command wording boundaries:

- untranslated UI strings
- missing nested tab labels, dialog titles/actions, toast content, aria labels, placeholders, empty/error states, system notices, comment composer hints, and run/event panel labels
- stale cached labels after language switch
- missing `en` / `zh-CN` key parity
- incorrect command normalization in user-visible copy
- merge-touched UI files where upstream structure changes may have overwritten already-translated Chinese copy
- browser-reported untranslated text, which should be traced back to the owning component and locale catalog key instead of fixed with hardcoded Chinese

Use the skill-local i18n key audit script when the task involves upstream sync, locale catalog changes, or suspected translation regressions:

```sh
node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs snapshot --out .omx/i18n-key-audit/current.json
```

The script reports locale definitions, static source usages, unused key candidates, duplicate keys, missing `en` / `zh-CN` parity, and dynamic translation-call warnings. Treat dynamic warnings as review leads, not automatic failures.

### `audit-i18n-keys`

Run or interpret the skill-local key snapshot tool:

```sh
node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs snapshot --out .omx/i18n-key-audit/pre-sync.json
node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs snapshot --out .omx/i18n-key-audit/post-sync.json
node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs compare --before .omx/i18n-key-audit/pre-sync.json --after .omx/i18n-key-audit/post-sync.json
```

Use `--include-tests` only when test-local translation keys are the target. Snapshot files under `.omx/i18n-key-audit/` are local evidence and should not be committed.

Interpret the script as a high-signal static audit, not a 100% oracle:

- Treat static `t("key")`, `translateInstant("key")`, and exact string literal references as strong evidence of usage.
- Treat `unusedKeys` as cleanup candidates only. Static zero references do not prove runtime zero usage.
- Treat dynamic translation-call warnings as review leads. They commonly hide enum-driven keys, server-provided keys, or UI maps.
- Treat `compare` failures for removed keys, new parity gaps, duplicate keys, and likely zh-CN English fallback as blockers until reviewed.

Only remove unused keys when all are true:

- the key has zero static usages in the snapshot, ideally with `--include-tests` checked when tests may reference it
- an exact quoted-string repo search outside locale catalogs finds no references
- the key is not under a dynamic prefix such as status, policy, trigger kind, runtime kind, search scope, path instructions, or adapter/config metadata
- the key is not a server/activity/event phrase, seeded/demo content, plugin metadata fallback, or compatibility placeholder
- both `en` and `zh-CN` catalogs are edited together, and locale catalog tests still pass

### `audit-windows`

Audit Windows compatibility:

- command invocation style
- path handling
- symlink vs junction behavior
- package scripts using Unix-only shell fragments
- tests that compare unstable Windows path spellings

### `audit-electron`

Audit desktop packaging and desktop-specific isolation:

- Electron build / smoke coverage
- packaged app behavior for external adapter install, package resolution, and user data paths
- config/runtime leakage into shared web paths
- packaging commands and release assets that are wider than the real supported desktop target
- packaged UI sizing issues such as a document scrollbar plus a main content scrollbar. Shared layout should consume `--paperclip-available-height` instead of hardcoding the full viewport height when Electron chrome reserves titlebar space
- root `desktop:*` and desktop smoke script aliases drifting away from `packages/desktop-electron` scripts

When desktop scripts change, keep the repo-root aliases and `doc/DEVELOPING.md` in sync. At minimum, maintain entries for dev, build, build:release, typecheck, prepare-stage, pack, dist, platform-specific dist commands, `smoke:desktop`, `smoke:desktop:acceptance`, and `smoke:desktop:acceptance:full`.

### `audit-adapters`

Audit external adapter boundary discipline:

- adapter packages that should stay installed through Adapter Manager, not built into core
- hardcoded imports, registrations, or UI-specific parser imports for external-only adapters
- package manifests that reintroduce external adapter dependencies into core workspaces
- external adapter install, resolution, and loader behavior across web dev and packaged Electron
- adapter display/config schemas where host UI should stay generic and localized around raw package identifiers
- OpenClaw Gateway protocol compatibility when touching `@penclipai/adapter-openclaw-gateway`: v3 gateways must not regress, v4-only gateways must negotiate cleanly, and `PROTOCOL_MISMATCH` details must stay visible and actionable
- OpenClaw device auth behavior: continue using the gateway challenge nonce and keep nonce/signature handling version-aware if protocol requirements diverge
- OpenClaw request payload shape: do not send fields a newer gateway rejects, and do not translate protocol fields, adapter IDs, stdout/stderr, or gateway logs

Keep Hermes, Droid, and similar third-party agent adapters external unless the user explicitly changes the fork strategy. Once loaded, adapter type identifiers may remain stable raw technical IDs; do not translate or rebrand them.

Prefer using existing adapter manager, plugin loader, and package-resolution helpers. Do not solve one adapter package quirk by hardcoding a new global adapter contract.

### `audit-rebrand`

Audit rebrand boundaries:

- user-visible brand copy
- technical identifiers that must stay stable
- command wording normalized by audience
- places where brand changes drift into internal contracts

## Read First

Before changing code for this skill's tasks, read:

1. `AGENTS.md`
2. `doc/UI-LOCALIZATION.md`
3. `doc/UPSTREAM-MERGE-RUNBOOK.md`

If the task touches schema, shared contracts, or release automation, also read the relevant local docs (`doc/DATABASE.md`, `doc/PUBLISHING.md`, `doc/RELEASING.md`, workflow files, and package manifests).

## Fork Contract

Treat these as the intended long-lived fork differences unless the user explicitly changes direction:

1. zh-CN-first UI localization with bilingual switching
2. Windows development / runtime compatibility
3. Electron desktop packaging
4. External-only adapter boundary for Hermes, Droid, and similar third-party adapters:
   - install through Adapter Manager or explicit external package paths
   - keep core server/UI workspaces free of adapter-specific imports and dependencies
   - keep host UI generic around raw adapter package and type identifiers
5. Rebrand boundaries:
   - user-visible brand: `Paperclip CN`, `penclip`, `penclip.ing`, `paperclipai.cn`
   - technical identifiers retained by policy: `paperclip-cn`, `@penclipai/*`, `penclip`, `PAPERCLIP_*`

Anything outside these concerns must be justified as:

- required to preserve one of the five long-term concerns
- required to keep the branch mergeable / testable after upstream sync

Otherwise treat it as candidate drift.

## Decision Rules

### 1. Always compare against upstream before calling something "fork drift"

Do not assume a feature is fork-only because it feels unrelated.

First check:

- `origin/master..private/master`
- the specific commit history that introduced the behavior
- whether the same files or capability already exist in `origin/master`

If upstream already has the capability, do not plan a blind rollback. Limit yourself to the fork-specific delta around it.

### 2. Preserve upstream structure, re-apply fork deltas as minimal patches

When syncing or cleaning up:

- prefer upstream page/component/service structure
- re-attach fork differences as the smallest possible patch
- do not keep old whole files just to preserve Chinese copy or Windows behavior

### 3. Keep command wording normalized, not mechanically rewritten

Follow `doc/UI-LOCALIZATION.md` exactly:

- normalize `paperclipai` to `penclip`
- normalize `npx paperclipai` to `npx penclip`

But do **not** blindly rewrite everything to `npx penclip`.

Choose by audience:

- public install / onboarding / operator snippets: prefer `penclip` or `npx penclip`
- repo maintenance / dev / worktree / local docs: usually keep `pnpm penclip`
- historical docs, quotes, logs, upstream links: preserve literal text when needed

### 4. Localize only user-visible text

Translate or rebrand:

- visible UI text
- README/help/operator guidance
- user-visible server errors

Do **not** translate:

- package names
- env var names
- API field names
- file paths
- logs / stdout / stderr
- provider and model identifiers

### 5. Be skeptical of broad runtime contracts

Do not turn one adapter workaround into a universal agent contract unless it is enforced end-to-end.

If a rule lives only in prompts / onboarding / skills, but not in helper APIs or shared tooling, treat it as suspect drift and justify it carefully.

### 6. Keep external adapters external unless strategy changes

Do not reintroduce external-only adapters as core dependencies, built-in registrations, or UI-specific imports during upstream syncs.

Use Adapter Manager, plugin loader, and package-resolution paths as the maintained boundary. When fixing adapter install issues, prefer improving those generic surfaces over hardcoding Hermes, Droid, or another package in server/UI source.

## Workflow

### A. Upstream Sync / Merge Work

This section is the implementation shape for `sync-fork`.

1. Confirm remote roles instead of assuming:
   - `origin` may be upstream
   - `private` may be the fork
2. Read the runbook and map:
   - upstream remote
   - fork remote
   - base branch
   - upstream ref
3. Inspect range before editing:
   - `git log --oneline --decorate --stat HEAD..UPSTREAM_REMOTE/master`
   - `git diff --name-only HEAD..UPSTREAM_REMOTE/master`
4. Capture the i18n key baseline before merging upstream:
   - `node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs snapshot --out .omx/i18n-key-audit/pre-sync.json`
5. Check whether touched files hit:
   - i18n infrastructure
   - package/workspace manifests
   - shared types / schema / routes
   - runtime prompt / adapter environment surfaces
   - adapter manager / plugin loader surfaces
6. After conflict resolution and localization fixes, capture and compare the post-sync key snapshot:
   - `node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs snapshot --out .omx/i18n-key-audit/post-sync.json`
   - `node .agents/skills/paperclip-cn-fork-maintenance/scripts/i18n-key-audit.mjs compare --before .omx/i18n-key-audit/pre-sync.json --after .omx/i18n-key-audit/post-sync.json`
7. After conflict resolution, run:
   - `pnpm test:upstream-merge-harness`
   - `pnpm -r typecheck`
   - `pnpm test:run`
   - `pnpm build`

### B. Drift Review Work

This section is the implementation shape for `review-drift`.

Classify every diff bucket into one of:

1. intended fork difference
2. required compatibility support
3. upstream baseline already
4. unnecessary or weakly justified drift

For category 4, flag:

- why it is outside the five long-term concerns
- whether the design is incomplete / over-broad / review-noisy
- whether it should be reverted, trimmed, or merely documented

### C. Localization Audit

This section is the implementation shape for `audit-i18n`.

For touched UI files:

1. search for hardcoded visible strings
2. decide whether the string should use:
   - existing locale key
   - new locale key in both `zh-CN` and `en`
   - controlled fallback
3. check:
   - loading / empty / error / live states stay layout-consistent
   - labels/tooltips/aria/toasts are not missed
   - language switching does not leave stale cached labels
   - only user-visible text is translated; logs, paths, env vars, API fields, provider/model names stay raw

### D. Windows Audit

This section is the implementation shape for `audit-windows`.

Check for:

- Unix-only shell fragments
- raw `rm -rf`, `cp`, `mv`, `chmod` in package scripts
- direct symlink behavior that should use repo junction-aware helpers or policies on Windows
- path equality assertions that should normalize realpaths

Prefer existing repo helpers over inventing new Windows wrappers.

### E. Electron Audit

This section is the implementation shape for `audit-electron`.

Check for:

- desktop-specific logic leaking too far into shared web UI
- packaging scripts that are wider than the real supported desktop target
- packaged app coverage for external adapter install, package resolution, and user data directories
- smoke / build verification gaps for packaged or dev desktop flows, including `pnpm --filter @penclipai/desktop-electron run pack`
- release asset size or contents that look inconsistent with the supported desktop bundle contract
- config/runtime behavior added only for desktop without clear isolation

Prefer keeping Electron-specific behavior inside the desktop package or clearly bounded helpers.

### F. External Adapter Audit

This section is the implementation shape for `audit-adapters`.

Check for:

- adapter packages added back to core package manifests
- hardcoded external adapter imports, built-in registrations, or adapter-specific UI parser imports
- generic Adapter Manager flows that work in web dev and packaged Electron
- host UI localization around adapter manager controls while package names and adapter IDs stay raw

Prefer fixing generic plugin-loader, package-resolution, and Adapter Manager behavior over adding package-specific branches.

## Common Mistakes To Avoid

- calling an upstream feature "fork drift" without checking `origin/master`
- replacing every command with `npx penclip`
- translating technical identifiers
- translating protocol fields, adapter IDs, logs, stdout/stderr, model/provider names, or gateway event payloads
- keeping whole old files instead of reapplying a minimal fork delta
- reintroducing external-only adapters as built-in dependencies or hardcoded registrations
- adding heavy tests when a helper- or route-level test would protect the invariant
- leaving locale changes in only one catalog
- treating Electron packaging as a web-only concern and skipping desktop verification
- hiding packaged Electron overflow instead of sizing the app to the Electron-adjusted available height
- publishing stable `latest` from a workflow summary alone without verifying npm, tag, GitHub Release, smoke, and desktop asset surfaces

## Output Expectations

When using this skill, produce:

- a clear classification of touched changes
- specific drift candidates outside the five long-term concerns
- concrete verification evidence
- explicit notes on what is intentionally preserved versus reverted

Prefer the output templates above for command-style invocations so repeated maintenance runs stay comparable over time.

If you recommend reverting a feature chain, say whether it is:

- truly fork-only
- upstream baseline
- mixed (upstream baseline plus fork-only wrapper drift)
