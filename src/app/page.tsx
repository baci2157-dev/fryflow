"use client";

import { useEffect, useState } from "react";

import { AiAdviceCard } from "@/components/dashboard/ai-advice";
import { Sk } from "@/components/dashboard/bento-card";
import {
  DebtsCard,
  InventoryCard,
  MarginCard,
  TasksCard,
} from "@/components/dashboard/kpi-cards";
import { RecentOrdersCard } from "@/components/dashboard/recent-orders-card";
import { TodayPlanCard } from "@/components/dashboard/today-plan-card";
import { useToast } from "@/hooks/use-toast";
import { todayTasks, type Task } from "@/lib/mock-data";

/** Имитация загрузки данных, мс. */
const FAKE_LATENCY = 1300;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>(todayTasks);
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), FAKE_LATENCY);
    return () => clearTimeout(t);
  }, []);

  const doneCount = tasks.filter((t) => t.done).length;
  const callsCount = tasks.filter((t) => t.kind === "call").length;
  const debtsCount = tasks.filter((t) => t.kind === "debt").length;

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

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

        {/* Совет ИИ — на всю ширину */}
        <AiAdviceCard loading={loading} />

        <MarginCard loading={loading} />
        <TodayPlanCard loading={loading} tasks={tasks} onToggle={toggleTask} />
        <RecentOrdersCard loading={loading} />
      </div>
    </div>
  );
}

/* ── Приветствие: имя, дата, Telegram-бейдж, профиль ─────────── */

function GreetingBar({ loading }: { loading: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const { toast } = useToast();

  // дата/время — только после монтирования (иначе hydration mismatch);
  // через rAF, чтобы не звать setState синхронно в effect
  useEffect(() => {
    const id = requestAnimationFrame(() => setNow(new Date()));
    return () => cancelAnimationFrame(id);
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
            {greeting}, <span className="text-accent">Иван</span>
          </h1>
        )}
        {loading ? (
          <Sk className="mt-2.5 h-4 w-40" />
        ) : (
          <p className="mt-0.5 text-sm text-ink-soft capitalize">{dateStr}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {loading ? (
          <Sk className="h-8 w-36 rounded-full" />
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Telegram подключён
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            toast({
              title: "Профиль",
              description: "Настройки профиля — в разделе «Настройки» (скоро).",
              duration: 3200,
            })
          }
          aria-label="Профиль пользователя"
          className={
            loading
              ? "hidden"
              : "flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-semibold text-ink transition-colors hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          }
        >
          ИВ
        </button>
      </div>
    </div>
  );
}
