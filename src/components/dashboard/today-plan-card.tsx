"use client";

import { CheckCircle2, Phone, Wallet } from "lucide-react";

import { BentoCard, Sk } from "@/components/dashboard/bento-card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Task } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/**
 * «План на сегодня»: задачи с чекбоксами.
 * Если всё выполнено (или список пуст) — empty state.
 */
export function TodayPlanCard({
  loading,
  tasks,
  onToggle,
}: {
  loading: boolean;
  tasks: Task[];
  onToggle: (id: string) => void;
}) {
  const done = tasks.filter((t) => t.done).length;
  const allDone = tasks.length > 0 && done === tasks.length;
  const empty = tasks.length === 0;

  if (loading) {
    return (
      <BentoCard
        loading
        className="sm:col-span-1 lg:col-span-2"
        skeleton={
          <div className="space-y-2.5">
            <Sk className="h-3.5 w-28" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Sk key={i} className="h-8 w-full" />
            ))}
          </div>
        }
      />
    );
  }

  return (
    <BentoCard className="sm:col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">План на сегодня</h3>
        <span className="font-mono text-xs text-ink-soft tabular-nums">
          {done}/{tasks.length}
        </span>
      </div>

      {empty || allDone ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-8 text-accent" strokeWidth={1.8} />
          <p className="text-sm font-medium text-ink">
            {empty ? "Задач на сегодня нет" : "План на сегодня выполнен"}
          </p>
          <p className="max-w-52 text-xs leading-relaxed text-ink-soft">
            {empty
              ? "Хороший день, чтобы продать пару фритюров"
              : "Отличная работа — можно выдохнуть"}
          </p>
        </div>
      ) : (
        <ul className="fryflow-scroll mt-2 max-h-64 overflow-y-auto pr-1">
          {tasks.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-tint">
                <Checkbox
                  checked={t.done}
                  onCheckedChange={() => onToggle(t.id)}
                  aria-label={`Отметить: ${t.title}`}
                />
                <span className="w-11 shrink-0 font-mono text-xs text-ink-soft tabular-nums">
                  {t.time}
                </span>
                <span
                  className={cn(
                    "truncate text-sm text-ink",
                    t.done && "text-ink-soft/70 line-through"
                  )}
                >
                  {t.title}
                </span>
                <span className="ml-auto shrink-0 text-ink-soft/70">
                  {t.kind === "call" ? (
                    <Phone className="size-3.5" />
                  ) : (
                    <Wallet className="size-3.5" />
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}
