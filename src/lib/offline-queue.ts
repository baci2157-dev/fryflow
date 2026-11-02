"use client";

import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase";

/**
 * Офлайн-очередь FryFlow (задача 8 — офлайн-режим).
 *
 * Подвалы, ангары и трассы юга — сеть там роскошь. Правило простое:
 * действие (создание заказа, оплата, заметка, звонок, пост в группу)
 * не должно пропасть из-за отсутствия сети.
 *
 * Как работает:
 *  • queueFetch / syncSupabaseAction пытаются достучаться до сервера;
 *  • сети нет (или fetch упал) — действие пишется в IndexedDB
 *    (база «fryflow-offline», стор «actions») и не теряется;
 *  • связь вернулась (событие online или проверка раз в минуту) —
 *    очередь автоматически уходит на сервер: HTTP-действия снова
 *    POST-ятся, действия Supabase — повторяются через клиент базы;
 *  • UI подписан на события: индикатор сети на Дашборде (зелёная
 *    точка / красная с числом «N в очереди») и баннер
 *    «Ожидает синхронизации» (components/offline/network-status.tsx).
 *
 * В мок-режиме (localStorage) заказы, оплаты, заметки и звонки
 * выполняются мгновенно и без сети — очередь нужна серверным
 * действиям (Telegram, автопостинг) и всем записям в режиме
 * Supabase (lib/queries.ts).
 */

/* ── Типы ────────────────────────────────────────────────── */

/** Что за действие — для подписи в баннере и очереди. */
export type QueuedKind =
  | "order" // создание заказа
  | "payment" // оплата / частичная оплата
  | "note" // заметка по клиенту
  | "call" // журнал звонка
  | "movement" // движение склада
  | "client" // карточка клиента
  | "partner" // региональный партнёр
  | "post" // автопостинг в группы
  | "telegram" // сообщение/тест Telegram
  | "settings"; // настройки

/** HTTP-часть действия: куда и что отправить при синхронизации. */
export interface HttpReplay {
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/** Supabase-часть: какую операцию повторить в базе. */
export interface SupabaseReplay {
  table: string;
  op: "insert" | "update" | "delete";
  row: Record<string, unknown>;
  /** Ключ соответствия для update/delete (обычно «id»). */
  matchKey: string;
}

/** Действие в очереди (IndexedDB, keyPath — id). */
export interface QueuedAction {
  id: string;
  kind: QueuedKind;
  /** Человекочитаемо: «Заказ · Шаурма №1», «Пост в 2 группы». */
  label: string;
  http?: HttpReplay;
  supabase?: SupabaseReplay;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

/** Событие-уведомление UI: количество в очереди поменялось. */
export const QUEUE_EVENT = "fryflow:queue";

/* ── IndexedDB (без библиотек) ───────────────────────────── */

const DB_NAME = "fryflow-offline";
const DB_VERSION = 1;
const STORE = "actions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T | undefined;
    const req = fn(store);
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/* ── Публичный API очереди ───────────────────────────────── */

function notify(count: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count } }));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Положить действие в очередь (и оповестить индикаторы). */
export async function enqueue(action: Omit<QueuedAction, "id" | "createdAt" | "attempts">) {
  const row: QueuedAction = {
    ...action,
    id: newId(),
    createdAt: Date.now(),
    attempts: 0,
  };
  try {
    await withStore("readwrite", (s) => s.add(row));
  } catch {
    /* IndexedDB недоступен — действие теряется тихо, данных не ломаем */
    return;
  }
  notify(await queueCount());
}

/** Все действия в очереди (старые первыми). */
export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const all = (await withStore("readonly", (s) => s.getAll())) as
      | QueuedAction[]
      | undefined;
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Сколько действий ждёт сети. */
export async function queueCount(): Promise<number> {
  try {
    const n = (await withStore("readonly", (s) => s.count())) as
      | number
      | undefined;
    return n ?? 0;
  } catch {
    return 0;
  }
}

async function removeQueued(id: string) {
  try {
    await withStore("readwrite", (s) => s.delete(id));
  } catch {
    /* уже нет — отлично */
  }
}

/** Полная очистка (после успешной синхронизации или вручную). */
export async function clearQueue() {
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch {
    /* пусто — и славно */
  }
  notify(0);
}

/** Сеть оборвалась? По ошибке fetch или флагу navigator.onLine. */
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /fetch|network|timeout|abort|offline|failed/i.test(msg);
}

/* ── Проигрывание очереди ────────────────────────────────── */

/** Повтор одного Supabase-действия (при синхронизации очереди). */
async function replaySupabase(
  replay: SupabaseReplay
): Promise<{ ok: boolean; retry: boolean }> {
  const sb = getSupabase();
  if (!sb) return { ok: true, retry: false }; // режим выключили — не держим
  try {
    let error: unknown = null;
    if (replay.op === "insert") {
      ({ error } = await sb.from(replay.table).insert(replay.row));
    } else if (replay.op === "update") {
      ({ error } = await sb
        .from(replay.table)
        .update(replay.row)
        .eq(replay.matchKey, replay.row[replay.matchKey] ?? replay.row.id));
    } else {
      ({ error } = await sb
        .from(replay.table)
        .delete()
        .eq(replay.matchKey, replay.row[replay.matchKey] ?? replay.row.id));
    }
    if (error) {
      if (isNetworkError(error)) return { ok: false, retry: true };
      /* RLS/схема отклонила — ретраи бессмысленны, данные уже локально */
      console.warn("[FryFlow] Supabase отклонил действие очереди:", error);
      return { ok: true, retry: false };
    }
    return { ok: true, retry: false };
  } catch (err) {
    if (isNetworkError(err)) return { ok: false, retry: true };
    console.warn("[FryFlow] Ошибка повтора Supabase-действия:", err);
    return { ok: true, retry: false };
  }
}

/**
 * Отправить очередь на сервер. Возвращает, сколько ушло и сколько
 * осталось (осталось = сеть снова подвела, попробуем позже).
 */
export async function flushQueue(): Promise<{ sent: number; left: number }> {
  const queue = await getQueue();
  let sent = 0;
  let left = 0;

  for (const action of queue) {
    let retry = false;

    if (action.http) {
      /* HTTP-действие: повторяем исходный запрос. */
      try {
        const res = await fetch(action.http.url, {
          method: action.http.method,
          headers: { "Content-Type": "application/json" },
          body: action.http.body === undefined ? undefined : JSON.stringify(action.http.body),
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          sent++; /* дошло или бракованное (ретраи не помогут) */
        } else {
          retry = true; /* 5xx — сервер моргнул, попробуем ещё */
        }
      } catch {
        retry = true; /* сети всё ещё нет */
      }
    } else if (action.supabase) {
      const r = await replaySupabase(action.supabase);
      if (r.ok) sent++;
      else retry = true;
    } else {
      sent++; /* действие без повтора — не копим мусор */
    }

    if (retry) {
      left++;
      try {
        await withStore("readwrite", (s) =>
          s.put({ ...action, attempts: action.attempts + 1 })
        );
      } catch {
        /* не критично */
      }
    } else {
      await removeQueued(action.id);
    }
  }

  notify(await queueCount());
  return { sent, left };
}

/**
 * fetch с офлайн-очередью: сети нет — действие в IndexedDB и уйдёт
 * само при восстановлении связи. Есть сеть — обычный fetch.
 */
export async function queueFetch(opts: {
  kind: QueuedKind;
  label: string;
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<{ queued: boolean; res?: Response }> {
  const method = opts.method ?? "POST";
  const offline =
    typeof navigator !== "undefined" ? navigator.onLine === false : false;

  if (!offline) {
    try {
      const res = await fetch(opts.url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      return { queued: false, res };
    } catch {
      /* сеть упала по ходу — действие в очередь ниже */
    }
  }

  await enqueue({
    kind: opts.kind,
    label: opts.label,
    http: { url: opts.url, method, body: opts.body },
  });
  return { queued: true };
}

/**
 * Запись в Supabase с офлайн-очередью: локальное состояние уже
 * обновлено (оптимистично), при обрыве сети операция повторится
 * автоматически. Используется из lib/queries.ts.
 */
export async function syncSupabaseAction(opts: {
  kind: QueuedKind;
  label: string;
  table: string;
  op: "insert" | "update" | "delete";
  row: Record<string, unknown>;
  matchKey?: string;
}): Promise<void> {
  const replay: SupabaseReplay = {
    table: opts.table,
    op: opts.op,
    row: opts.row,
    matchKey: opts.matchKey ?? "id",
  };
  const r = await replaySupabase(replay);
  if (!r.ok && r.retry) {
    await enqueue({
      kind: opts.kind,
      label: opts.label,
      supabase: replay,
    });
  }
}

/* ── Автосинхронизация ───────────────────────────────────── */

/** Запуск движка очереди: монтируется один раз в AppShell. */
export function initOfflineQueue() {
  if (typeof window === "undefined") return;

  const tryFlush = () => {
    if (navigator.onLine) void flushQueue();
  };

  window.addEventListener("online", tryFlush);
  /* Страховка: раз в минуту проверяем, не копится ли очередь. */
  window.setInterval(tryFlush, 60_000);
  /* При старте — вдруг сеть уже вернулась, пока приложение было закрыто. */
  tryFlush();
}

/* ── React-хук для индикаторов ───────────────────────────── */

export interface NetworkStatus {
  online: boolean;
  queued: number;
}

/** Сеть + длина очереди: для точки на Дашборде и баннера. */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({ online: true, queued: 0 });

  useEffect(() => {
    const refresh = async () => {
      setStatus({ online: navigator.onLine, queued: await queueCount() });
    };
    void refresh();

    const onQueue = () => void refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener(QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener(QUEUE_EVENT, onQueue);
    };
  }, []);

  return status;
}
