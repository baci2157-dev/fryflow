"use client";

import { fetchAllFromSupabase } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase";
import { useAdviceStore } from "@/lib/advice-store";
import { useCrmStore } from "@/lib/clients-store";
import { useOrdersStore } from "@/lib/orders-store";
import { useRegionsStore } from "@/lib/regions-store";
import { useSettingsStore } from "@/lib/settings-store";

/**
 * Резервное копирование FryFlow (задача 8).
 *
 * «Скачать резервную копию (JSON)» в Настройках выгружает ВСЁ
 * из текущего режима:
 *  • mock — локальные сторы (localStorage): клиенты, звонки,
 *    маршрут, заказы, склад, оплаты, регионы, настройки, совет ИИ;
 *  • Supabase — все таблицы базы (клиенты, звонки, заказы,
 *    движения, оплаты, партнёры, настройки, черновики).
 *
 * Файл: fryflow-backup-ГГГГ-ММ-ДД.json — открывается блокнотом,
 * кладётся в облако или отправляется себе в Telegram.
 */

export interface BackupFile {
  app: "FryFlow";
  version: string;
  mode: "mock" | "supabase";
  exportedAt: string;
  data: Record<string, unknown>;
}

const APP_VERSION = "1.0.0";

/** Собрать полную копию данных из текущего режима. */
export async function collectBackup(): Promise<BackupFile> {
  const sb = getSupabase();

  if (sb) {
    /* Supabase: выгружаем таблицы (единый источник правды). */
    const tables = await fetchAllFromSupabase();
    return {
      app: "FryFlow",
      version: APP_VERSION,
      mode: "supabase",
      exportedAt: new Date().toISOString(),
      data: tables ?? {},
    };
  }

  /* Mock: локальные сторы целиком. */
  const crm = useCrmStore.getState();
  const deals = useOrdersStore.getState();
  const regions = useRegionsStore.getState();
  const settings = useSettingsStore.getState();
  const advice = useAdviceStore.getState();

  return {
    app: "FryFlow",
    version: APP_VERSION,
    mode: "mock",
    exportedAt: new Date().toISOString(),
    data: {
      clients: crm.clients,
      calls: crm.calls,
      routeStops: crm.routeStops,
      capacity: crm.capacity,
      orders: deals.orders,
      movements: deals.movements,
      payments: deals.payments,
      nextOrderNumber: deals.nextOrderNumber,
      regionalPartners: regions.partners,
      settings: { invoice: settings.invoice, ai: settings.ai },
      advice: advice.last,
    },
  };
}

/** Сколько всего записей в копии (для подписи под кнопкой). */
export function backupCounts(data: Record<string, unknown>) {
  const len = (k: string) =>
    Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0;
  return {
    clients: len("clients"),
    calls: len("calls"),
    orders: len("orders"),
    partners: Array.isArray(data.regionalPartners)
      ? data.regionalPartners.length
      : 0,
  };
}

/** Скачать файл резервной копии (Blob → загрузка браузером). */
export async function downloadBackup(): Promise<BackupFile> {
  const backup = await collectBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fryflow-backup-${day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return backup;
}
