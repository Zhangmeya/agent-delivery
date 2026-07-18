import type { TFunction } from "i18next";

type PluginSlotDisplaySource = {
  id: string;
  pluginKey: string;
  displayName: string;
};

const FIRST_PARTY_SLOT_TRANSLATION_KEYS: Record<string, string> = {
  "paperclip.workspace-diff:workspace-changes-tab": "pluginExamples.workspaceDiff.tabs.changes",
};

export function displayPluginSlotName(slot: PluginSlotDisplaySource, t: TFunction): string {
  const translationKey = FIRST_PARTY_SLOT_TRANSLATION_KEYS[`${slot.pluginKey}:${slot.id}`];
  return translationKey
    ? t(translationKey, { defaultValue: slot.displayName })
    : slot.displayName;
}
