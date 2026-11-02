"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { motion } from "framer-motion";
import { Check, Clock, Phone, PhoneOff, X } from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { logCall as logCallQ } from "@/lib/queries";
import type { CallResult, Client } from "@/types/models";

/**
 * Модалка «Результат звонка» — фиксация за 2 касания:
 * выбрать статус → «Сохранить». Bottom Sheet на мобильных,
 * диалог на десктопе (spring-анимации — SpringSheet).
 *
 * Сброс состояния при смене клиента — через key={client.id}
 * у родителя (remount), без setState-в-effect.
 */

const MS_DAY = 86_400_000;
const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

interface ResultOption {
  id: CallResult;
  label: string;
  hint: string;
  icon: typeof Check;
  /** CSS-цвет: green / amber / red / серый. */
  color: string;
}

const RESULT_OPTIONS: ResultOption[] = [
  {
    id: "trial",
    label: "Согласился на пробу",
    hint: "2,5 кг за 350 ₽ · в маршрут на завтра",
    icon: Check,
    color: "var(--tier-green)",
  },
  {
    id: "callback",
    label: "Перезвонить позже",
    hint: "Назначим дату",
    icon: Clock,
    color: "var(--accent)",
  },
  {
    id: "refused",
    label: "Отказ",
    hint: "Убрать из активного пула",
    icon: X,
    color: "var(--tier-red)",
  },
  {
    id: "no_answer",
    label: "Недозвон",
    hint: "Увеличим счётчик попыток",
    icon: PhoneOff,
    color: "var(--ink-soft)",
  },
];

export function CallResultSheet({
  client,
  open,
  onClose,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
}) {
  const calls = useCrmStore((s) => s.calls);
  /* Сервисный слой: журнал звонков синхронизируется с базой (Supabase). */
  const addCall = logCallQ;
  const { toast } = useToast();

  const clientCalls = useMemo(
    () =>
      calls
        .filter((c) => c.clientId === client.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [calls, client.id]
  );

  // Предыдущий комментарий подставляем как черновик.
  const [result, setResult] = useState<CallResult | null>(null);
  const [comment, setComment] = useState(
    () => clientCalls.find((c) => c.comment)?.comment ?? ""
  );
  const [callbackDate, setCallbackDate] = useState(() =>
    isoDay(new Date(Date.now() + MS_DAY))
  );

  const nextAttempt = clientCalls.length + 1;

  /** Быстрые даты перезвона: сегодня / завтра / +3 дня / +неделя. */
  const quickDates = useMemo(() => {
    const now = new Date();
    const mk = (label: string, offsetDays: number) => ({
      label,
      value: isoDay(new Date(now.getTime() + offsetDays * MS_DAY)),
    });
    return [
      mk("Сегодня", 0),
      mk("Завтра", 1),
      mk("Через 3 дня", 3),
      mk("Через неделю", 7),
    ];
  }, []);

  const telHref = client.phone
    ? `tel:${client.phone.replace(/[^+\d]/g, "")}`
    : undefined;

  const save = () => {
    if (!result) return;
    const { addedToRoute } = addCall({
      clientId: client.id,
      result,
      comment: comment.trim(),
      callbackDate: result === "callback" ? callbackDate : undefined,
    });

    const titles: Record<CallResult, string> = {
      trial: "Проба согласована!",
      callback: `Перезвоним ${format(new Date(callbackDate), "d MMMM", { locale: ru })}`,
      refused: "Отказ записан",
      no_answer: "Недозвон",
    };
    const descriptions: Record<CallResult, string> = {
      trial: addedToRoute
        ? "«" + client.name + "» — проба 2,5 кг уже в маршруте на завтра (экран «Маршрут»)."
        : "«" + client.name + "» и так в маршруте — статус обновлён на «Проба».",
      callback:
        "«" + client.name + "» появится в «Плане на сегодня» в этот день.",
      refused:
        "«" + client.name + "» убрали из активного пула. Вернёмся через квартал.",
      no_answer: `Попытка №${nextAttempt} записана. Попробуйте в другое время.`,
    };

    toast({
      title: titles[result],
      description: descriptions[result],
      duration: 3600,
    });
    onClose();
  };

  return (
    <SpringSheet
      open={open}
      onClose={onClose}
      variant="dialog"
      title={
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          <span>Результат звонка</span>
          <span className="text-[13px] font-medium text-ink-soft">
            {client.name}
          </span>
        </span>
      }
    >
      {/* Кто и куда звоним */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-tint/60 px-4 py-3">
        {client.phone ? (
          <a
            href={telHref}
            className="inline-flex items-center gap-2 font-mono text-[17px] font-medium text-ink hover:text-accent"
          >
            <Phone className="size-4 text-accent" />
            {client.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
            <PhoneOff className="size-4" />
            Телефон не указан
          </span>
        )}
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          попытка №{nextAttempt}
        </span>
      </div>

      {/* 4 крупных статуса */}
      <div className="mt-4 grid grid-cols-2 gap-2.5" role="group" aria-label="Итог звонка">
        {RESULT_OPTIONS.map((opt) => {
          const active = result === opt.id;
          const Icon = opt.icon;
          return (
            <motion.button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => setResult(opt.id)}
              whileTap={{ scale: 0.96 }}
              animate={{ scale: active ? 1.02 : 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className="flex min-h-[76px] flex-col items-start justify-center gap-1 rounded-2xl border p-3.5 text-left transition-colors"
              style={{
                borderColor: active
                  ? `color-mix(in srgb, ${opt.color} 55%, transparent)`
                  : "var(--border)",
                background: active
                  ? `color-mix(in srgb, ${opt.color} 13%, transparent)`
                  : "var(--surface)",
              }}
            >
              <span
                className="flex size-8 items-center justify-center rounded-full"
                style={{
                  color: opt.color,
                  background: `color-mix(in srgb, ${opt.color} 14%, transparent)`,
                }}
              >
                <Icon className="size-[18px]" strokeWidth={2.5} />
              </span>
              <span className="text-[14px] font-semibold leading-tight text-ink">
                {opt.label}
              </span>
              <span className="text-[11.5px] leading-tight text-ink-soft">
                {opt.hint}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Мини-календарь перезвона */}
      {result === "callback" && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="overflow-hidden"
        >
          <div className="mt-3 rounded-2xl border border-border p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Когда перезвонить
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {quickDates.map((d) => {
                const active = callbackDate === d.value;
                return (
                  <button
                    key={d.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCallbackDate(d.value)}
                    className={
                      active
                        ? "inline-flex h-10 items-center rounded-full border border-accent bg-accent/15 px-3.5 text-[13px] font-semibold text-ink"
                        : "inline-flex h-10 items-center rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-tint hover:text-ink"
                    }
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink-soft">
              Или выберите дату
              <input
                type="date"
                value={callbackDate}
                min={isoDay(new Date())}
                onChange={(e) => setCallbackDate(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink focus:border-accent/50 focus:outline-none"
              />
            </label>
          </div>
        </motion.div>
      )}

      {/* Комментарий */}
      <label className="mt-3 block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Комментарий (необязательно)
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="С кем говорили, о чём договорились…"
          rows={2}
          className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-soft/70 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>

      {/* Сохранить */}
      <button
        type="button"
        onClick={save}
        disabled={!result}
        className={
          result
            ? "mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.99]"
            : "mt-4 inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-tint text-[15px] font-semibold text-ink-soft/60"
        }
      >
        <Check className="size-[18px]" strokeWidth={2.6} />
        Сохранить
      </button>
      <p className="mt-2 text-center text-[11.5px] text-ink-soft">
        Статус воронки обновится автоматически
      </p>
    </SpringSheet>
  );
}
