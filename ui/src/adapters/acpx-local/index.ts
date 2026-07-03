import type { UIAdapterModule } from "../types";
import { parseAcpxStdoutLine, buildAcpxLocalConfig } from "@penclipai/adapter-acpx-local/ui";
import { SchemaConfigFields } from "../schema-config-fields";

export const acpxLocalUIAdapter: UIAdapterModule = {
  type: "acpx_local",
  label: "ACPX",
  parseStdoutLine: parseAcpxStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildAcpxLocalConfig,
};
