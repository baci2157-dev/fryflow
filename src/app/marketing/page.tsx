"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Megaphone,
  Send,
  Settings2,
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { useMarketingStore } from "@/lib/marketing-store";
import { queueFetch, useNetworkStatus } from "@/lib/offline-queue";
import { stockKg, stockPacks, useOrdersStore } from "@/lib/orders-store";
import { cn } from "@/lib/utils";

/**
 * Экран «Маркетинг» (задача 8, бонус) — календарь автопостинга.
 *
 * Список запланированных постов с превью текста (шаблон + живые
 * остатки склада) и кнопкой «Опубликовать сейчас». Офлайн — пост
 * уходит в IndexedDB-очередь и публикуется при появлении сети.
 */

interface TgConfig {
  connected: boolean;
  hasToken: boolean;
  chatId: string;
  groups: string[];
  intervalDays: 2 | 3 | 7;
  template: string;
  lastPostAt: number;
  webhookActive: boolean;
  autopostReady: boolean;
}

const DAY = 86_400_000;

/** Превью поста: шаблон + живые остатки ({stock}) — как на сервере. */
function buildPreview(template: string, kg: number, packs: number): string {
  const fmt = new Intl.NumberFormat("ru-RU");
  const stockLine = `На складе сейчас: ${fmt.format(kg)} кг (${fmt.format(
    packs
  )} уп. по 2,5 кг).`;
  return template.replace(/\{stock\}/gi, stockLine.trim());
}

function pluralGroups(n: number) {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d100 >= 11 && d100 <= 14) return "групп";
  if (d10 === 1) return "группа";
  if (d10 >= 2 && d10 <= 4) return "группы";
  return "групп";
}

export default function MarketingPage() {
  const { toast } = useToast();
  const movements = useOrdersStore((s) => s.movements);
  const log = useMarketingStore((s) => s.log);
  const { online, queued } = useNetworkStatus();

  const [cfg, setCfg] = useState<TgConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offlineQueued, setOfflineQueued] = useState(false);

  const kg = useMemo(() => stockKg(movements), [movements]);
  const packs = useMemo(() => stockPacks(movements), [movements]);

  const loadCfg = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/config");
      if (res.ok) setCfg((await res.json()) as TgConfig);
    } catch {
      /* офлайн — показываем последнее известное */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadCfg();
  }, [loadCfg]);

  /* Календарь: следующий пост = lastPostAt + интервал (просрочено — сегодня),
   * дальше — с шагом интервала. Итого 4 ближайших. */
  const schedule = useMemo(() => {
    if (!cfg) return [];
    const step = cfg.intervalDays * DAY;
    let first = cfg.lastPostAt > 0 ? cfg.lastPostAt + step : Date.now();
    while (first < Date.now()) first += step;
    return [0, 1, 2, 3].map((i) => ({ at: first + i * step, first: i === 0 }));
  }, [cfg]);

  const preview = useMemo(
    () => buildPreview(cfg?.template ?? "", kg, packs),
    [cfg?.template, kg, packs]
  );

  const publishNow = async () => {
    setBusy(true);
    setOfflineQueued(false);
    try {
      const { queued: q, res } = await queueFetch({
        kind: "post",
        label: `Автопостинг в ${cfg?.groups.length ?? 0} ${pluralGroups(
          cfg?.groups.length ?? 0
        )}`,
        url: "/api/telegram/autopost",
        method: "POST",
        body: { force: true, stockKg: kg, stockPacks: packs },
      });
      if (q) {
        setOfflineQueued(true);
        return;
      }
      const data = (await res?.json()) as {
        posted?: number;
        total?: number;
        text?: string;
        error?: string;
      };
      if (data?.error || !data?.posted) {
        toast({
          title: "Не опубликовано",
          description: data?.error ?? "Telegram не принял пост.",
          duration: 4200,
        });
        return;
      }
      useMarketingStore.getState().addLog({
        at: Date.now(),
        text: data.text ?? preview,
        posted: data.posted,
        total: data.total ?? data.posted,
      });
      toast({
        title: `Опубликовано в ${data.posted} ${pluralGroups(data.posted)}`,
        description: "Следующий пост — по календарю ниже. Текст в истории.",
        duration: 4000,
      });
      await loadCfg(); // lastPostAt сдвинулся — календарь перестроится
    } catch {
      toast({
        title: "Сервер недоступен",
        description: "Проверьте соединение и попробуйте ещё раз.",
        duration: 3600,
      });
    } finally {
      setBusy(false);
    }
  };

  const todayStr = new Date().toDateString();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="py-6 lg:py-8">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          <Megaphone className="size-6 text-accent" />
          Маркетинг
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Автопостинг в группы оптовиков: ИИ переписывает шаблон (анти-спам)
          и подставляет живые остатки склада
        </p>
      </header>

      {/* ── Не настроено ── */}
      {loaded && (!cfg?.autopostReady || cfg.groups.length === 0) ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Settings2 className="size-8 text-ink-soft/50" />
          <p className="text-sm font-medium text-ink">
            Автопостинг ещё не настроен
          </p>
          <p className="max-w-sm text-[13px] leading-snug text-ink-soft">
            Укажите Bot Token и Chat ID групп в «Настройках» (раздел Telegram) —
            и календарь публикаций соберётся сам.
          </p>
          <Link
            href="/settings"
            className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            <Settings2 className="size-4" />
            Открыть настройки Telegram
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* ── Статус и публикация ── */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-ink">
                  Автопостинг{" "}
                  <span className="text-tier-green">включён</span>
                </p>
                <p className="mt-0.5 font-mono text-[12.5px] tabular-nums text-ink-soft">
                  каждые {cfg?.intervalDays}{" "}
                  {(cfg?.intervalDays ?? 3) === 2 ? "дня" : "дней"} ·{" "}
                  {cfg?.groups.length ?? 0} {pluralGroups(cfg?.groups.length ?? 0)}
                  {cfg?.lastPostAt
                    ? ` · последний: ${new Date(cfg.lastPostAt).toLocaleDateString("ru-RU")}`
                    : " · ещё не публиковали"}
                </p>
              </div>
              <button
                type="button"
                onClick={publishNow}
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
              >
                <Send className="size-4" />
                {busy ? "Публикуем…" : "Опубликовать сейчас"}
              </button>
            </div>

            {offlineQueued && (
              <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-snug text-accent">
                <Clock className="mt-0.5 size-4 shrink-0" />
                Нет сети — пост сохранён в очередь и уйдёт в группы
                автоматически при подключении (баннер «Ожидает синхронизации»).
              </p>
            )}
            {queued > 0 && !offlineQueued && (
              <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-soft">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" />
                В очереди синхронизации {queued}{" "}
                {queued === 1 ? "действие" : "действий"}
                {!online && " — ждём сеть"}. Можно публиковать новое — ничего не потеряется.
              </p>
            )}

            <p className="mt-4 rounded-xl bg-bg p-3.5 text-[13px] leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">Превью следующего поста:</span>{" "}
              {preview}
            </p>
          </motion.section>

          {/* ── Календарь ── */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 30, delay: 0.05 }}
            className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
          >
            <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
              <CalendarDays className="size-5 text-accent" />
              Календарь автопостинга
            </p>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              Автоматически, по интервалу; «Опубликовать сейчас» сдвигает
              календарь с этой даты
            </p>

            <ol className="mt-4 flex flex-col gap-3">
              {schedule.map((post, i) => {
                const d = new Date(post.at);
                const isToday = d.toDateString() === todayStr;
                return (
                  <li
                    key={post.at}
                    className={cn(
                      "flex items-start gap-4 rounded-xl border p-4",
                      post.first
                        ? "border-accent/40 bg-accent/10"
                        : "border-border bg-bg"
                    )}
                  >
                    {/* Дата — крупные равные цифры */}
                    <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-surface py-2">
                      <span className="font-mono text-xl font-bold tabular-nums leading-none text-ink">
                        {d.getDate()}
                      </span>
                      <span className="mt-1 text-[11px] font-medium capitalize text-ink-soft">
                        {d.toLocaleDateString("ru-RU", { month: "short" })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold capitalize text-ink">
                          {d.toLocaleDateString("ru-RU", {
                            weekday: "long",
                          })}
                        </span>
                        {post.first && (
                          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                            Следующий
                          </span>
                        )}
                        {isToday && !post.first && (
                          <span className="rounded-full bg-tint px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
                            Сегодня
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">
                        {preview}
                      </p>
                    </div>
                    <span className="hidden shrink-0 items-center sm:flex">
                      <CheckCircle2
                        className={cn(
                          "size-4",
                          post.first ? "text-accent" : "text-ink-soft/40"
                        )}
                      />
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.section>

          {/* ── История публикаций ── */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 30, delay: 0.1 }}
            className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
          >
            <p className="text-[16px] font-semibold text-ink">
              История публикаций
            </p>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              Что реально ушло в группы с этого устройства
            </p>

            {log.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-ink-soft">
                Пока пусто — нажмите «Опубликовать сейчас», и пост появится здесь.
              </p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3">
                {log.slice(0, 5).map((entry) => (
                  <li
                    key={entry.at}
                    className="rounded-xl border border-border bg-bg p-4"
                  >
                    <p className="font-mono text-[11.5px] tabular-nums text-ink-soft">
                      {new Date(entry.at).toLocaleString("ru-RU")} ·{" "}
                      {entry.posted} из {entry.total}{" "}
                      {pluralGroups(entry.total)}
                    </p>
                    <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-ink">
                      {entry.text}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </motion.section>
        </div>
      )}
    </div>
  );
}
