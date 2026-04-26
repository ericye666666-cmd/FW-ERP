import {
  Bell,
  Boxes,
  BriefcaseBusiness,
  ClipboardList,
  PackageSearch,
  ChevronRight,
  LayoutGrid,
  ScanLine,
  Search,
  Sparkles,
  Warehouse,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { navigationGroups, pageMeta, workspaceSummary } from "../data/mock";
import { cn } from "../lib/utils";
import { themes, useTheme } from "../theme";

const iconMap: Record<string, typeof LayoutGrid> = {
  "/": Sparkles,
  "/bale-inbound": Warehouse,
  "/sorting-tasks": Sparkles,
  "/sorting-station-preview": ClipboardList,
  "/location-inventory": Boxes,
  "/bale-sales/pricing": PackageSearch,
  "/bale-sales/outbound": ScanLine,
  "http://127.0.0.1:8000/app/": BriefcaseBusiness,
};

export function AdminLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  if (location.pathname === "/sorting-station-preview") {
    return <Outlet />;
  }

  const current = pageMeta[location.pathname as keyof typeof pageMeta] ?? pageMeta["/"];
  const CurrentIcon = iconMap[location.pathname as keyof typeof iconMap] ?? LayoutGrid;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[color:var(--app-text)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[290px] shrink-0 border-r border-[color:var(--sidebar-border)] bg-[var(--sidebar-bg)] px-5 py-5 text-[color:var(--sidebar-text)] lg:flex lg:flex-col">
          <div className="rounded-[30px] border border-[color:var(--sidebar-soft-border)] bg-[var(--sidebar-panel)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-contrast)] text-[var(--accent-strong)] shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sidebar-muted)]">
                  AI 自动化
                </p>
                <h1 className="mt-1 text-[22px] font-semibold tracking-tight">指挥中枢</h1>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[color:var(--sidebar-copy)]">{workspaceSummary.note}</p>
          </div>

          <div className="mt-8 space-y-6">
            {navigationGroups.map((group) => (
              <div key={group.title}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--sidebar-faint)]">
                  {group.title}
                </p>
                <nav className="mt-3 space-y-2">
                  {group.items.map((item) => {
                    if ("children" in item) {
                      const isSectionActive = item.children.some((child) => child.href === location.pathname);
                      const SectionIcon = PackageSearch;
                      return (
                        <div
                          key={item.label}
                          className={cn(
                            "rounded-[24px] border px-4 py-3 transition-all duration-200",
                            isSectionActive
                              ? "border-[color:var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] shadow-[0_18px_40px_-24px_rgba(7,24,28,0.35)]"
                              : "border-[color:var(--sidebar-soft-border)] bg-[var(--sidebar-item-bg)] text-[color:var(--sidebar-text-soft)]",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl transition-colors",
                                isSectionActive
                                  ? "bg-[var(--sidebar-active-icon-bg)] text-[var(--sidebar-active-icon-text)]"
                                  : "bg-[var(--sidebar-icon-bg)] text-[color:var(--sidebar-text-soft)]",
                              )}
                            >
                              <SectionIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold">{item.label}</p>
                                <ChevronRight
                                  className={cn(
                                    "h-4 w-4 shrink-0",
                                    isSectionActive
                                      ? "text-[color:var(--sidebar-active-copy)]"
                                      : "text-[color:var(--sidebar-faint)]",
                                  )}
                                />
                              </div>
                              <p
                                className={cn(
                                  "mt-1 text-xs leading-5",
                                  isSectionActive
                                    ? "text-[color:var(--sidebar-active-copy)]"
                                    : "text-[color:var(--sidebar-copy)]",
                                )}
                              >
                                {item.description}
                              </p>

                              <div className="mt-4 space-y-2 border-t border-[color:var(--sidebar-soft-border)] pt-4">
                                {item.children.map((child) => {
                                  const ChildIcon = iconMap[child.href] ?? LayoutGrid;
                                  return (
                                    <NavLink
                                      key={child.href}
                                      to={child.href}
                                      className={({ isActive }) =>
                                        cn(
                                          "flex items-start gap-3 rounded-2xl px-3 py-3 transition-all",
                                          isActive
                                            ? "bg-white/75 text-[color:var(--app-text)] shadow-sm"
                                            : "bg-transparent text-[color:var(--sidebar-copy)] hover:bg-white/40 hover:text-[color:var(--app-text)]",
                                        )
                                      }
                                    >
                                      {({ isActive }) => (
                                        <>
                                          <div
                                            className={cn(
                                              "mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl",
                                              isActive
                                                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                                : "bg-[var(--sidebar-icon-bg)] text-[color:var(--sidebar-text-soft)]",
                                            )}
                                          >
                                            <ChildIcon className="h-4 w-4" />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold">{child.label}</p>
                                            <p className="mt-1 text-xs leading-5 opacity-80">{child.description}</p>
                                          </div>
                                        </>
                                      )}
                                    </NavLink>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const Icon = iconMap[item.href] ?? LayoutGrid;
                    const itemContent = (isActive: boolean) => (
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl transition-colors",
                            isActive
                              ? "bg-[var(--sidebar-active-icon-bg)] text-[var(--sidebar-active-icon-text)]"
                              : "bg-[var(--sidebar-icon-bg)] text-[color:var(--sidebar-text-soft)] group-hover:bg-[var(--sidebar-icon-hover-bg)]",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{item.label}</p>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isActive ? "text-[color:var(--sidebar-active-copy)]" : "text-[color:var(--sidebar-faint)]",
                              )}
                            />
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-xs leading-5",
                              isActive ? "text-[color:var(--sidebar-active-copy)]" : "text-[color:var(--sidebar-copy)]",
                            )}
                          >
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );

                    const baseClassName =
                      "group block rounded-[24px] border px-4 py-3 transition-all duration-200";

                    if ("external" in item && item.external) {
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          className={cn(
                            baseClassName,
                            "border-[color:var(--sidebar-soft-border)] bg-[var(--sidebar-item-bg)] text-[color:var(--sidebar-text-soft)] hover:border-[color:var(--sidebar-item-hover-border)] hover:bg-[var(--sidebar-item-hover-bg)]",
                          )}
                        >
                          {itemContent(false)}
                        </a>
                      );
                    }

                    return (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        end={item.href === "/"}
                        className={({ isActive }) =>
                          cn(
                            baseClassName,
                            isActive
                              ? "border-[color:var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] shadow-[0_18px_40px_-24px_rgba(7,24,28,0.35)]"
                              : "border-[color:var(--sidebar-soft-border)] bg-[var(--sidebar-item-bg)] text-[color:var(--sidebar-text-soft)] hover:border-[color:var(--sidebar-item-hover-border)] hover:bg-[var(--sidebar-item-hover-bg)]",
                          )
                        }
                      >
                        {({ isActive }) =>
                          itemContent(isActive)
                        }
                      </NavLink>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>

          <div className="mt-auto rounded-[28px] border border-[color:var(--sidebar-soft-border)] bg-[var(--sidebar-panel)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--sidebar-faint)]">
              工作区状态
            </p>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{workspaceSummary.site}</p>
                <p className="mt-1 text-sm text-[color:var(--sidebar-copy)]">{workspaceSummary.status}</p>
              </div>
              <Badge className="bg-[var(--sidebar-live-bg)] text-[var(--sidebar-live-text)]">在线</Badge>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[color:var(--header-border)] bg-[var(--header-bg)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-6 py-4 lg:px-8">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Badge className="bg-[var(--eyebrow-bg)] text-[var(--eyebrow-text)]">{current.eyebrow}</Badge>
                  <p className="text-sm text-[color:var(--muted)]">统一看板 + 智库</p>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-strong)] text-[var(--accent-contrast)] shadow-sm">
                    <CurrentIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-[28px] font-semibold tracking-tight text-[color:var(--app-text)]">{current.title}</h2>
                    <p className="text-sm text-[color:var(--muted)]">{current.description}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative hidden xl:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
                  <Input className="w-80 pl-10 shadow-none" placeholder="搜索任务、手册、自动化或库位" />
                </div>

                <div className="hidden items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[var(--surface)] p-1.5 lg:flex">
                  {themes.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-left transition-all",
                        theme === option.id
                          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] shadow-sm"
                          : "text-[color:var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[color:var(--app-text)]",
                      )}
                    >
                      <div className="text-sm font-semibold">{option.label}</div>
                      <div className="text-[11px] leading-4 opacity-75">{option.description}</div>
                    </button>
                  ))}
                </div>

                <button className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface)] p-3 text-[color:var(--muted)] transition hover:text-[color:var(--app-text)]">
                  <Bell className="h-5 w-5" />
                </button>
                <Link
                  to="/"
                  className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[color:var(--app-text)] transition hover:border-[color:var(--accent-soft)] hover:text-[var(--accent-strong)]"
                >
                  admin_1
                </Link>
              </div>
            </div>
          </header>

          <main className="flex-1 px-6 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
