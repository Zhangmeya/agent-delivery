import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildRemoteGitDeltaBundleScript,
  createImportedGitRef,
  createRemoteGitExportRef,
  deleteLocalGitRef,
  fetchGitBundleIntoLocalRef,
  readGitWorkspaceSnapshot,
  runLocalGit,
  withShallowGitWorkspaceClone,
} from "./git-workspace-sync.js";

const execFile = promisify(execFileCallback);

function resolveTestPosixShellCommand(command: "sh") {
  if (process.platform !== "win32") return "/bin/sh";
  const candidates = ["C:\\Program Files\\Git\\usr\\bin\\sh.exe", "C:\\Program Files\\Git\\bin\\bash.exe"];
  return candidates.find((candidate) => existsSync(candidate)) ?? command;
}

function augmentTestPosixPath(env: Record<string, string | undefined>) {
  if (process.platform !== "win32") return;
  const entries = [
    "/usr/bin",
    "/bin",
    "C:\\Program Files\\Git\\usr\\bin",
    "C:\\Program Files\\Git\\bin",
  ].filter((entry) => entry.startsWith("/") || existsSync(entry));
  env.PATH = [...entries, env.PATH ?? ""].join(path.delimiter);
}

function rewriteWindowsPathsForGitShell(script: string) {
  if (process.platform !== "win32") return script;
  const toGitShellPath = (drive: string, rest: string) => `/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`;
  const rewritten = script
    .replace(/'([A-Za-z]):\\([^']*)'/g, (_match, drive: string, rest: string) =>
      `'${toGitShellPath(drive, rest)}'`,
    )
    .replace(/"([A-Za-z]):\\([^"]*)"/g, (_match, drive: string, rest: string) =>
      `"${toGitShellPath(drive, rest)}"`,
    )
    .replace(/([A-Za-z]):\\([^'"\s]*)/g, (_match, drive: string, rest: string) =>
      toGitShellPath(drive, rest),
    );

  return rewritten.replace(
    /mkdir -p '\.' && (?=(?:base64 -d >|rm -f|: >)\s+'([^']+)')/g,
    (_match, targetPath: string) => `mkdir -p '${path.posix.dirname(targetPath)}' && `,
  );
}

async function execPosixShell(script: string) {
  const env = { ...process.env };
  augmentTestPosixPath(env);
  await execFile(resolveTestPosixShellCommand("sh"), ["-c", rewriteWindowsPathsForGitShell(script)], {
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n");
}

async function git(cwd: string, args: string[]): Promise<string> {
  return (await runLocalGit(cwd, args)).stdout.trim();
}

describe("git workspace sync", () => {
  const cleanupDirs: string[] = [];

  afterEach(async () => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (!dir) continue;
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  async function createRepo(rootDir: string): Promise<string> {
    const repo = path.join(rootDir, "repo");
    await mkdir(repo, { recursive: true });
    await git(repo, ["init"]);
    await git(repo, ["checkout", "-b", "main"]);
    await git(repo, ["config", "user.name", "Paperclip Test"]);
    await git(repo, ["config", "user.email", "test@paperclip.dev"]);
    await writeFile(path.join(repo, "tracked.txt"), "base\n", "utf8");
    await git(repo, ["add", "tracked.txt"]);
    await git(repo, ["commit", "-m", "base"]);
    return repo;
  }

  it("creates a shallow standalone clone from the local HEAD snapshot", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-git-sync-"));
    cleanupDirs.push(rootDir);
    const repo = await createRepo(rootDir);
    const baseHead = await git(repo, ["rev-parse", "HEAD"]);
    await rm(path.join(repo, "tracked.txt"));

    const snapshot = await readGitWorkspaceSnapshot(repo);
    expect(snapshot).toMatchObject({
      headCommit: baseHead,
      branchName: "main",
      deletedPaths: ["tracked.txt"],
    });

    await withShallowGitWorkspaceClone({
      localDir: repo,
      snapshot: snapshot!,
    }, async (cloneDir) => {
      expect((await lstat(path.join(cloneDir, ".git"))).isDirectory()).toBe(true);
      await expect(readFile(path.join(cloneDir, ".git", "shallow"), "utf8")).resolves.toContain(baseHead);
      expect(await git(cloneDir, ["rev-list", "--count", "HEAD"])).toBe("1");
      expect(await git(cloneDir, ["branch", "--show-current"])).toBe("main");
      expect(normalizeLineEndings(await readFile(path.join(cloneDir, "tracked.txt"), "utf8"))).toBe("base\n");
    });
  });

  it("builds thin git delta bundles relative to the imported base", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-git-delta-"));
    cleanupDirs.push(rootDir);
    const repo = await createRepo(rootDir);
    const baseHead = await git(repo, ["rev-parse", "HEAD"]);
    const snapshot = await readGitWorkspaceSnapshot(repo);
    expect(snapshot).not.toBeNull();

    await withShallowGitWorkspaceClone({
      localDir: repo,
      snapshot: snapshot!,
    }, async (remoteDir) => {
      const emptyBundle = path.join(rootDir, "empty.bundle");
      await execPosixShell(buildRemoteGitDeltaBundleScript({
        remoteDir,
        baseSha: baseHead,
        exportRef: createRemoteGitExportRef("test"),
        bundlePath: emptyBundle,
      }));
      expect((await stat(emptyBundle)).size).toBe(0);

      await git(remoteDir, ["config", "user.name", "Paperclip Remote"]);
      await git(remoteDir, ["config", "user.email", "remote@paperclip.dev"]);
      await writeFile(path.join(remoteDir, "tracked.txt"), "remote\n", "utf8");
      await git(remoteDir, ["commit", "-am", "remote update"]);
      const remoteHead = await git(remoteDir, ["rev-parse", "HEAD"]);

      const deltaBundle = path.join(rootDir, "delta.bundle");
      const importedRef = createImportedGitRef("test");
      const exportRef = createRemoteGitExportRef("test");
      try {
        await execPosixShell(buildRemoteGitDeltaBundleScript({
          remoteDir,
          baseSha: baseHead,
          exportRef,
          bundlePath: deltaBundle,
        }));
        expect((await stat(deltaBundle)).size).toBeGreaterThan(0);

        const importedHead = await fetchGitBundleIntoLocalRef({
          localDir: repo,
          bundlePath: deltaBundle,
          exportRef,
          importedRef,
          baseSha: baseHead,
        });
        expect(importedHead).toBe(remoteHead);
        expect(await git(repo, ["rev-list", "--count", importedRef, "--not", baseHead])).toBe("1");
      } finally {
        await deleteLocalGitRef({ localDir: repo, ref: importedRef });
      }
    });
  }, 20_000);
});
