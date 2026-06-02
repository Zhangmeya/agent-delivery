import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface NpmInvocation {
  command: string;
  argsPrefix: string[];
  source: "npm_execpath" | "path_npm_cli" | "path_npm_shim";
}

export interface PackageManagerInvocation {
  command: string;
  args: string[];
  source: "npm_execpath" | "path_shim";
}

interface ResolveNpmInvocationOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  exists?: (filePath: string) => boolean;
}

interface ExecNpmOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

function getPathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

function getEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const direct = env[key];
  if (direct !== undefined) return direct;

  const lowerKey = key.toLowerCase();
  const matchingKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === lowerKey);
  return matchingKey ? env[matchingKey] : undefined;
}

function getPathEntries(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const rawPath = getEnvValue(env, "PATH") ?? "";
  const delimiter = platform === "win32" ? ";" : ":";
  return rawPath
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resolvePath(rawPath: string, platform: NodeJS.Platform): string {
  const pathApi = getPathApi(platform);
  return pathApi.isAbsolute(rawPath) ? pathApi.normalize(rawPath) : pathApi.resolve(rawPath);
}

function pushIfUnique(items: string[], item: string): void {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function quoteCmdArg(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@+-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function collectNpmCliCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const pathApi = getPathApi(platform);
  const candidates: string[] = [];
  const npmExecPath = getEnvValue(env, "npm_execpath")?.trim();

  if (npmExecPath && pathApi.basename(npmExecPath).toLowerCase() === "npm-cli.js") {
    pushIfUnique(candidates, resolvePath(npmExecPath, platform));
  }

  const runtimeCwd = resolvePath(process.cwd(), platform);
  pushIfUnique(candidates, pathApi.join(runtimeCwd, "node_modules", "npm", "bin", "npm-cli.js"));
  pushIfUnique(candidates, pathApi.join(pathApi.dirname(runtimeCwd), "node_modules", "npm", "bin", "npm-cli.js"));

  for (const entry of getPathEntries(env, platform)) {
    const pathEntry = resolvePath(entry, platform);
    pushIfUnique(candidates, pathApi.join(pathEntry, "node_modules", "npm", "bin", "npm-cli.js"));
  }

  if (platform === "win32") {
    const appData = getEnvValue(env, "APPDATA")?.trim();
    if (appData) {
      pushIfUnique(
        candidates,
        pathApi.join(resolvePath(appData, platform), "npm", "node_modules", "npm", "bin", "npm-cli.js"),
      );
    }

    const programFiles = getEnvValue(env, "ProgramFiles")?.trim();
    if (programFiles) {
      pushIfUnique(
        candidates,
        pathApi.join(resolvePath(programFiles, platform), "nodejs", "node_modules", "npm", "bin", "npm-cli.js"),
      );
    }
  }

  return candidates;
}

function collectNpmShimCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const pathApi = getPathApi(platform);
  const shimNames = platform === "win32" ? ["npm.cmd", "npm.exe", "npm"] : ["npm"];
  const candidates: string[] = [];

  for (const entry of getPathEntries(env, platform)) {
    const pathEntry = resolvePath(entry, platform);
    for (const shimName of shimNames) {
      pushIfUnique(candidates, pathApi.join(pathEntry, shimName));
    }
  }

  return candidates;
}

export function resolveNpmInvocation(options: ResolveNpmInvocationOptions = {}): NpmInvocation {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const exists = options.exists ?? existsSync;

  for (const candidate of collectNpmCliCandidates(env, platform)) {
    if (exists(candidate)) {
      return {
        command: execPath,
        argsPrefix: [candidate],
        source: getEnvValue(env, "npm_execpath") === candidate ? "npm_execpath" : "path_npm_cli",
      };
    }
  }

  for (const candidate of collectNpmShimCandidates(env, platform)) {
    if (!exists(candidate)) continue;

    if (platform === "win32" && path.win32.extname(candidate).toLowerCase() === ".cmd") {
      return {
        command: getEnvValue(env, "ComSpec")?.trim() || "cmd.exe",
        argsPrefix: ["/d", "/s", "/c", candidate],
        source: "path_npm_shim",
      };
    }

    return {
      command: candidate,
      argsPrefix: [],
      source: "path_npm_shim",
    };
  }

  throw new Error(
    "npm executable not found. Install Node.js/npm or set npm_execpath so Paperclip can install external packages.",
  );
}

export async function execNpmCommand(args: string[], options: ExecNpmOptions = {}) {
  const invocation = resolveNpmInvocation({ env: options.env ?? process.env });
  return await execFileAsync(invocation.command, [...invocation.argsPrefix, ...args], {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout,
    windowsHide: true,
  });
}

export function resolvePnpmInvocation(args: string[], options: ResolveNpmInvocationOptions = {}): PackageManagerInvocation {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = getEnvValue(env, "npm_execpath")?.trim();

  if (npmExecPath && /(?:^|[\\/])pnpm(?:\.cjs)?$/i.test(npmExecPath)) {
    return {
      command: execPath,
      args: [resolvePath(npmExecPath, platform), ...args],
      source: "npm_execpath",
    };
  }

  if (platform === "win32") {
    return {
      command: getEnvValue(env, "ComSpec")?.trim() || "cmd.exe",
      args: ["/d", "/s", "/c", ["pnpm", ...args].map(quoteCmdArg).join(" ")],
      source: "path_shim",
    };
  }

  return {
    command: "pnpm",
    args,
    source: "path_shim",
  };
}

export async function execPnpmCommand(args: string[], options: ExecNpmOptions = {}) {
  const invocation = resolvePnpmInvocation(args, { env: options.env ?? process.env });
  return await execFileAsync(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout,
    windowsHide: true,
  });
}
