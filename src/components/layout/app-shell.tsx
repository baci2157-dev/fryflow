"use client";

import { useEffect } from "react";

import { CommandPalette } from "@/components/command-palette";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { SyncBanner } from "@/components/offline/network-status";
import { useAdviceStore } from "@/lib/advice-store";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { useAiTriggers } from "@/lib/ai-triggers";
import { useCrmStore } from "@/lib/clients-store";
import { initOfflineQueue } from "@/lib/offline-queue";
import { useMarketingStore } from "@/lib/marketing-store";
import { useOrdersStore } from "@/lib/orders-store";
import { useProductsStore } from "@/lib/products-store";
import { useRegionsStore } from "@/lib/regions-store";
import { useSettingsStore } from "@/lib/settings-store";
import { useUiStore } from "@/lib/ui-store";

/**
 * Каркас приложения FryFlow.
 * Desktop (≥1024px): сворачиваемый сайдбар. Mobile: BottomNav + Sheet «Ещё».
 * Здесь же — глобальный хоткей командной палитры (Ctrl+K / Cmd+K),
 * восстановление сторов из localStorage (после гидратации React,
 * чтобы не было расхождения SSR ↔ клиент) и движок проактивного
 * ИИ (lib/ai-triggers.ts): активность пользователя, интервалы
 * советов, критичные алерты в Telegram и пинг автопостинга.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  useAiTriggers();

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
    void useOrdersStore.persist.rehydrate();
    void useProductsStore.persist.rehydrate();
    void useSettingsStore.persist.rehydrate();
    void useAiChatStore.persist.rehydrate();
    void useRegionsStore.persist.rehydrate();
    void useAdviceStore.persist.rehydrate();
    void useMarketingStore.persist.rehydrate();
    /* Офлайн-очередь: следим за сетью, при возврате — автосинхронизация. */
    initOfflineQueue();
  }, []);

  return (
    <div className="flex min-h-dvh bg-bg">
      <DesktopSidebar />
      {/* pb-24 на мобильных — воздух под фиксированным BottomNav */}
      <main className="min-w-0 flex-1 pb-24 lg:pb-0">
        {/* Баннер «Ожидает синхронизации» — когда в очереди есть действия */}
        <SyncBanner />
        {children}
      </main>
      <MobileBottomNav />
      <CommandPalette />
    </div>
  );
}
