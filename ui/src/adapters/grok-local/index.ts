import type { UIAdapterModule } from "../types";
import { createGrokStdoutParser, parseGrokStdoutLine } from "@penclipai/adapter-grok-local/ui";
import { buildGrokLocalConfig } from "@penclipai/adapter-grok-local/ui";
import { GrokLocalConfigFields } from "./config-fields";

export const grokLocalUIAdapter: UIAdapterModule = {
  type: "grok_local",
  label: "Grok Build",
  parseStdoutLine: parseGrokStdoutLine,
  createStdoutParser: createGrokStdoutParser,
  ConfigFields: GrokLocalConfigFields,
  buildAdapterConfig: buildGrokLocalConfig,
};
