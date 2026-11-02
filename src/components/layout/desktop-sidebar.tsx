"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { ChevronsLeft, ChevronsRight, Flame } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "fryflow-sidebar-collapsed";
const SIDEBAR_EVENT = "fryflow:sidebar-change";
const WIDTH_EXPANDED = 260;
const WIDTH_COLLAPSED = 72;

/** localStorage сайдбара как внешний стор (без setState в effect). */
function subscribeSidebar(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_EVENT, callback);
  };
}

/** Сайдбар десктопа: 260px ↔ 72px, состояние — в localStorage. */
export function DesktopSidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    () => localStorage.getItem(SIDEBAR_KEY) === "1",
    () => false
  );

  const toggle = useCallback(() => {
    localStorage.setItem(
      SIDEBAR_KEY,
      localStorage.getItem(SIDEBAR_KEY) === "1" ? "0" : "1"
    );
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }, []);

  return (
    <aside
      className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-300 ease-in-out lg:flex"
      style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
    >
      {/* Логотип */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center" : "px-5"
        )}
      >
        <Link href="/" className="flex items-center gap-2.5" aria-label="FryFlow — на главный экран">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Flame className="size-[18px]" strokeWidth={2.2} />
          </span>
          {!collapsed && (
            <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-ink">
              Fry<span className="text-accent">Flow</span>
            </span>
          )}
        </Link>
      </div>

      {/* Навигация */}
      <nav className="fryflow-scroll flex-1 overflow-y-auto overflow-x-hidden p-3" aria-label="Основная навигация">
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.id} item={item} collapsed={collapsed} active={pathname === item.href} />
          ))}
        </ul>
        {collapsed ? (
          <div className="my-3 border-t border-border" />
        ) : (
          <p className="px-3 pb-1.5 pt-5 text-[11px] font-medium tracking-[0.14em] text-ink-soft/80 uppercase">
            Разделы
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.id} item={item} collapsed={collapsed} active={pathname === item.href} />
          ))}
        </ul>
      </nav>

      {/* Низ: тема + сворачивание */}
      <div className="shrink-0 border-t border-border p-3">
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "justify-between")}>
          <ThemeToggle />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className="inline-flex size-10 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="relative block size-[18px]">
              <ChevronsLeft
                className={cn(
                  "absolute inset-0 size-[18px] transition-all duration-300",
                  collapsed ? "rotate-180 opacity-0" : "opacity-100"
                )}
              />
              <ChevronsRight
                className={cn(
                  "absolute inset-0 size-[18px] transition-all duration-300",
                  collapsed ? "opacity-100" : "-rotate-180 opacity-0"
                )}
              />
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const { toast } = useToast();
  const Icon = item.icon;

  const handleClick = (e: React.MouseEvent) => {
    // нереализованные разделы — честная обратная связь вместо 404
    if (!item.ready) {
      e.preventDefault();
      toast({
        title: `Раздел «${item.title}» в разработке`,
        description: "Появится в следующих задачах.",
        duration: 3200,
      });
    }
  };

  return (
    <li>
      <Link
        href={item.href}
        onClick={handleClick}
        title={collapsed ? item.title : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
          collapsed && "justify-center px-0",
          active
            ? "bg-accent/10 text-accent"
            : "text-ink-soft hover:bg-tint hover:text-ink"
        )}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
        {!collapsed && <span className="truncate">{item.title}</span>}
      </Link>
    </li>
  );
}
