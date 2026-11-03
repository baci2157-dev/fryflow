"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CommandPalette } from "@/components/command-palette";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { SyncBanner } from "@/components/offline/network-status";
import { useAdviceStore } from "@/lib/advice-store";
import { useAiChatStore } from "@/lib/ai-chat-store";
import { useAiTriggers } from "@/lib/ai-triggers";
import { useCrmStore } from "@/lib/clients-store";
import { ensureBaseSeeded } from "@/lib/seed-base";
import { isLoggedIn } from "@/lib/auth";
import { useDiscoveryStore } from "@/lib/discovery-store";
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
 *
 * Задача 10: экран /login живёт без каркаса (ни сайдбара, ни guard),
 * остальные экраны — за локальной авторизацией (fryflow-auth):
 * нет активной сессии → редирект на вход, контент не мигает —
 * пока проверяем, висит нейтральный сплэш.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /* Логин — отдельный мир: форма по центру, без навигации и триггеров. */
  if (pathname === "/login") {
    return <div className="min-h-dvh bg-bg">{children}</div>;
  }

  return <GuardedShell>{children}</GuardedShell>;
}

/** Обёртка всех рабочих экранов: guard + вся глобальная механика. */
function GuardedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  /* Авторизация: сессии нет — на /login, не показывая данные.
   *  setState через rAF — как на Дашборде (без каскада рендеров). */
  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const id = requestAnimationFrame(() => setAllowed(true));
    return () => cancelAnimationFrame(id);
  }, [router]);

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
    /* CRM первым: после его восстановления решаем, нужен ли
     * авто-сид базы (пустой localStorage / чистые демо-карточки →
     * грузим 248 точек владельца из public/seed/clients.json). */
    void (async () => {
      await useCrmStore.persist.rehydrate();
      await ensureBaseSeeded();
    })();
    void useOrdersStore.persist.rehydrate();
    void useProductsStore.persist.rehydrate();
    void useSettingsStore.persist.rehydrate();
    void useAiChatStore.persist.rehydrate();
    void useRegionsStore.persist.rehydrate();
    void useAdviceStore.persist.rehydrate();
    void useMarketingStore.persist.rehydrate();
    void useDiscoveryStore.persist.rehydrate();
    /* Офлайн-очередь: следим за сетью, при возврате — автосинхронизация. */
    initOfflineQueue();
  }, []);

  /* Проверяем сессию (мгновенно, из localStorage) — до ответа не мигаем. */
  if (!allowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="size-3 animate-pulse rounded-full bg-accent" />
      </div>
    );
  }

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
