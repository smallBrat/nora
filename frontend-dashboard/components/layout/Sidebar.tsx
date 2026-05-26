import { useRouter } from "next/router";
import {
  LayoutDashboard,
  Bot,
  Rocket,
  BarChart3,
  FolderOpen,
  ListChecks,
  Settings,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  GitBranch,
  ExternalLink,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useI18n } from "../../lib/i18n";

type SidebarProps = {
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | null;
  onClose?: (() => void) | null;
};

const REPO_URL = "https://github.com/solomon2773/nora";

export default function Sidebar({ collapsed = false, onToggleCollapse, onClose }: SidebarProps) {
  const router = useRouter();
  const { localizePath, t } = useI18n();

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" },
    { name: "Getting Started", icon: ListChecks, href: "/app/getting-started" },
    { name: "Agents", icon: Bot, href: "/app/agents" },
    { name: "Agent Hub", icon: ShoppingBag, href: "/app/agent-hub" },
    { name: "Deploy", icon: Rocket, href: "/app/deploy" },
    { name: "Workspaces", icon: FolderOpen, href: "/app/workspaces" },
    { name: "Monitoring", icon: BarChart3, href: "/app/monitoring" },
    { name: "Logs", icon: ScrollText, href: "/app/logs" },
  ];

  const isActive = (path) => {
    const normalized = path.replace(/^\/app/, "") || "/";
    return router.pathname === normalized;
  };

  return (
    <div
      className={clsx(
        "bg-slate-950 text-white flex flex-col border-r border-white/5 shadow-2xl z-50 overflow-y-auto transition-all duration-300",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      {/* Header */}
      <div
        className={clsx(
          "flex items-center gap-3 shrink-0",
          collapsed ? "p-4 justify-center" : "p-6 pb-8",
        )}
      >
        <img
          src="/app/logo-mark.png"
          alt="Nora"
          width={40}
          height={40}
          className="w-10 h-10 shrink-0"
        />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-xl font-bold tracking-tight leading-none text-white">Nora</span>
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1 opacity-80">
              {t("Deploy intelligence anywhere.")}
            </span>
          </div>
        )}
        {/* Mobile close button */}
        {onClose && !collapsed && (
          <button
            onClick={onClose}
            className="ml-auto p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <div className={clsx("flex-1 space-y-1", collapsed ? "px-2" : "px-4")}>
        {!collapsed && (
          <div className="text-[10px] text-slate-500 font-bold px-4 mb-4 uppercase tracking-[0.2em] opacity-60 flex items-center gap-2">
            {t("Main Operations")}
            <div className="flex-1 h-[1px] bg-white/5 ml-2"></div>
          </div>
        )}

        {navItems.map((item) => (
          <a
            key={item.name}
            href={localizePath(item.href)}
            className="block"
            title={collapsed ? t(item.name) : undefined}
          >
            <div
              className={clsx(
                "flex items-center gap-3 rounded-xl text-sm font-medium transition-all group relative",
                collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
                isActive(item.href)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5",
              )}
            >
              <item.icon
                size={18}
                className={clsx(
                  "transition-transform group-hover:scale-110 shrink-0",
                  isActive(item.href) ? "text-white" : "text-slate-500 group-hover:text-blue-400",
                )}
              />
              {!collapsed && t(item.name)}

              {isActive(item.href) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"></div>
              )}
            </div>
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className={clsx("mt-auto border-t border-white/5 space-y-1", collapsed ? "p-2" : "p-4")}>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="block"
          title={collapsed ? t("GitHub Repo") : undefined}
          aria-label={t("GitHub Repo")}
        >
          <div
            className={clsx(
              "flex items-center gap-3 rounded-xl text-sm font-medium transition-all group text-slate-500 hover:text-white hover:bg-white/5",
              collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
            )}
          >
            <GitBranch size={18} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1">{t("GitHub Repo")}</span>
                <ExternalLink size={14} className="text-slate-600 group-hover:text-slate-300" />
              </>
            )}
          </div>
        </a>

        <a
          href={localizePath("/app/settings")}
          className="block"
          title={collapsed ? t("Settings") : undefined}
        >
          <div
            className={clsx(
              "flex items-center gap-3 rounded-xl text-sm font-medium transition-all group",
              collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
              isActive("/app/settings")
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:text-white hover:bg-white/5",
            )}
          >
            <Settings size={18} className="shrink-0" />
            {!collapsed && t("Settings")}
          </div>
        </a>

        {/* Collapse toggle — desktop only */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={clsx(
              "flex items-center gap-3 rounded-xl text-sm font-medium transition-all w-full text-slate-500 hover:text-white hover:bg-white/5",
              collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
            )}
            title={collapsed ? t("Expand sidebar") : t("Collapse sidebar")}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && t("Collapse")}
          </button>
        )}
      </div>
    </div>
  );
}
