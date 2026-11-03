"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";

import { AiAdviceCard } from "@/components/dashboard/ai-advice";
import { CallbacksWidget } from "@/components/dashboard/callbacks-widget";
import { Sk } from "@/components/dashboard/bento-card";
import {
  CrossSellCard,
  DebtsCard,
  InventoryCard,
  MarginCard,
  TasksCard,
} from "@/components/dashboard/kpi-cards";
import { RecentOrdersCard } from "@/components/dashboard/recent-orders-card";
import { TodayPlanCard } from "@/components/dashboard/today-plan-card";
import { NetworkPill } from "@/components/offline/network-status";
import { useCrmStore } from "@/lib/clients-store";
import {
  debtDays,
  debtOrders,
  useOrdersStore,
} from "@/lib/orders-store";
import type { Task } from "@/lib/mock-data";
import { useSettingsStore } from "@/lib/settings-store";
import { DEBT_DANGER_DAYS } from "@/types/models";

/** Имитация загрузки данных, мс. */
const FAKE_LATENCY = 1300;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  // CRM: перезвоны на сегодня приходят из живого журнала звонков —
  // сохраняем «Перезвонить» в «Звонках» → задача появляется здесь.
  const clients = useCrmStore((s) => s.clients);
  const calls = useCrmStore((s) => s.calls);

  // Сделки: долги 15+ дней попадают в план дня автоматически.
  const orders = useOrdersStore((s) => s.orders);

  /** Отметки задач за сессию (инвертируют исходное состояние). */
  const [doneIds, setDoneIds] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), FAKE_LATENCY);
    return () => clearTimeout(t);
  }, []);

  const tasks = useMemo<Task[]>(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // Перезвоны: клиент в статусе «Перезвонить» и дата перезвона
    // уже наступила (включая просроченные — они сверху).
    const callbacks: Task[] = [];
    for (const c of clients) {
      if (c.status !== "callback") continue;
      const cb = calls
        .filter(
          (x) =>
            x.clientId === c.id &&
            x.result === "callback" &&
            x.callbackDate &&
            x.callbackDate <= todayStr
        )
        .sort((a, b) => (a.callbackDate! < b.callbackDate! ? -1 : 1))[0];
      if (!cb?.callbackDate) continue;
      callbacks.push({
        id: `cb-${c.id}`,
        time: format(new Date(`${cb.callbackDate}T00:00:00`), "d.MM"),
        title: `Перезвон: ${c.name}`,
        kind: "call",
        done: false,
        clientId: c.id,
        callbackDate: cb.callbackDate,
        overdue: cb.callbackDate < todayStr,
      });
    }
    callbacks.sort((a, b) =>
      (a.callbackDate ?? "").localeCompare(b.callbackDate ?? "")
    );

    // Долги: живые заказы без оплаты, возраст 15+ дней (красная зона).
    const debtTasks: Task[] = debtOrders(orders)
      .filter((o) => debtDays(o) >= DEBT_DANGER_DAYS)
      .map((o) => ({
        id: `debt-${o.id}`,
        time: format(new Date(o.createdAt), "d.MM"),
        title: `Долг: ${o.clientName} — ${debtDays(o)} дн.`,
        kind: "debt",
        done: false,
        overdue: true,
        href: "/debts",
      }));

    // Красные долги — первыми: день начинается с самого горячего.
    return [...debtTasks, ...callbacks].map((t) => ({
      ...t,
      done: doneIds.includes(t.id) ? !t.done : t.done,
    }));
  }, [clients, calls, orders, doneIds]);

  const toggleTask = (id: string) => {
    setDoneIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const doneCount = tasks.filter((t) => t.done).length;
  const callsCount = tasks.filter((t) => t.kind === "call").length;
  const debtsCount = tasks.filter((t) => t.kind === "debt").length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <GreetingBar loading={loading} />

      {/* Bento-сетка: 24px между карточками (gap-6), 20px внутри (p-5) */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Первая строка KPI — самое важное */}
        <InventoryCard loading={loading} />
        <DebtsCard loading={loading} />
        <TasksCard
          loading={loading}
          done={doneCount}
          total={tasks.length}
          calls={callsCount}
          debts={debtsCount}
        />

        {/* Задача 24: перезвоны на сегодня/завтра — виджет + календарь
         * (на мобильном — сразу под KPI, в первом экране). */}
        <CallbacksWidget loading={loading} />

        {/* Совет ИИ — на всю ширину */}
        <AiAdviceCard loading={loading} />

        <MarginCard loading={loading} />
        <CrossSellCard loading={loading} />
        <TodayPlanCard loading={loading} tasks={tasks} onToggle={toggleTask} />
        <RecentOrdersCard loading={loading} />
      </div>
    </div>
  );
}

/* ── Приветствие: имя, дата, Telegram-бейдж, профиль ─────────── */

function GreetingBar({ loading }: { loading: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [tgConnected, setTgConnected] = useState<boolean | null>(null);
  const router = useRouter();

  /** Имя владельца из настроек (задача 10): «Добрый день, Адам». */
  const ownerName = useSettingsStore((s) => s.owner.name).trim() || "владелец";
  const initials = ownerName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // дата/время — только после монтирования (иначе hydration mismatch);
  // через rAF, чтобы не звать setState синхронно в effect
  useEffect(() => {
    const id = requestAnimationFrame(() => setNow(new Date()));
    return () => cancelAnimationFrame(id);
  }, []);

  // Telegram-бейдж живой: спрашиваем серверный конфиг (токен
  // остаётся на сервере, клиент получает только connected).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/telegram/config")
      .then((r) => r.json())
      .then((d: { connected?: boolean }) => {
        if (!cancelled) setTgConnected(Boolean(d.connected));
      })
      .catch(() => {
        if (!cancelled) setTgConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hour = now?.getHours() ?? 14;
  const greeting =
    hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const dateStr = now?.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
      <div className="min-w-0">
        {loading ? (
          <Sk className="h-7 w-52" />
        ) : (
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {greeting}, <span className="text-accent">{ownerName}</span>
          </h1>
        )}
        {loading ? (
          <Sk className="mt-2.5 h-4 w-40" />
        ) : (
          <p className="mt-0.5 text-sm text-ink-soft capitalize">{dateStr}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Индикатор сети: зелёная точка — онлайн, красная — офлайн/N в очереди */}
        {!loading && <NetworkPill />}
        {loading ? (
          <Sk className="h-8 w-36 rounded-full" />
        ) : tgConnected ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-tier-green/30 bg-tier-green/10 px-3 py-1.5 text-xs font-medium text-tier-green">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Telegram подключён
          </span>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/settings")}
            title="Подключить Telegram: алерты и заявки клиентов"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
          >
            <Send className="size-3.5" />
            Telegram не подключён
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/settings")}
          title={`Профиль · ${ownerName}`}
          aria-label="Профиль пользователя"
          className={
            loading
              ? "hidden"
              : "flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-semibold text-ink transition-colors hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          }
        >
          {initials}
        </button>
      </div>
    </div>
  );
}
