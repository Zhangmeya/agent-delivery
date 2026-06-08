import { describe, expect, it } from "vitest";
import { injectPaperclipRuntimePromptLayersIntoContext } from "../adapters/prompt-context.js";

describe("injectPaperclipRuntimePromptLayersIntoContext", () => {
  it("appends localization guidance to the final handoff prompt layer", () => {
    const context = {
      paperclipSessionHandoffMarkdown: "Session handoff note.",
      paperclipLocalizationPromptMarkdown: "Runtime note.",
      other: "value",
    };
    const nextContext = injectPaperclipRuntimePromptLayersIntoContext(context);

    expect(nextContext).not.toBe(context);
    expect(nextContext.paperclipSessionHandoffMarkdown).toBe("Session handoff note.\n\nRuntime note.");
    expect(nextContext).not.toHaveProperty("paperclipLocalizationPromptMarkdown");
    expect(nextContext.other).toBe("value");
  });

  it("promotes localization guidance even when no handoff prompt exists yet", () => {
    const context = {
      paperclipLocalizationPromptMarkdown: "Runtime note.",
      other: "value",
    };

    const nextContext = injectPaperclipRuntimePromptLayersIntoContext(context);

    expect(nextContext.paperclipSessionHandoffMarkdown).toBe("Runtime note.");
    expect(nextContext).not.toHaveProperty("paperclipLocalizationPromptMarkdown");
    expect(nextContext.other).toBe("value");
  });

  it("leaves the context untouched when no localization prompt exists", () => {
    const context = {
      paperclipSessionHandoffMarkdown: "Session handoff note.",
    };

    expect(injectPaperclipRuntimePromptLayersIntoContext(context)).toBe(context);
  });
});
