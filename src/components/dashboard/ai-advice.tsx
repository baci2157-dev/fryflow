"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RotateCw, Send, Sparkles } from "lucide-react";
import { format } from "date-fns";

import { BentoCard, Sk } from "@/components/dashboard/bento-card";
import { useAdviceStore } from "@/lib/advice-store";
import { ADVICE_CATEGORY_LABEL } from "@/lib/ai-prompts";
import { generateAdvice } from "@/lib/ai-triggers";
import { aiAdvices } from "@/lib/mock-data";
import { useUiStore } from "@/lib/ui-store";

/**
 * Виджет «Совет от ИИ» (на всю ширину).
 *
 * Показывает последний совет движка триггеров (или кнопки
 * «Обновить»): живые цифры → вывод → действие. Критичный совет
 * помечен бейджем «Критично», отправленный владельцу в Telegram —
 * «Отправлено в Telegram». Ротация тем — банк из 20 промптов.
 */
export function AiAdviceCard({ loading }: { loading: boolean }) {
  const advice = useAdviceStore((s) => s.last);
  const generating = useAdviceStore((s) => s.generating);
  const adviceTick = useUiStore((s) => s.adviceTick);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // только очистка таймера при размонтировании
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  /* Первый запуск: совета ещё нет — генерируем молча, чтобы виджет
   * жил с первой минуты (движок сам пришёл бы через минуту). */
  useEffect(() => {
    if (!loading && !advice && !generating) {
      void generateAdvice({ manual: true });
    }
  }, [loading, advice, generating]);

  /* Командная палитра: «Обновить совет ИИ» (adviceTick). */
  useEffect(() => {
    if (adviceTick === 0) return;
    void generateAdvice({ manual: true });
  }, [adviceTick]);

  const handleRefresh = () => {
    void generateAdvice({ manual: true });
    setSpinning(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSpinning(false), 900);
  };

  if (loading) {
    return (
      <BentoCard
        loading
        className="sm:col-span-2 lg:col-span-4"
        skeleton={
          <div className="flex items-center gap-4">
            <Sk className="size-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Sk className="h-3 w-20" />
              <Sk className="h-4 w-3/4" />
            </div>
            <Sk className="h-9 w-28" />
          </div>
        }
      />
    );
  }

  const text = advice?.text ?? aiAdvices[0];
  const time =
    advice && new Date(advice.createdAt).getFullYear() > 2000
      ? format(new Date(advice.createdAt), "HH:mm")
      : null;

  return (
    <BentoCard className="sm:col-span-2 lg:col-span-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Sparkles className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Заголовок: категория ротации и время обновления */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
              Совет от ИИ
            </p>
            {advice?.category && (
              <span className="rounded-full bg-tint px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                {ADVICE_CATEGORY_LABEL[advice.category]}
              </span>
            )}
            {advice?.critical && (
              <span className="inline-flex items-center gap-1 rounded-full bg-tier-red/12 px-2 py-0.5 text-[10.5px] font-semibold text-tier-red">
                <AlertTriangle className="size-3" />
                Критично
              </span>
            )}
            {advice?.sentToTelegram && (
              <span className="inline-flex items-center gap-1 rounded-full bg-tier-green/12 px-2 py-0.5 text-[10.5px] font-semibold text-tier-green">
                <Send className="size-3" />
                Отправлено в Telegram
              </span>
            )}
            {time && (
              <span className="font-mono text-[10.5px] tabular-nums text-ink-soft/70">
                {time}
              </span>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={advice?.createdAt ?? "stub"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="mt-1 text-sm leading-relaxed text-ink"
            >
              {text}
            </motion.p>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={generating}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          <motion.span
            animate={{ rotate: spinning || generating ? 360 : 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
            className="flex"
          >
            <RotateCw className="size-4" />
          </motion.span>
          Обновить
        </button>
      </div>
    </BentoCard>
  );
}
