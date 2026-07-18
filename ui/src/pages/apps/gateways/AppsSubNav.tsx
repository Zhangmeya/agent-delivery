import { Link } from "@/lib/router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type SubNavKey = "connected" | "gateways" | "activity";

const ITEMS: { key: SubNavKey; defaultLabel: string; href: string }[] = [
  { key: "connected", defaultLabel: "Connected", href: "/apps" },
  { key: "gateways", defaultLabel: "Gateways", href: "/apps/gateways" },
  { key: "activity", defaultLabel: "Activity", href: "/activity" },
];

/**
 * Shared Apps section sub-navigation (Connected · Gateways · Activity). Keeps
 * the Gateways surface reachable as a first-class Apps tab per the PAP-11178
 * design of record, rather than buried under the Advanced developer door.
 */
export function AppsSubNav({ active }: { active: SubNavKey }) {
  const { t } = useTranslation();

  return (
    <nav
      className="flex items-center gap-6 border-b border-border text-sm"
      aria-label={t("apps.gateways.subNav.ariaLabel", { defaultValue: "Apps sections" })}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "-mb-px border-b-2 pb-2.5 pt-1 font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {t(`apps.gateways.subNav.${item.key}`, { defaultValue: item.defaultLabel })}
          </Link>
        );
      })}
    </nav>
  );
}
