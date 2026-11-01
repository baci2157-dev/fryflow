"use client";

import { useEffect } from "react";

import { CommandPalette } from "@/components/command-palette";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { useCrmStore } from "@/lib/clients-store";
import { useUiStore } from "@/lib/ui-store";

/**
 * Каркас приложения FryFlow.
 * Desktop (≥1024px): сворачиваемый сайдбар. Mobile: BottomNav + Sheet «Ещё».
 * Здесь же — глобальный хоткей командной палитры (Ctrl+K / Cmd+K)
 * и восстановление CRM-стора из localStorage (после гидратации React,
 * чтобы не было расхождения SSR ↔ клиент).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUiStore.getState().togglePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    void useCrmStore.persist.rehydrate();
  }, []);

  return (
    <div className="flex min-h-dvh bg-bg">
      <DesktopSidebar />
      {/* pb-24 на мобильных — воздух под фиксированным BottomNav */}
      <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
      <MobileBottomNav />
      <CommandPalette />
    </div>
  );
}
