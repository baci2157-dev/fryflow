import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Клиент Supabase FryFlow (задача 8 — подготовка к Go-Live).
 *
 * Единый источник правды в будущем. Пока переменные окружения не
 * заданы — приложение честно работает на моках (localStorage),
 * ничего не ломая: getSupabase() возвращает null, и все сервисные
 * функции в lib/queries.ts идут по ветке mock.
 *
 * Ключи (Project Settings → API в Supabase):
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
 *
 * Схема таблиц — supabase/schema.sql (RLS: только authenticated).
 */

/** Имена таблиц — синхронизированы с supabase/schema.sql. */
export const TABLES = {
  clients: "clients",
  calls: "calls",
  orders: "orders",
  movements: "inventory_movements",
  payments: "payments",
  partners: "regional_partners",
  settings: "settings",
  drafts: "order_drafts",
  products: "products",
} as const;

let cached: SupabaseClient | null | undefined;

/**
 * Клиент Supabase или null (мок-режим). Создаётся лениво, один раз.
 * NEXT_PUBLIC_-переменные видны и на клиенте, и на сервере — это
 * безопасно: anon-ключ публичный, записи защищает RLS.
 */
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
      : null;
  return cached;
}

/** true — приложение работает с реальной базой (не на моках). */
export function hasSupabase(): boolean {
  return getSupabase() !== null;
}
