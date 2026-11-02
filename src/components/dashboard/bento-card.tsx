"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

/** Блок-заглушка skeleton-shimmer. */
export function Sk({ className }: { className?: string }) {
  return (
    <div
      className={cn("fryflow-skeleton h-4 w-2/3", className)}
      aria-hidden="true"
    />
  );
}

/**
 * Карточка Bento-сетки: рамка, фон, паддинг 20px и skeleton-состояние.
 * Появление — мягкий spring (fade + подъём).
 * Проп onClick добавляет «растянутую» кнопку на всю карточку.
 */
export function BentoCard({
  className,
  loading = false,
  skeleton,
  delay = 0,
  onClick,
  srLabel,
  children,
}: {
  className?: string;
  loading?: boolean;
  skeleton?: React.ReactNode;
  delay?: number;
  onClick?: () => void;
  srLabel?: string;
  /** В loading-режиме карточка показывает skeleton — children не нужны. */
  children?: React.ReactNode;
}) {
  if (loading) {
    return (
      <section
        className={cn(
          "rounded-xl border border-border bg-surface p-5",
          className
        )}
        aria-busy="true"
        aria-label="Загрузка…"
      >
        {skeleton}
      </section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24, delay }}
      className={cn(
        "relative rounded-xl border border-border bg-surface p-5",
        onClick && "group cursor-pointer transition-colors hover:border-accent/60",
        className
      )}
    >
      {children}
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="sr-only">{srLabel ?? "Открыть раздел"}</span>
        </button>
      )}
    </motion.section>
  );
}

/** Скелетон типичной KPI-карточки. */
export function KpiSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <Sk className="h-3.5 w-24" />
        <Sk className="h-3.5 w-10" />
      </div>
      <Sk className="ml-auto h-9 w-28" />
      <Sk className="ml-auto h-3 w-24" />
      <Sk className="mt-2 h-10 w-full" />
    </div>
  );
}
