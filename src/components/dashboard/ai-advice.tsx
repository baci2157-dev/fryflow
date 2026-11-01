"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCw, Sparkles } from "lucide-react";

import { BentoCard, Sk } from "@/components/dashboard/bento-card";
import { aiAdvices } from "@/lib/mock-data";
import { useUiStore } from "@/lib/ui-store";

/**
 * Виджет «Совет от ИИ» (на всю ширину).
 * Индекс совета = adviceTick из ui-store: единая точка истины —
 * кнопка ↻ и действие «Обновить совет ИИ» в командной палитре.
 */
export function AiAdviceCard({ loading }: { loading: boolean }) {
  const adviceTick = useUiStore((s) => s.adviceTick);
  const refreshAdvice = useUiStore((s) => s.refreshAdvice);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // только очистка таймера при размонтировании
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const index = adviceTick % aiAdvices.length;

  const handleRefresh = () => {
    refreshAdvice();
    setSpinning(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSpinning(false), 650);
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

  return (
    <BentoCard className="sm:col-span-2 lg:col-span-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Sparkles className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
            Совет от ИИ
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="mt-1 text-sm leading-relaxed text-ink"
            >
              {aiAdvices[index]}
            </motion.p>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <motion.span
            animate={{ rotate: spinning ? 360 : 0 }}
            transition={{ duration: 0.65, ease: "easeInOut" }}
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
