"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, RefreshCw } from "lucide-react";

import { useCrmStore } from "@/lib/clients-store";
import { seedClientsBase, seedRuntime } from "@/lib/seed-base";
import { cn } from "@/lib/utils";

/**
 * Лента-фолбэк авто-сида (задача 19.5).
 *
 * Если после ensureBaseSeeded база всё ещё меньше 100 точек (файл сида
 * был недоступен, сеть оборвалась на первом запуске, геокодинг завис —
 * теперь он с таймаутом, но страховка не помешает), показываем ленту
 * с кнопкой «Загрузить базу (360 точек)» — это тот же seedClientsBase,
 * что и кнопка в Настройках: дедуп name+address не создаёт дублей и
 * не трогает уже добавленные карточки.
 *
 * Как только база догнала 100+ точек, лента исчезает сама.
 * Визуально — родная сестра SyncBanner (та же лента под шапкой).
 */
export function SeedFallbackBanner() {
  const clients = useCrmStore((s) => s.clients);
  const seeding = useCrmStore((s) => s.seeding);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      await seedClientsBase();
    } catch {
      /* seedClientsBase кидает ошибку файла/сети — лента остаётся,
       * кнопку можно нажать снова (или подождать сеть). */
    } finally {
      setBusy(false);
    }
  };

  const visible =
    seedRuntime.attempted && !seeding && !busy && clients.length < 100;

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
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3"
              role="status"
            >
              <Database className="size-4 shrink-0 text-accent" />
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                <span className="font-semibold">
                  База загрузилась не полностью:
                </span>{" "}
                <span className="font-semibold tabular-nums">
                  {clients.length}
                </span>{" "}
                из 360 точек. Нажмите кнопку — догрузим базу владельца,
                дубликаты не создадутся.
              </p>
              <button
                type="button"
                onClick={load}
                disabled={busy}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
              >
                <RefreshCw className={cn("size-4", busy && "animate-spin")} />
                {busy ? "Загружаем…" : "Загрузить базу (360 точек)"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
