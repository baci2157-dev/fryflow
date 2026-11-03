"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarClock, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { BentoCard, Sk } from "@/components/dashboard/bento-card";
import {
  callbacksSummary,
  collectCallbacks,
} from "@/lib/callbacks";
import { useCrmStore } from "@/lib/clients-store";

/**
 * Виджет «Перезвоны» для дашборда (задача 24): сегодня/завтра с числом,
 * просроченные — красным. Тап — в «Календарь перезвонов» (неделя вперёд).
 */
export function CallbacksWidget({ loading }: { loading: boolean }) {
  const router = useRouter();
  const clients = useCrmStore((s) => s.clients);
  const calls = useCrmStore((s) => s.calls);

  const { summary, next } = useMemo(() => {
    const items = collectCallbacks(clients, calls);
    const upcoming = items.find((i) => !i.overdue);
    return { summary: callbacksSummary(items), next: upcoming ?? null };
  }, [clients, calls]);

  const goCalendar = () => router.push("/callbacks");

  return (
    <BentoCard
      loading={loading}
      className="sm:col-span-1 lg:col-span-2"
      skeleton={
        <div className="space-y-2.5">
          <Sk className="h-3.5 w-32" />
          <Sk className="h-8 w-full" />
          <Sk className="h-8 w-2/3" />
        </div>
      }
    >
      <button
        type="button"
        onClick={goCalendar}
        className="group -m-1 w-full rounded-xl p-1 text-left transition-colors hover:bg-tint/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <CalendarClock className="size-4 text-accent" />
            Перезвоны
          </h3>
          <span className="flex items-center gap-0.5 text-xs font-medium text-ink-soft transition-colors group-hover:text-accent">
            Календарь
            <ChevronRight className="size-3.5" />
          </span>
        </div>

        <div className="mt-2.5 flex items-end gap-4">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-mono text-3xl font-bold tabular-nums leading-none text-ink"
              style={summary.overdueCount > 0 ? { color: "var(--tier-red)" } : undefined}
            >
              {summary.todayCount}
            </span>
            <span className="text-xs text-ink-soft">на сегодня</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-semibold tabular-nums leading-none text-ink-soft">
              {summary.tomorrowCount}
            </span>
            <span className="text-xs text-ink-soft">на завтра</span>
          </div>
          {summary.overdueCount > 0 && (
            <span className="ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: "var(--tier-red)" }}>
              {summary.overdueCount} просрочено
            </span>
          )}
        </div>

        <p className="mt-2 truncate text-xs text-ink-soft">
          {next
            ? `Ближний: ${next.clientName} — ${format(
                new Date(`${next.date}T00:00:00`),
                "d MMMM",
                { locale: ru }
              )}`
            : summary.weekCount === 0
              ? "Записывайте «Перезвонить позже» — даты появятся здесь"
              : "Все перезвоны позади"}
        </p>
      </button>
    </BentoCard>
  );
}
