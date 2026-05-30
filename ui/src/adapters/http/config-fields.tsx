import type { AdapterConfigFieldsProps } from "../types";
import { useTranslation } from "react-i18next";
import {
  Field,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function HttpConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const { t } = useTranslation();
  return (
    <Field label={t("agentConfig.webhookUrl", { defaultValue: "Webhook URL" })} hint={help.webhookUrl}>
      <DraftInput
        value={
          isCreate
            ? values!.url
            : eff("adapterConfig", "url", String(config.url ?? ""))
        }
        onCommit={(v) =>
          isCreate
            ? set!({ url: v })
            : mark("adapterConfig", "url", v || undefined)
        }
        immediate
        className={inputClass}
        placeholder="https://..."
      />
    </Field>
  );
}
