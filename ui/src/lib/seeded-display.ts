import { translateInstant } from "../i18n";

const SEEDED_NAME_TRANSLATION_KEYS: Record<string, string> = {
  CEO: "seededName.ceo",
  CTO: "seededName.cto",
  "Chief Technology Officer": "seededName.cto",
  Onboarding: "seededName.onboarding",
  "Reflection Coach": "seededName.reflectionCoach",
  Summarizer: "seededName.summarizer",
  "Founding Engineer": "seededName.foundingEngineer",
  "Hire your first engineer and create a hiring plan": "seededName.firstHiringPlan",
  "首席执行官": "seededName.ceo",
  "首席技术官": "seededName.cto",
  入门引导: "seededName.onboarding",
  复盘教练: "seededName.reflectionCoach",
  总结助手: "seededName.summarizer",
  创始工程师: "seededName.foundingEngineer",
  "招聘首位工程师并制定招聘计划": "seededName.firstHiringPlan",
};

export function displaySeededName(name: string | null | undefined): string {
  if (!name) return "";
  const translationKey = SEEDED_NAME_TRANSLATION_KEYS[name];
  return translationKey
    ? translateInstant(translationKey, { defaultValue: name })
    : name;
}
