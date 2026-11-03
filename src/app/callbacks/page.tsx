"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  AlarmClock,
  CalendarClock,
  ChevronRight,
  Phone,
  PhoneOff,
} from "lucide-react";

import {
  collectCallbacks,
  groupCallbacks,
  callbacksSummary,
} from "@/lib/callbacks";
import { useCrmStore } from "@/lib/clients-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

/**
 * «Календарь перезвонов» (задача 24).
 *
 * Неделя вперёд по дням + просроченные красным с бейджем «Просрочено».
 * Источник — живой журнал звонков: каждый «Перезвонить позже» с датой
 * попадает сюда. «Позвонить» — tel-ссылка (мобильный — сразу звонок),
 * «Результат» — карточка клиента в «Звонках» с открытой модалкой.
 */
export default function CallbacksPage() {
  const clients = useCrmStore((s) => s.clients);
  const calls = useCrmStore((s) => s.calls);
  const focusCallClient = useUiStore((s) => s.focusCallClient);

  const items = useMemo(() => collectCallbacks(clients, calls), [clients, calls]);
  const groups = useMemo(() => groupCallbacks(items), [items]);
  const summary = useMemo(() => callbacksSummary(items), [items]);

  const goResult = (clientId: string) => focusCallClient(clientId, "callback");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-end justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <CalendarClock className="size-6 text-accent" />
            Календарь перезвонов
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Неделя вперёд ·{" "}
            {summary.overdueCount > 0 ? (
              <span className="font-semibold text-[var(--tier-red)]">
                {summary.overdueCount} просрочено
              </span>
            ) : (
              "просроченных нет"
            )}
          </p>
        </div>
        <SummaryChips summary={summary} />
      </header>

      {/* ── Пустой календарь ── */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <CalendarClock className="size-8 text-ink-soft/50" />
          <p className="max-w-sm text-sm text-ink-soft">
            Перезвонов пока нет. Записывайте результат звонка как
            «Перезвонить позже» — дата попадёт в этот календарь и в утренний
            дайджест в Telegram.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2
                className={cn(
                  "flex items-center gap-2 text-sm font-semibold uppercase tracking-wide",
                  g.key === "overdue" ? "text-[var(--tier-red)]" : "text-ink-soft"
                )}
              >
                {g.key === "overdue" ? (
                  <AlarmClock className="size-4" />
                ) : (
                  <CalendarClock className="size-4" />
                )}
                {g.label}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums",
                    g.key === "overdue"
                      ? "bg-[color-mix(in_srgb,var(--tier-red)_12%,transparent)] text-[var(--tier-red)]"
                      : "bg-tint text-ink-soft"
                  )}
                >
                  {g.items.length}
                </span>
              </h2>
              <ul className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((it) => (
                  <li
                    key={it.callId}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border bg-surface p-4 pl-[22px]",
                      it.overdue ? "border-[color-mix(in_srgb,var(--tier-red)_40%,transparent)]" : "border-border"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-y-0 left-0 w-1.5",
                        it.overdue ? "bg-[var(--tier-red)]" : "bg-accent"
                      )}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight text-ink">
                        {it.clientName}
                      </p>
                      {it.overdue ? (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white"
                          style={{ background: "var(--tier-red)" }}
                        >
                          Просрочено
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                      <CalendarClock className="size-3.5 shrink-0" />
                      {format(new Date(`${it.date}T00:00:00`), "d MMMM, EEEE", {
                        locale: ru,
                      })}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {it.phone ? (
                        <a
                          href={`tel:${it.phone.replace(/[^+\d]/g, "")}`}
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent text-[13px] font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.98]"
                        >
                          <Phone className="size-4" />
                          Позвонить
                        </a>
                      ) : (
                        <span className="inline-flex h-10 cursor-default items-center justify-center gap-1.5 rounded-xl bg-tint text-[12.5px] font-medium text-ink-soft/70">
                          <PhoneOff className="size-4" />
                          Нет телефона
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => goResult(it.clientId)}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-[13px] font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
                      >
                        Результат
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryChips({
  summary,
}: {
  summary: ReturnType<typeof callbacksSummary>;
}) {
  const chips: Array<{ label: string; value: number; tone: "red" | "accent" | "soft" }> = [
    { label: "Сегодня", value: summary.todayCount, tone: "accent" },
    { label: "Завтра", value: summary.tomorrowCount, tone: "soft" },
    { label: "Просрочено", value: summary.overdueCount, tone: "red" },
    { label: "Неделя", value: summary.weekCount, tone: "soft" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold",
            c.tone === "red"
              ? "bg-[color-mix(in_srgb,var(--tier-red)_12%,transparent)] text-[var(--tier-red)]"
              : c.tone === "accent"
                ? "bg-accent/12 text-accent"
                : "bg-tint text-ink-soft"
          )}
        >
          {c.label}: <span className="font-mono tabular-nums">{c.value}</span>
        </span>
      ))}
    </div>
  );
}
