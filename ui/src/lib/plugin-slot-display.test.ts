import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { displayPluginSlotName } from "./plugin-slot-display";

function testTranslator(translations: Record<string, string>): TFunction {
  return ((key: string, options?: { defaultValue?: string }) =>
    translations[key] ?? options?.defaultValue ?? key) as TFunction;
}

describe("displayPluginSlotName", () => {
  const t = testTranslator({
    "pluginExamples.workspaceDiff.tabs.changes": "变更",
  });

  it("localizes the known first-party workspace changes tab", () => {
    expect(displayPluginSlotName({
      id: "workspace-changes-tab",
      pluginKey: "paperclip.workspace-diff",
      displayName: "Changes",
    }, t)).toBe("变更");
  });

  it("preserves unknown plugin labels verbatim", () => {
    expect(displayPluginSlotName({
      id: "changes-tab",
      pluginKey: "third-party.workspace-diff",
      displayName: "Changes",
    }, t)).toBe("Changes");
  });
});
