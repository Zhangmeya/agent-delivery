#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, delimiter } from "node:path";

import { buildReleasePackagePlan } from "./release-package-map.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node scripts/bootstrap-npm-package.mjs <package-name-or-dir> [--publish --otp <code>] [--skip-build]",
      "",
      "Examples:",
      "  node scripts/bootstrap-npm-package.mjs @penclipai/adapter-acpx-local",
      "  node scripts/bootstrap-npm-package.mjs packages/adapters/acpx-local --publish",
      "",
    ].join("\n"),
  );
}

function resolveNpmInvocation() {
  if (process.platform !== "win32") {
    return {
      command: "npm",
      argsPrefix: [],
    };
  }

  for (const entry of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const npmCliPath = join(entry, "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(npmCliPath)) {
      return {
        command: process.execPath,
        argsPrefix: [npmCliPath],
      };
    }
  }

  return {
    command: "npm",
    argsPrefix: [],
  };
}

function resolvePnpmInvocation() {
  const npmExecPath = process.env.npm_execpath ?? "";
  if (npmExecPath && /pnpm/i.test(npmExecPath) && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      argsPrefix: [npmExecPath],
    };
  }

  if (process.platform !== "win32") {
    return {
      command: "pnpm",
      argsPrefix: [],
    };
  }

  for (const entry of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidateDirs = [
      join(entry, "node_modules", "pnpm"),
    ];
    const toolsPnpmDir = join(entry, ".tools", "pnpm");
    if (existsSync(toolsPnpmDir)) {
      for (const versionDir of readdirSync(toolsPnpmDir, { withFileTypes: true })) {
        if (versionDir.isDirectory()) {
          candidateDirs.push(join(toolsPnpmDir, versionDir.name, "node_modules", "pnpm"));
        }
      }
    }
    for (const candidateDir of candidateDirs) {
      const pnpmCliPath = join(candidateDir, "bin", "pnpm.cjs");
      if (existsSync(pnpmCliPath)) {
        return {
          command: process.execPath,
          argsPrefix: [pnpmCliPath],
        };
      }
    }
  }

  return {
    command: "pnpm",
    argsPrefix: [],
  };
}

function runNpm(args, options = {}) {
  const npmInvocation = resolveNpmInvocation();
  return runCommand(npmInvocation.command, [...npmInvocation.argsPrefix, ...args], options);
}

function npmPublishOptions(options = {}) {
  const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
  if (!token || process.env.NPM_CONFIG_USERCONFIG) {
    return { options, cleanup: () => {} };
  }

  const configDir = mkdtempSync(join(tmpdir(), "paperclip-npmrc-"));
  const userConfig = join(configDir, ".npmrc");
  writeFileSync(
    userConfig,
    [
      "registry=https://registry.npmjs.org/",
      `//registry.npmjs.org/:_authToken=${token}`,
    ].join("\n"),
  );

  return {
    options: {
      ...options,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        NPM_CONFIG_USERCONFIG: userConfig,
      },
    },
    cleanup: () => rmSync(configDir, { recursive: true, force: true }),
  };
}

function parseArgs(argv) {
  const flags = new Set();
  let selector = null;
  let otp = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }

    if (arg === "--publish" || arg === "--skip-build") {
      flags.add(arg);
      continue;
    }

    if (arg === "--otp") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("expected a one-time password after --otp");
      }
      otp = value;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true, selector: null, publish: false, skipBuild: false, otp: null };
    }

    if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    }

    if (selector) {
      throw new Error("expected exactly one package selector");
    }

    selector = arg;
  }

  return {
    help: false,
    selector,
    publish: flags.has("--publish"),
    skipBuild: flags.has("--skip-build"),
    otp,
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function runChecked(command, args, options = {}) {
  const result = runCommand(command, args, options);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`);
  }
}

function formatCommand(command, args) {
  return `${command} ${args.join(" ")}`;
}

function ensureNpmAuth() {
  const auth = npmPublishOptions();
  let result;
  try {
    result = runNpm(["whoami"], auth.options);
  } finally {
    auth.cleanup();
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status === 0) {
    return;
  }

  const output = `${stdout}\n${stderr}`.trim();
  if (/\bE401\b|401 Unauthorized/i.test(output)) {
    throw new Error(
      [
        "npm auth check failed.",
        "This usually means the machine is either not logged into npm yet or has a stale token in ~/.npmrc.",
        "Run `npm logout --registry=https://registry.npmjs.org/` and then `npm login` or `npm adduser` on this maintainer machine with an npm account that can publish to the @penclipai scope, then rerun with --publish.",
        "Do not use this auth flow in CI; it is only for the one-time human bootstrap publish.",
      ].join(" "),
    );
  }

  throw new Error("npm whoami failed");
}

function inspectNpmPackage(packageName) {
  const result = runNpm(["view", packageName, "version", "--json"]);

  if (result.status === 0) {
    const version = JSON.parse((result.stdout ?? "").trim());
    return { exists: true, version };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (/\bE404\b|404 Not Found|could not be found/i.test(output)) {
    return { exists: false };
  }

  process.stderr.write(output ? `${output}\n` : "");
  throw new Error(`failed to query npm for ${packageName}`);
}

function isWorkspaceDependency(name, value) {
  return name.startsWith("@penclipai/") && typeof value === "string" && value.startsWith("workspace:");
}

const compatibilityAliasTargets = new Map([
  ["@paperclipai/plugin-sdk", "@penclipai/plugin-sdk"],
  ["@paperclipai/shared", "@penclipai/shared"],
]);

function isLocalCompatibilityDependency(name, value) {
  return compatibilityAliasTargets.has(name) &&
    typeof value === "string" &&
    (value.startsWith("link:") || value.startsWith("workspace:"));
}

function resolvePublishedDependencyVersion(name) {
  const npmState = inspectNpmPackage(name);
  if (!npmState.exists) {
    throw new Error(`${name} is a workspace dependency but is not published on npm yet`);
  }

  return npmState.version;
}

function resolvePublishDependencies(deps = {}, resolveDependencyVersion = resolvePublishedDependencyVersion) {
  const next = {};
  for (const [name, value] of Object.entries(deps)) {
    const aliasTarget = compatibilityAliasTargets.get(name);
    if (aliasTarget && isLocalCompatibilityDependency(name, value)) {
      next[name] = `npm:${aliasTarget}@${resolveDependencyVersion(aliasTarget)}`;
      continue;
    }

    next[name] = isWorkspaceDependency(name, value) ? resolveDependencyVersion(name) : value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeRepository(repository) {
  if (!repository || typeof repository !== "object" || Array.isArray(repository)) {
    return repository;
  }

  const next = { ...repository };
  if (typeof next.url === "string" && /^https:\/\/github\.com\/.+[^.]$/.test(next.url)) {
    next.url = `git+${next.url}.git`;
  }
  return next;
}

function buildPublishPackageJson(pkg, options = {}) {
  const resolveDependencyVersion = options.resolveDependencyVersion ?? resolvePublishedDependencyVersion;
  const publishConfig = pkg.pkg.publishConfig ?? {};
  const packageJson = {
    ...pkg.pkg,
    repository: normalizeRepository(pkg.pkg.repository),
    exports: publishConfig.exports ?? pkg.pkg.exports,
    main: publishConfig.main ?? pkg.pkg.main,
    types: publishConfig.types ?? pkg.pkg.types,
    bin: publishConfig.bin ?? pkg.pkg.bin,
    dependencies: resolvePublishDependencies(pkg.pkg.dependencies, resolveDependencyVersion),
    optionalDependencies: resolvePublishDependencies(pkg.pkg.optionalDependencies, resolveDependencyVersion),
    peerDependencies: resolvePublishDependencies(pkg.pkg.peerDependencies, resolveDependencyVersion),
    publishConfig: {
      access: publishConfig.access ?? "public",
    },
  };

  delete packageJson.devDependencies;
  delete packageJson.scripts;
  delete packageJson.clean;
  delete packageJson.typecheck;

  return Object.fromEntries(Object.entries(packageJson).filter(([, value]) => value !== undefined));
}

function preparePublishStaging(pkg) {
  const sourceDir = join(repoRoot, pkg.dir);
  const packageJson = buildPublishPackageJson(pkg);
  const stagingDir = mkdtempSync(join(tmpdir(), "paperclip-bootstrap-publish-"));
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];

  for (const file of files) {
    const sourcePath = join(sourceDir, file);
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, join(stagingDir, file), { recursive: true });
    }
  }

  writeFileSync(join(stagingDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  return stagingDir;
}

function buildPackageForBootstrap(pkg, options = {}) {
  if (typeof pkg.pkg?.scripts?.build !== "string") {
    return false;
  }

  process.stdout.write(`Building ${pkg.name}...\n`);
  const resolvePnpm = options.resolvePnpmInvocation ?? resolvePnpmInvocation;
  const runBuild = options.runChecked ?? runChecked;
  const pnpmInvocation = resolvePnpm();
  runBuild(pnpmInvocation.command, [...pnpmInvocation.argsPrefix, "-C", pkg.dir, "run", "build"]);
  return true;
}

function resolveTargetPackage(selector, packages = buildReleasePackagePlan()) {
  const normalizedSelector = normalizePath(selector);
  const matches = packages.filter(
    (pkg) => pkg.name === selector || normalizePath(pkg.dir) === normalizedSelector,
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(`package selector is ambiguous: ${selector}`);
  }

  throw new Error(
    `unknown package selector: ${selector}\nKnown packages:\n- ${packages.map((pkg) => `${pkg.name} (${pkg.dir})`).join("\n- ")}`,
  );
}

function printNextSteps(pkg) {
  process.stdout.write(
    [
      "",
      "Publish succeeded. Next:",
      `1. Open https://www.npmjs.com/package/${pkg.name}`,
      "2. Go to Settings -> Trusted publishing",
      "3. Add repository penclipai/paperclip-cn",
      "4. Set workflow filename to release.yml",
      "5. Optionally enable Settings -> Publishing access -> Require two-factor authentication and disallow tokens",
      "",
    ].join("\n"),
  );
}

function publishPackage(pkg, stagingDir, otp) {
  const publishArgs = ["publish", "--access", "public"];
  if (otp) {
    publishArgs.push("--otp", otp);
  }

  const publish = npmPublishOptions({ cwd: stagingDir });
  let result;
  try {
    result = runNpm(publishArgs, publish.options);
  } finally {
    publish.cleanup();
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const output = `${stdout}\n${stderr}`.trim();

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status === 0) {
    return;
  }

  if (/\bEOTP\b|one-time password/i.test(output)) {
    throw new Error(
      [
        "npm publish reached the publish-time 2FA check.",
        "Complete the browser auth URL printed by npm and rerun the helper, or rerun with `--otp <code>` if your npm account uses authenticator-app codes.",
      ].join(" "),
    );
  }

  throw new Error(`${formatCommand("pnpm", publishArgs)} failed with status ${result.status ?? "unknown"}`);
}

function main(argv) {
  const { help, selector, publish, skipBuild, otp } = parseArgs(argv);

  if (help) {
    usage();
    return;
  }

  if (!selector) {
    usage();
    throw new Error("missing package selector");
  }

  const pkg = resolveTargetPackage(selector);
  process.stdout.write(`Selected ${pkg.name} (${pkg.dir})\n`);

  const npmState = inspectNpmPackage(pkg.name);
  if (npmState.exists) {
    throw new Error(`${pkg.name} already exists on npm at version ${npmState.version}; bootstrap is only for first publish`);
  }

  process.stdout.write(`${pkg.name} is not on npm yet; continuing with bootstrap flow.\n`);

  if (publish) {
    process.stdout.write("Checking npm auth with npm whoami...\n");
    ensureNpmAuth();
  }

  if (!skipBuild) {
    buildPackageForBootstrap(pkg);
  }

  const stagingDir = preparePublishStaging(pkg);

  process.stdout.write(`Previewing publish payload for ${pkg.name}...\n`);
  const npmInvocation = resolveNpmInvocation();
  try {
    runChecked(npmInvocation.command, [...npmInvocation.argsPrefix, "pack", "--dry-run"], { cwd: stagingDir });

    if (!publish) {
      process.stdout.write(
        [
          "",
          "Dry run complete. To perform the first publish from an authenticated maintainer machine, run:",
          `node scripts/bootstrap-npm-package.mjs ${pkg.name} --publish --otp <code>`,
          "",
        ].join("\n"),
      );
      return;
    }

    process.stdout.write(`Publishing ${pkg.name}...\n`);
    publishPackage(pkg, stagingDir, otp);
    printNextSteps(pkg);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export {
  buildPackageForBootstrap,
  buildPublishPackageJson,
  ensureNpmAuth,
  inspectNpmPackage,
  parseArgs,
  publishPackage,
  preparePublishStaging,
  resolveTargetPackage,
};
