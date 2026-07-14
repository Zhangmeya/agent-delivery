import { Rocket, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

interface FrontDoorProps {
  onChoose: (path: "create" | "grow") => void;
}

export function FrontDoor({ onChoose }: FrontDoorProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-(--sz-60vh) px-8">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-bold tracking-tight">
          {t("frontDoor.welcome", { defaultValue: "Welcome to Paperclip CN" })}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t("frontDoor.getStartedQuestion", { defaultValue: "How would you like to get started?" })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full">
        <button
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6",
            "hover:border-foreground hover:bg-accent/30 transition-all",
            "text-center group cursor-pointer",
          )}
          onClick={() => onChoose("create")}
        >
          <div className="rounded-full bg-muted/50 p-3 group-hover:bg-accent transition-colors">
            <Rocket className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{t("frontDoor.buildTeamTitle", { defaultValue: "Build a new team" })}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("frontDoor.buildTeamDescription", {
                defaultValue: "Begin with a mission, bring on a lead agent, and grow a team of agents to do the work.",
              })}
            </p>
          </div>
        </button>

        <button
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-border p-6",
            "hover:border-foreground hover:bg-accent/30 transition-all",
            "text-center group cursor-pointer",
          )}
          onClick={() => onChoose("grow")}
        >
          <div className="rounded-full bg-muted/50 p-3 group-hover:bg-accent transition-colors">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{t("frontDoor.addAgentsTitle", { defaultValue: "Add agents to your org" })}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("frontDoor.addAgentsDescription", { defaultValue: "Bring AI agents into your existing team or workflows." })}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
