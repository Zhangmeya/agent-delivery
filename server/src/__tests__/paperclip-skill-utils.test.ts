import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePaperclipSkillSymlink,
  listPaperclipSkillEntries,
  removeMaintainerOnlySkillSymlinks,
} from "@penclipai/adapter-utils/server-utils";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("paperclip skill utils", () => {
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("lists bundled runtime skills from ./skills without pulling in .agents/skills", async () => {
    const root = await makeTempDir("paperclip-skill-roots-");
    cleanupDirs.add(root);

    const moduleDir = path.join(root, "a", "b", "c", "d", "e");
    await fs.mkdir(moduleDir, { recursive: true });
    await fs.mkdir(path.join(root, "skills", "paperclip"), { recursive: true });
    await fs.mkdir(path.join(root, "skills", "paperclip-create-agent"), { recursive: true });
    await fs.mkdir(path.join(root, ".agents", "skills", "release"), { recursive: true });

    const entries = await listPaperclipSkillEntries(moduleDir);

    expect(entries.map((entry) => entry.key)).toEqual([
      "penclipai/paperclip-cn/paperclip",
      "penclipai/paperclip-cn/paperclip-create-agent",
    ]);
    expect(entries.map((entry) => entry.runtimeName)).toEqual([
      "paperclip",
      "paperclip-create-agent",
    ]);
    expect(entries[0]?.source).toBe(path.join(root, "skills", "paperclip"));
    expect(entries[1]?.source).toBe(path.join(root, "skills", "paperclip-create-agent"));
  });

  it("lists runtime skills from a packaged app-runtime skills directory", async () => {
    const root = await makeTempDir("paperclip-packaged-skill-roots-");
    cleanupDirs.add(root);

    const moduleDir = path.join(root, "app-runtime", "node_modules", "@penclipai", "adapter-codex-local", "dist", "server");
    await fs.mkdir(moduleDir, { recursive: true });
    await fs.mkdir(path.join(root, "app-runtime", "skills", "paperclip"), { recursive: true });

    const entries = await listPaperclipSkillEntries(moduleDir);

    expect(entries.map((entry) => entry.key)).toEqual(["penclipai/paperclip-cn/paperclip"]);
    expect(entries.map((entry) => entry.runtimeName)).toEqual(["paperclip"]);
    expect(entries[0]?.source).toBe(path.join(root, "app-runtime", "skills", "paperclip"));
  });

  it("documents artifact uploads in the installed Paperclip skill", async () => {
    const skillBody = await fs.readFile(path.resolve("skills/paperclip/SKILL.md"), "utf8");
    const referenceBody = await fs.readFile(path.resolve("skills/paperclip/references/artifacts.md"), "utf8");

    expect(skillBody).toContain("Generated Artifacts and Work Products");
    expect(skillBody).toContain("references/artifacts.md");
    expect(skillBody).not.toContain("/api/companies/$PAPERCLIP_COMPANY_ID/issues/$PAPERCLIP_TASK_ID/attachments");
    expect(referenceBody).toContain("Generated Artifacts and Work Products");
    expect(referenceBody).toContain("scripts/paperclip-upload-artifact.sh");
    expect(referenceBody).toContain("POST");
    expect(referenceBody).toContain("/api/companies/$PAPERCLIP_COMPANY_ID/issues/$PAPERCLIP_TASK_ID/attachments");
    expect(referenceBody).toContain("/api/issues/$PAPERCLIP_TASK_ID/work-products");
    await expect(
      fs.access(path.resolve("skills/paperclip/scripts/paperclip-upload-artifact.sh")),
    ).resolves.toBeUndefined();
    await expect(fs.access(path.resolve("scripts/paperclip-upload-artifact.sh"))).rejects.toThrow();
  });

  it("marks skills with required: false in SKILL.md frontmatter as optional", async () => {
    const root = await makeTempDir("paperclip-skill-optional-");
    cleanupDirs.add(root);

    const moduleDir = path.join(root, "a", "b", "c", "d", "e");
    await fs.mkdir(moduleDir, { recursive: true });

    // Required skill (no frontmatter flag)
    const requiredDir = path.join(root, "skills", "paperclip");
    await fs.mkdir(requiredDir, { recursive: true });
    await fs.writeFile(path.join(requiredDir, "SKILL.md"), "---\nname: paperclip\n---\n\n# Paperclip\n");

    // Optional skill (required: false)
    const optionalDir = path.join(root, "skills", "paperclip-dev");
    await fs.mkdir(optionalDir, { recursive: true });
    await fs.writeFile(path.join(optionalDir, "SKILL.md"), "---\nname: paperclip-dev\nrequired: false\n---\n\n# Dev\n");

    const entries = await listPaperclipSkillEntries(moduleDir);
    entries.sort((a, b) => a.runtimeName.localeCompare(b.runtimeName));

    expect(entries).toHaveLength(2);
    expect(entries[0]?.runtimeName).toBe("paperclip");
    expect(entries[0]?.required).toBe(true);
    expect(entries[1]?.runtimeName).toBe("paperclip-dev");
    expect(entries[1]?.required).toBe(false);
    expect(entries[1]?.requiredReason).toBeNull();
  });

  it("removes stale maintainer-only symlinks from a shared skills home", async () => {
    const root = await makeTempDir("paperclip-skill-cleanup-");
    cleanupDirs.add(root);

    const skillsHome = path.join(root, "skills-home");
    const runtimeSkill = path.join(root, "skills", "paperclip");
    const customSkill = path.join(root, "custom", "release-notes");
    const staleMaintainerSkill = path.join(root, ".agents", "skills", "release");

    await fs.mkdir(skillsHome, { recursive: true });
    await fs.mkdir(runtimeSkill, { recursive: true });
    await fs.mkdir(customSkill, { recursive: true });

    await fs.symlink(runtimeSkill, path.join(skillsHome, "paperclip"));
    await fs.symlink(customSkill, path.join(skillsHome, "release-notes"));
    await fs.symlink(staleMaintainerSkill, path.join(skillsHome, "release"));

    const removed = await removeMaintainerOnlySkillSymlinks(skillsHome, ["paperclip"]);

    expect(removed).toEqual(["release"]);
    await expect(fs.lstat(path.join(skillsHome, "release"))).rejects.toThrow();
    expect((await fs.lstat(path.join(skillsHome, "paperclip"))).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(path.join(skillsHome, "release-notes"))).isSymbolicLink()).toBe(true);
  });

  it("copies a runtime skill directory when link creation is denied and fallback is enabled", async () => {
    const sourceRoot = await makeTempDir("paperclip-skill-copy-src-");
    const targetRoot = await makeTempDir("paperclip-skill-copy-target-");
    cleanupDirs.add(sourceRoot);
    cleanupDirs.add(targetRoot);

    const source = path.join(sourceRoot, "paperclip");
    const target = path.join(targetRoot, "paperclip");
    await fs.mkdir(path.join(source, "references"), { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: paperclip\n---\n", "utf8");
    await fs.writeFile(path.join(source, "references", "guide.md"), "runtime helper", "utf8");

    const symlinkSpy = vi.spyOn(fs, "symlink").mockImplementation(async () => {
      const error = new Error("simulated permission failure") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    });

    let mode: Awaited<ReturnType<typeof ensurePaperclipSkillSymlink>>;
    try {
      mode = await ensurePaperclipSkillSymlink(source, target, { allowCopyFallback: true });
    } finally {
      symlinkSpy.mockRestore();
    }

    expect(mode).toBe("created");
    expect((await fs.lstat(target)).isDirectory()).toBe(true);
    expect((await fs.lstat(target)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toContain("paperclip");
    expect(await fs.readFile(path.join(target, "references", "guide.md"), "utf8")).toBe("runtime helper");
  });

  it("surfaces permission errors when copy fallback is disabled", async () => {
    const sourceRoot = await makeTempDir("paperclip-skill-link-src-");
    const targetRoot = await makeTempDir("paperclip-skill-link-target-");
    cleanupDirs.add(sourceRoot);
    cleanupDirs.add(targetRoot);

    const source = path.join(sourceRoot, "paperclip");
    const target = path.join(targetRoot, "paperclip");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: paperclip\n---\n", "utf8");

    const symlinkSpy = vi.spyOn(fs, "symlink").mockImplementation(async () => {
      const error = new Error("simulated permission failure") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    });

    try {
      await expect(
        ensurePaperclipSkillSymlink(source, target),
      ).rejects.toMatchObject({ code: "EPERM" });
    } finally {
      symlinkSpy.mockRestore();
    }
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
