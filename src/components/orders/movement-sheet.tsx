"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, Check } from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { useToast } from "@/hooks/use-toast";
import { useOrdersStore } from "@/lib/orders-store";

/**
 * Ручное движение по складу: приход (поставка) или списание
 * (брак/порча/санобработка камеры). Заказы списывают склад сами —
 * здесь только ручные корректировки.
 */

export function MovementSheet({
  open,
  type,
  onClose,
}: {
  open: boolean;
  /** 'in' — приход, 'out' — списание. */
  type: "in" | "out";
  onClose: () => void;
}) {
  const addMovement = useOrdersStore((s) => s.addMovement);
  const { toast } = useToast();

  const [packs, setPacks] = useState(10);
  const [comment, setComment] = useState("");

  const isIn = type === "in";
  const title = isIn ? "Приход: поставка" : "Списание со склада";
  const hint = isIn
    ? "Сколько упаковок привёз поставщик"
    : "Брак, разморозка, санобработка камеры…";

  const save = () => {
    if (packs < 1) return;
    addMovement(type, packs, comment);
    toast({
      title: isIn ? "Приход оформлен" : "Списание оформлено",
      description: `${new Intl.NumberFormat("ru-RU").format(packs)} уп. (${(packs * 2.5).toLocaleString("ru-RU")} кг) — ${
        isIn ? "добавлено на" : "списано с"
      } склада. Остаток пересчитан.`,
      duration: 3600,
    });
    setPacks(10);
    setComment("");
    onClose();
  };

  return (
    <SpringSheet open={open} onClose={onClose} variant="dialog" title={title}>
      <p className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-tint/60 px-4 py-3 text-[13px] text-ink-soft">
        {isIn ? (
          <ArrowDownToLine className="size-4 shrink-0 text-tier-green" />
        ) : (
          <ArrowUpFromLine className="size-4 shrink-0 text-tier-red" />
        )}
        {hint}
      </p>

      {/* Количество упаковок */}
      <div className="mt-4 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Упаковок по 2,5 кг
          </span>
          <span className="font-mono text-[12px] text-ink-soft tabular-nums">
            {(packs * 2.5).toLocaleString("ru-RU")} кг
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <motion.button
            type="button"
            aria-label="Минус одна упаковка"
            whileTap={{ scale: 0.9 }}
            onClick={() => setPacks((v) => Math.max(1, v - 1))}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-[18px] font-semibold text-ink transition-colors hover:bg-tint"
          >
            −
          </motion.button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={5000}
            value={packs}
            onChange={(e) =>
              setPacks(Math.min(5000, Math.max(1, Number(e.target.value) || 1)))
            }
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-center font-mono text-2xl font-semibold text-ink tabular-nums focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <motion.button
            type="button"
            aria-label="Плюс одна упаковка"
            whileTap={{ scale: 0.9 }}
            onClick={() => setPacks((v) => Math.min(5000, v + 1))}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-[18px] font-semibold text-ink transition-colors hover:bg-tint"
          >
            +
          </motion.button>
        </div>
        {/* Быстрые пресеты */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[10, 50, 100, 400].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPacks(n)}
              className={
                packs === n
                  ? "inline-flex h-9 items-center rounded-full border border-accent bg-accent/15 px-3.5 text-[12.5px] font-semibold text-ink"
                  : "inline-flex h-9 items-center rounded-full border border-border bg-surface px-3.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-tint hover:text-ink"
              }
            >
              {n} уп.
            </button>
          ))}
        </div>
      </div>

      {/* Комментарий */}
      <label className="mt-3 block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Комментарий
        </span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            isIn ? "Поставщик, номер накладной…" : "Причина списания…"
          }
          className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[13.5px] text-ink placeholder:text-ink-soft/70 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={packs < 1}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.99]"
      >
        <Check className="size-[18px]" strokeWidth={2.6} />
        {isIn ? "Оформить приход" : "Списать"}
      </button>
    </SpringSheet>
  );
}
