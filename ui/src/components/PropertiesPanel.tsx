import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePanel } from "../context/PanelContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function PropertiesPanel() {
  const { t } = useTranslation();
  const { panelContent, panelVisible, setPanelVisible } = usePanel();

  if (!panelContent) return null;

  return (
    <aside
      className="delivery-properties-panel hidden h-full shrink-0 flex-col overflow-hidden border-l border-delivery-glass-border bg-delivery-surface-strong/90 backdrop-blur-xl transition-(--tp-width-opacity) duration-200 ease-in-out md:flex"
      style={{ width: panelVisible ? 320 : 0, opacity: panelVisible ? 1 : 0 }}
    >
      <div className="w-80 flex-1 flex flex-col min-w-(--sz-320px) min-h-0">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-medium">{t("Properties")}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setPanelVisible(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">{panelContent}</div>
        </ScrollArea>
      </div>
    </aside>
  );
}
