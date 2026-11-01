"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import { BentoCard, KpiSkeleton } from "@/components/dashboard/bento-card";
import { CountUp } from "@/components/dashboard/count-up";
import { RingProgress } from "@/components/dashboard/ring-progress";
import { Sparkline } from "@/components/dashboard/sparkline";
import { useToast } from "@/hooks/use-toast";
import {
  formatNumber,
  inventory,
  margin,
  receivables,
} from "@/lib/mock-data";

/* ── Главный KPI: остаток склада (2 колонки) ─────────────────── */

export function InventoryCard({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <BentoCard loading className="sm:col-span-2 lg:col-span-2" skeleton={<KpiSkeleton />} />
    );
  }

  const fillPct = Math.min((inventory.totalKg / inventory.capacityKg) * 100, 100);
  const thresholdPct = (inventory.thresholdKg / inventory.capacityKg) * 100;
  const headroomKg = inventory.totalKg - inventory.thresholdKg;

  return (
    <BentoCard className="sm:col-span-2 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Остаток склада</h3>
        <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
          7 дней
        </span>
      </div>

      {/* Крупная цифра — моно, вправо */}
      <p className="mt-3 text-right font-mono text-4xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={inventory.totalKg} />
        <span className="ml-1.5 text-xl text-ink-soft">кг</span>
      </p>
      <p className="mt-1 text-right text-sm text-ink-soft">
        <span className="font-mono tabular-nums">{formatNumber(inventory.packs)}</span> упаковок
      </p>

      <div className="mt-4">
        <Sparkline data={inventory.history} />
      </div>

      {/* Прогресс до порога «Пора заказывать» */}
      <div className="mt-4">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-tint">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${fillPct}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20, delay: 0.15 }}
          />
          <div
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-ink"
            style={{ left: `${thresholdPct}%` }}
            title={`Порог: ${inventory.thresholdKg} кг`}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-soft">
          <span>
            Порог «Пора заказывать»:{" "}
            <span className="font-mono text-ink tabular-nums">{inventory.thresholdKg} кг</span>
          </span>
          <span className="font-mono tabular-nums">
            запас {formatNumber(headroomKg)} кг
          </span>
        </div>
      </div>
    </BentoCard>
  );
}

/* ── KPI: дебиторка (кликабельная → /debts) ──────────────────── */

export function DebtsCard({ loading }: { loading: boolean }) {
  const { toast } = useToast();

  if (loading) {
    return <BentoCard loading skeleton={<KpiSkeleton />} />;
  }

  return (
    <BentoCard
      onClick={() =>
        toast({
          title: "Долги",
          description: "Раздел /debts в разработке — появится в следующих задачах.",
          duration: 3200,
        })
      }
      srLabel="Перейти в раздел «Долги»"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Дебиторка</h3>
        <ArrowUpRight className="size-4 text-accent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="mt-3 text-right font-mono text-2xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={receivables.amount} />
        <span className="ml-1 text-sm text-ink-soft">₽</span>
      </p>
      <p className="mt-1.5 text-right text-sm text-ink-soft">
        <span className="font-mono tabular-nums">{receivables.debtors}</span> должников, старший —{" "}
        <span className="font-mono tabular-nums">{receivables.oldestDays}</span> дней
      </p>
    </BentoCard>
  );
}

/* ── KPI: задачи на сегодня (кликабельная → /calls) ──────────── */

export function TasksCard({
  loading,
  done,
  total,
  calls,
  debts,
}: {
  loading: boolean;
  done: number;
  total: number;
  calls: number;
  debts: number;
}) {
  const { toast } = useToast();

  if (loading) {
    return <BentoCard loading skeleton={<KpiSkeleton />} />;
  }

  return (
    <BentoCard
      onClick={() =>
        toast({
          title: "Звонки",
          description: "Раздел /calls в разработке — появится в следующих задачах.",
          duration: 3200,
        })
      }
      srLabel="Перейти в раздел «Звонки»"
    >
      <h3 className="text-sm font-medium text-ink-soft">Задачи на сегодня</h3>

      <div className="mt-4 flex items-center gap-4">
        <RingProgress
          value={done}
          max={total}
          size={64}
          label={
            <span>
              {done}
              <span className="text-ink-soft">/{total}</span>
            </span>
          }
        />
        <div className="min-w-0 flex-1 text-right">
          <p className="text-sm text-ink">
            <span className="font-mono font-semibold text-ink tabular-nums">{calls}</span>{" "}
            <span className="text-ink-soft">перезвонов</span>
          </p>
          <p className="mt-1 text-sm">
            <span className="font-mono font-semibold text-ink tabular-nums">{debts}</span>{" "}
            <span className="text-ink-soft">долга</span>
          </p>
        </div>
      </div>
    </BentoCard>
  );
}

/* ── KPI: маржа за месяц ─────────────────────────────────────── */

export function MarginCard({ loading }: { loading: boolean }) {
  if (loading) {
    return <BentoCard loading className="sm:col-span-1 lg:col-span-2" skeleton={<KpiSkeleton />} />;
  }

  return (
    <BentoCard className="sm:col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Маржа за месяц</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          ▲ <span className="font-mono tabular-nums">{margin.changePct.toLocaleString("ru-RU")}%</span>
        </span>
      </div>

      <p className="mt-3 text-right font-mono text-2xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={margin.amount} />
        <span className="ml-1 text-sm text-ink-soft">₽</span>
      </p>

      <div className="mt-4">
        <Sparkline data={margin.history} />
      </div>
      <p className="mt-2 text-right text-[11px] text-ink-soft">по дням, тыс. ₽</p>
    </BentoCard>
  );
}
