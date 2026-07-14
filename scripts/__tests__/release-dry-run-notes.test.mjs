import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const bashCommand = process.platform === "win32" ? `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\bash.exe` : "bash";

function toBashPath(path) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.replace(/^([A-Za-z]):\//, (_match, drive) => `/mnt/${drive.toLowerCase()}/`);
}

function bashQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function writeExecutable(path, body) {
  writeFileSync(path, body, { mode: 0o755 });
}

function createReleaseFixture() {
  const fixtureDir = mkdtempSync(join(tmpdir(), "paperclip-release-dry-run-"));
  const scriptsDir = join(fixtureDir, "scripts");
  const binDir = join(fixtureDir, "bin");
  const bashEnv = join(fixtureDir, "bash-env.sh");
  const callLog = join(fixtureDir, "calls.log");

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(join(fixtureDir, "releases"));
  mkdirSync(binDir);
  writeFileSync(callLog, "");

  copyFileSync(join(repoRoot, "scripts", "release.sh"), join(scriptsDir, "release.sh"));
  chmodSync(join(scriptsDir, "release.sh"), 0o755);

  writeFileSync(
    join(scriptsDir, "release-lib.sh"),
    `#!/usr/bin/env bash
release_info() { echo "$@"; }
release_fail() { echo "Error: $*" >&2; exit 1; }
resolve_release_remote() { printf 'origin\\n'; }
fetch_release_remote() { :; }
git_current_branch() { printf 'master\\n'; }
get_last_stable_tag() { printf 'v2026.709.0\\n'; }
get_current_stable_version() { printf '2026.709.0\\n'; }
utc_date_iso() { printf '2026-07-10\\n'; }
list_public_package_info() { printf 'cli\\tpenclip\\t0.0.0\\n'; }
next_stable_version() { printf '2026.710.0\\n'; }
next_canary_version() { printf '2026.710.0-canary.0\\n'; }
release_notes_file() { printf '%s/releases/v%s.md\\n' "$REPO_ROOT" "$1"; }
stable_tag_name() { printf 'v%s\\n' "$1"; }
canary_tag_name() { printf 'canary/v%s\\n' "$1"; }
require_clean_worktree() { :; }
require_npm_publish_auth() { :; }
git_local_tag_exists() { return 1; }
git_remote_tag_exists() { return 1; }
npm_package_version_exists() { return 1; }
set_public_package_version() { :; }
`,
  );

  writeExecutable(
    join(scriptsDir, "release-registry-versions.mjs"),
    `#!/usr/bin/env node
const [mode] = process.argv.slice(2);
if (mode === "fetch") {
  process.stdout.write('{"penclip":[]}\\n');
  process.exit(0);
}
if (mode === "assert-absent") {
  process.exit(0);
}
process.exit(2);
`,
  );

  writeExecutable(
    join(binDir, "node"),
    `#!/usr/bin/env bash
exec "${toBashPath(process.execPath)}" "$@"
`,
  );

  writeExecutable(
    join(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "-C" ]; then
  shift 2
fi
printf 'git %s\\n' "$*" >> "$FAKE_CALL_LOG"
case "$1" in
  rev-parse)
    if [ "\${2:-}" = "HEAD" ]; then
      echo abcdef1234567890
      exit 0
    fi
    ;;
  diff|ls-files)
    exit 0
    ;;
  checkout)
    exit 0
    ;;
esac
exit 0
`,
  );

  writeExecutable(
    join(binDir, "pnpm"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'pnpm %s\\n' "$*" >> "$FAKE_CALL_LOG"
if [ "$*" = "build" ]; then
  echo "fixture stopped at workspace build"
  exit 42
fi
exit 0
`,
  );

  writeFileSync(
    bashEnv,
    `git() {
  printf 'git %s\\n' "$*" >> ${bashQuote(toBashPath(callLog))}
  if [ "$1" = "-C" ]; then
    shift 2
  fi
  case "$1" in
    rev-parse)
      if [ "\${2:-}" = "HEAD" ]; then
        echo abcdef1234567890
        return 0
      fi
      ;;
    diff|ls-files|checkout)
      return 0
      ;;
  esac
  return 0
}

pnpm() {
  printf 'pnpm %s\\n' "$*" >> ${bashQuote(toBashPath(callLog))}
  if [ "$*" = "build" ]; then
    echo "fixture stopped at workspace build"
    return 42
  fi
  return 0
}

node() {
  local translated=()
  local arg drive rest
  for arg in "$@"; do
    case "$arg" in
      /mnt/[a-zA-Z]/*)
        drive="\${arg:5:1}"
        rest="\${arg:7}"
        translated+=("\${drive^^}:/\${rest}")
        ;;
      *)
        translated+=("$arg")
        ;;
    esac
  done
  "${toBashPath(process.execPath)}" "\${translated[@]}"
}

export -f git pnpm node
`,
  );

  return { bashEnv, binDir, callLog, fixtureDir, script: join(scriptsDir, "release.sh") };
}

function runRelease(args) {
  const fixture = createReleaseFixture();
  const quotedArgs = args.map(bashQuote).join(" ");
  const command = [
    "set -euo pipefail",
    `. ${bashQuote(toBashPath(fixture.bashEnv))}`,
    `set --${quotedArgs ? ` ${quotedArgs}` : ""}`,
    `. ${bashQuote(toBashPath(fixture.script))}`,
  ].join("; ");
  const result = spawnSync(bashCommand, ["-c", command], {
    cwd: fixture.fixtureDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    },
  });

  const calls = readFileSync(fixture.callLog, "utf8");
  try {
    rmSync(fixture.fixtureDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }

  return {
    calls,
    output: (result.stdout ?? "") + (result.stderr ?? "") + (result.error ? String(result.error.message) : ""),
    status: result.status,
  };
}

test("stable dry-run preview does not require a pre-authored release notes file", () => {
  const result = runRelease(["stable", "--skip-verify", "--dry-run"]);

  assert.equal(result.status, 42, result.output);
  assert.match(result.output, /==> Release plan/);
  assert.match(result.output, /==> Step 2\/7: Building workspace artifacts/);
  assert.doesNotMatch(result.output, /stable release notes file is required/);
  assert.match(result.calls, /^pnpm build$/m);
});

test("stable publish still requires release notes before publish work starts", () => {
  const result = runRelease(["stable", "--skip-verify"]);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /stable release notes file is required/);
  assert.doesNotMatch(result.output, /==> Step 2\/7: Building workspace artifacts/);
  assert.doesNotMatch(result.calls, /^pnpm /m);
});
