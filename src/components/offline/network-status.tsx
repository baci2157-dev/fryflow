"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";

import {
  flushQueue,
  useNetworkStatus,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

/**
 * Индикатор сети и баннер синхронизации (задача 8 — офлайн-режим).
 *
 * NetworkPill — точка на Дашборде: зелёная «Онлайн» / красная
 * «Офлайн · N в очереди» (tabular-nums, чтобы цифра не прыгала).
 *
 * SyncBanner — лента под шапкой на всех экранах: есть действия
 * в IndexedDB-очереди → «Ожидает синхронизации», кнопка отправит
 * вручную, но обычно всё уходит само при возврате сети.
 */

/** Плюрализация по-русски: 1 действие, 2 действия, 5 действий. */
function pluralActions(n: number) {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d100 >= 11 && d100 <= 14) return "действий";
  if (d10 === 1) return "действие";
  if (d10 >= 2 && d10 <= 4) return "действия";
  return "действий";
}

/* ── Точка-индикатор сети (Дашборд) ─────────────────────── */

export function NetworkPill() {
  const { online, queued } = useNetworkStatus();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums",
        online
          ? "border-tier-green/30 bg-tier-green/10 text-tier-green"
          : "border-tier-red/30 bg-tier-red/10 text-tier-red"
      )}
      title={
        online
          ? "Сеть есть. Данные синхронизируются автоматически."
          : "Нет сети. Действия копятся в очереди и уйдут при подключении."
      }
    >
      <span className="relative flex size-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            online ? "bg-emerald-400" : "bg-red-400"
          )}
        />
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            online ? "bg-emerald-500" : "bg-red-500"
          )}
        />
      </span>
      {online ? (
        <>
          <Wifi className="size-3.5" />
          Онлайн
        </>
      ) : (
        <>
          <WifiOff className="size-3.5" />
          Офлайн{queued > 0 ? ` · ${queued} в очереди` : ""}
        </>
      )}
    </span>
  );
}

/* ── Баннер «Ожидает синхронизации» (все экраны) ────────── */

export function SyncBanner() {
  const { online, queued } = useNetworkStatus();
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(0);

  /* После ручной синхронизации показываем итог пару секунд. */
  useEffect(() => {
    if (queued > 0 || justSent === 0) return;
    const t = setTimeout(() => setJustSent(0), 4000);
    return () => clearTimeout(t);
  }, [queued, justSent]);

  const syncNow = async () => {
    setBusy(true);
    try {
      const { sent } = await flushQueue();
      setJustSent(sent);
    } finally {
      setBusy(false);
    }
  };

  const visible = queued > 0 || justSent > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="overflow-hidden"
        >
          <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
            <div
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3",
                justSent > 0 && queued === 0
                  ? "border-tier-green/30 bg-tier-green/10"
                  : "border-accent/40 bg-accent/10"
              )}
              role="status"
            >
              {justSent > 0 && queued === 0 ? (
                <RefreshCw className="size-4 shrink-0 text-tier-green" />
              ) : (
                <CloudOff className="size-4 shrink-0 text-accent" />
              )}
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                {justSent > 0 && queued === 0 ? (
                  <>
                    Синхронизировано:{" "}
                    <span className="font-semibold tabular-nums">
                      {justSent}
                    </span>{" "}
                    {pluralActions(justSent)} ушло на сервер.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">
                      Ожидает синхронизации:
                    </span>{" "}
                    <span className="font-semibold tabular-nums">
                      {queued}
                    </span>{" "}
                    {pluralActions(queued)} —{" "}
                    {online
                      ? "попробуйте ещё раз или подождите минуту."
                      : "уйдут на сервер автоматически при появлении сети."}
                  </>
                )}
              </p>
              {queued > 0 && (
                <button
                  type="button"
                  onClick={syncNow}
                  disabled={busy}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-all active:scale-[0.98] disabled:opacity-50",
                    online
                      ? "bg-accent text-accent-foreground hover:bg-accent/90"
                      : "border border-border bg-surface text-ink-soft"
                  )}
                >
                  <RefreshCw
                    className={cn("size-4", busy && "animate-spin")}
                  />
                  {busy ? "Отправляем…" : "Синхронизировать"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
