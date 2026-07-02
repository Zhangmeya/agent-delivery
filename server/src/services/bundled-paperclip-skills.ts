export const BUNDLED_PAPERCLIP_SKILL_REPO = "penclipai/paperclip-cn";
export const RESERVED_PAPERCLIP_SKILL_KEY_PREFIX = "paperclipai/paperclip/";
export const BUNDLED_PAPERCLIP_SKILL_KEY_PREFIX = `${BUNDLED_PAPERCLIP_SKILL_REPO}/`;

export const BUNDLED_PAPERCLIP_SKILL_REPOS = [
  BUNDLED_PAPERCLIP_SKILL_REPO,
  "paperclipai/paperclip",
  "penclipai/paperclip",
] as const;

function normalizeRepoPart(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export function normalizeBundledPaperclipSkillRepo(value: string | null | undefined) {
  const normalized = normalizeRepoPart(value);
  if (!normalized) return null;
  const [owner, repo, ...rest] = normalized.split("/");
  if (!owner || !repo || rest.length > 0) return null;
  return `${owner}/${repo}`;
}

export function isBundledPaperclipSkillRepo(value: string | null | undefined) {
  const normalized = normalizeBundledPaperclipSkillRepo(value);
  return Boolean(normalized && BUNDLED_PAPERCLIP_SKILL_REPOS.includes(normalized as typeof BUNDLED_PAPERCLIP_SKILL_REPOS[number]));
}

export function isReservedPaperclipSkillKey(value: string | null | undefined) {
  return Boolean(getBundledPaperclipSkillSlugFromKey(value));
}

export function isBundledPaperclipSkillSourceForKey(
  repo: string | null | undefined,
  canonicalKey: string | null | undefined,
) {
  return Boolean(getBundledPaperclipSkillSlugFromKey(canonicalKey) && isBundledPaperclipSkillRepo(repo));
}

export function getBundledPaperclipSkillSlugFromKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  for (const repo of BUNDLED_PAPERCLIP_SKILL_REPOS) {
    const prefix = `${repo}/`;
    if (normalized.startsWith(prefix)) {
      const slug = normalized.slice(prefix.length);
      return slug || null;
    }
  }
  return null;
}

export function getBundledPaperclipSkillIdentity(value: string | null | undefined) {
  const slug = getBundledPaperclipSkillSlugFromKey(value);
  return slug ? `${BUNDLED_PAPERCLIP_SKILL_KEY_PREFIX}${slug}` : null;
}
