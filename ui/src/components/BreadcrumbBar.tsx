import { Link } from "@/lib/router";
import { ChevronDown, FolderPlus, ListPlus, Menu, Plus, Search } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";
import { useCompany } from "../context/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment, useMemo } from "react";
import { PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import { PluginLauncherOutlet, usePluginLaunchers } from "@/plugins/launchers";
import { useTranslation } from "react-i18next";
import { useDialogActions } from "../context/DialogContext";

type GlobalToolbarContext = { companyId: string | null; companyPrefix: string | null };

function GlobalToolbar({ context }: { context: GlobalToolbarContext }) {
  const { slots } = usePluginSlots({ slotTypes: ["globalToolbarButton"], companyId: context.companyId });
  const { launchers } = usePluginLaunchers({ placementZones: ["globalToolbarButton"], companyId: context.companyId, enabled: !!context.companyId });
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 pl-2 empty:hidden">
      {slots.length > 0 ? (
        <PluginSlotOutlet slotTypes={["globalToolbarButton"]} context={context} className="flex items-center gap-1" />
      ) : null}
      {launchers.length > 0 ? (
        <PluginLauncherOutlet placementZones={["globalToolbarButton"]} context={context} className="flex items-center gap-1" />
      ) : null}
    </div>
  );
}

function GlobalCreateMenu() {
  const { t } = useTranslation();
  const { openNewIssue, openNewProject } = useDialogActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-9 gap-1.5 px-3 shadow-sm">
          <Plus className="h-4 w-4" />
          <span>{t("common.create", { defaultValue: "新建" })}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => openNewProject()}>
          <FolderPlus className="h-4 w-4" />
          {t("dashboard.createProject", { defaultValue: "新建项目" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openNewIssue()}>
          <ListPlus className="h-4 w-4" />
          {t("dashboard.createTask", { defaultValue: "新建任务" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BreadcrumbBar() {
  const { t } = useTranslation();
  const { breadcrumbs, mobileToolbar } = useBreadcrumbs();
  const { toggleSidebar, isMobile } = useSidebar();
  const { selectedCompanyId, selectedCompany } = useCompany();

  const globalToolbarSlotContext = useMemo(
    () => ({
      companyId: selectedCompanyId ?? null,
      companyPrefix: selectedCompany?.issuePrefix ?? null,
    }),
    [selectedCompanyId, selectedCompany?.issuePrefix],
  );

  const globalToolbarSlots = <GlobalToolbar context={globalToolbarSlotContext} />;
  const createMenu = !isMobile && selectedCompanyId ? <GlobalCreateMenu /> : null;
  const searchTrigger = !isMobile ? (
    <Button
      asChild
      variant="ghost"
      className="delivery-search-trigger mr-3 hidden h-9 w-80 justify-start gap-2 border border-delivery-glass-border px-3 text-muted-foreground shadow-none lg:flex"
    >
      <Link to="/search">
        <Search className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate text-left text-xs">
          {t("Search issues, agents, projects...", { defaultValue: "搜索项目、任务或智能体" })}
        </span>
        <kbd className="rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-(length:--text-nano)">Ctrl K</kbd>
      </Link>
    </Button>
  ) : null;

  if (isMobile && mobileToolbar) {
    return (
      <div className="delivery-topbar flex h-16 shrink-0 items-center border-b border-border px-2">
        {mobileToolbar}
      </div>
    );
  }

  if (breadcrumbs.length === 0) {
    return (
      <div className="delivery-topbar flex h-16 shrink-0 items-center justify-end border-b border-border px-4 md:px-6">
        {searchTrigger}
        {createMenu}
        {globalToolbarSlots}
      </div>
    );
  }

  const menuButton = isMobile && (
    <Button
      variant="ghost"
      size="icon-sm"
      className="mr-2 shrink-0"
      onClick={toggleSidebar}
      aria-label={t("Open sidebar", { defaultValue: "Open sidebar" })}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );

  // Single breadcrumb = page title (uppercase)
  if (breadcrumbs.length === 1) {
    return (
      <div className="delivery-topbar flex h-16 shrink-0 items-center border-b border-border px-4 md:px-6">
        {menuButton}
        <div className="min-w-0 overflow-hidden flex-1">
          {breadcrumbs[0].leading ? (
            <h1 className="flex items-center gap-1.5 text-xl font-semibold">
              <span className="flex shrink-0 items-center">{breadcrumbs[0].leading}</span>
              <span className="truncate">{breadcrumbs[0].label}</span>
            </h1>
          ) : (
            <h1 className="truncate text-xl font-semibold">
              {breadcrumbs[0].label}
            </h1>
          )}
        </div>
        {searchTrigger}
        {createMenu}
        {globalToolbarSlots}
      </div>
    );
  }

  // Multiple breadcrumbs = breadcrumb trail
  return (
    <div className="delivery-topbar flex h-16 shrink-0 items-center border-b border-border px-4 md:px-6">
      {menuButton}
      <div className="min-w-0 overflow-hidden flex-1">
        <Breadcrumb className="min-w-0 overflow-hidden">
          <BreadcrumbList className="flex-nowrap">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <Fragment key={i}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className={isLast ? "min-w-0" : "shrink-0"}>
                    {isLast || !crumb.href ? (
                      crumb.leading ? (
                        <BreadcrumbPage className="flex min-w-0 items-center gap-1.5">
                          <span className="flex shrink-0 items-center">{crumb.leading}</span>
                          <span className="truncate">{crumb.label}</span>
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                      )
                    ) : (
                      <BreadcrumbLink asChild>
                        {crumb.leading ? (
                          <Link to={crumb.href} className="flex items-center gap-1.5">
                            <span className="flex shrink-0 items-center">{crumb.leading}</span>
                            <span className="truncate">{crumb.label}</span>
                          </Link>
                        ) : (
                          <Link to={crumb.href}>{crumb.label}</Link>
                        )}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {searchTrigger}
      {createMenu}
      {globalToolbarSlots}
    </div>
  );
}
