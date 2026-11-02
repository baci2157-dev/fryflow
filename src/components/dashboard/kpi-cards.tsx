"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, ShoppingBasket, TrendingUp } from "lucide-react";

import { BentoCard, KpiSkeleton } from "@/components/dashboard/bento-card";
import { CountUp } from "@/components/dashboard/count-up";
import { RingProgress } from "@/components/dashboard/ring-progress";
import {
  crossSellStats,
  debtDays,
  debtOrders,
  ordersTotal,
  stockKg,
  stockPacks,
  useOrdersStore,
} from "@/lib/orders-store";
import { formatNumber } from "@/lib/mock-data";
import {
  COST_PER_KG,
  DEBT_DANGER_DAYS,
  LOW_STOCK_KG,
  PACK_KG,
  type Order,
} from "@/types/models";

/**
 * KPI-карточки дашборда — живые данные из стора заказов:
 * склад, дебиторка, задачи, маржа. Клик ведёт в соответствующий раздел.
 */

/** Нормативный максимум запаса (100% прогресс-бара), кг. */
const CAPACITY_KG = 4000;

/* ── Главный KPI: остаток склада (2 колонки) ─────────────────── */

export function InventoryCard({ loading }: { loading: boolean }) {
  const router = useRouter();
  const movements = useOrdersStore((s) => s.movements);

  const kg = stockKg(movements);
  const packs = stockPacks(movements);

  const fillPct = Math.min((kg / CAPACITY_KG) * 100, 100);
  const thresholdPct = (LOW_STOCK_KG / CAPACITY_KG) * 100;
  const headroomKg = Math.round(kg - LOW_STOCK_KG);
  const lowStock = kg < LOW_STOCK_KG;

  if (loading) {
    return (
      <BentoCard loading className="sm:col-span-2 lg:col-span-2" skeleton={<KpiSkeleton />} />
    );
  }

  return (
    <BentoCard
      className="sm:col-span-2 lg:col-span-2"
      onClick={() => router.push("/warehouse")}
      srLabel="Перейти в раздел «Склад»"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Остаток склада</h3>
        <span className="relative z-20 rounded-full bg-tint px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
          авто-пересчёт
        </span>
      </div>

      {/* Крупная цифра — моно, вправо */}
      <p className="mt-3 text-right font-mono text-4xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={kg} />
        <span className="ml-1.5 text-xl text-ink-soft">кг</span>
      </p>
      <p className="mt-1 text-right text-sm text-ink-soft">
        <span className="font-mono tabular-nums">{formatNumber(packs)}</span> упаковок
      </p>

      {/* Прогресс до порога «Пора заказывать» */}
      <div className="relative z-20 mt-4">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-tint">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: lowStock ? "var(--tier-red)" : "var(--accent)" }}
            initial={{ width: 0 }}
            animate={{ width: `${fillPct}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20, delay: 0.15 }}
          />
          <div
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-ink"
            style={{ left: `${thresholdPct}%` }}
            title={`Порог: ${LOW_STOCK_KG} кг`}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-soft">
          <span>
            Порог «Пора заказывать»:{" "}
            <span className="font-mono text-ink tabular-nums">{LOW_STOCK_KG} кг</span>
          </span>
          <span className="font-mono tabular-nums">
            {headroomKg >= 0 ? "запас" : "ниже порога на"}{" "}
            {formatNumber(Math.abs(headroomKg))} кг
          </span>
        </div>
      </div>
    </BentoCard>
  );
}

/* ── KPI: дебиторка (кликабельная → /debts) ──────────────────── */

export function DebtsCard({ loading }: { loading: boolean }) {
  const router = useRouter();
  const orders = useOrdersStore((s) => s.orders);

  const debts = debtOrders(orders);
  const amount = ordersTotal(debts);
  const debtors = debts.length;
  const oldestDays = debts.length ? debtDays(debts[0]) : 0;
  const overdue15 = debts.filter((o) => debtDays(o) >= DEBT_DANGER_DAYS).length;

  if (loading) {
    return <BentoCard loading skeleton={<KpiSkeleton />} />;
  }

  return (
    <BentoCard
      onClick={() => router.push("/debts")}
      srLabel="Перейти в раздел «Долги»"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Дебиторка</h3>
        <ArrowUpRight className="size-4 text-accent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="mt-3 text-right font-mono text-2xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={amount} />
        <span className="ml-1 text-sm text-ink-soft">₽</span>
      </p>
      <p className="mt-1.5 text-right text-sm text-ink-soft">
        <span className="font-mono tabular-nums">{debtors}</span> должников, старший —{" "}
        <span className="font-mono tabular-nums">{oldestDays}</span> дн.
      </p>
      {overdue15 > 0 && (
        <p className="mt-1.5 text-right text-[11.5px] font-semibold text-tier-red">
          {overdue15} просрочка 15+ — звонить сегодня
        </p>
      )}
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
  const router = useRouter();

  if (loading) {
    return <BentoCard loading skeleton={<KpiSkeleton />} />;
  }

  return (
    <BentoCard
      onClick={() => router.push("/calls")}
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

/* ── KPI: маржа за месяц (реальные заказы) ───────────────────── */

/** Маржа заказа: сумма − себестоимость (100 ₽/кг × вес). */
export function orderMargin(order: Order): number {
  return Math.round(order.totalAmount - order.boxesCount * PACK_KG * COST_PER_KG);
}

export function MarginCard({ loading }: { loading: boolean }) {
  const orders = useOrdersStore((s) => s.orders);

  const stats = useMemo(() => {
    const now = Date.now();
    const month = orders.filter(
      (o) => !o.isDraft && now - new Date(o.createdAt).getTime() <= 30 * 86_400_000
    );
    const revenue = ordersTotal(month);
    const cost = month.reduce(
      (sum, o) => sum + o.boxesCount * PACK_KG * COST_PER_KG,
      0
    );
    return {
      count: month.length,
      revenue,
      cost,
      margin: revenue - cost,
    };
  }, [orders]);

  if (loading) {
    return <BentoCard loading className="sm:col-span-1 lg:col-span-2" skeleton={<KpiSkeleton />} />;
  }

  const marginPct = stats.revenue > 0
    ? Math.round((stats.margin / stats.revenue) * 100)
    : 0;

  return (
    <BentoCard className="sm:col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Маржа за 30 дней</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <TrendingUp className="size-3" />
          <span className="font-mono tabular-nums">{stats.count}</span> заказов
        </span>
      </div>

      <p className="mt-3 text-right font-mono text-2xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={stats.margin} />
        <span className="ml-1 text-sm text-ink-soft">₽</span>
      </p>
      <p className="mt-1 text-right text-[11px] text-ink-soft">
        маржинальность{" "}
        <span className="font-mono font-semibold text-ink tabular-nums">
          {marginPct}%
        </span>{" "}
        · себестоимость 100 ₽/кг
      </p>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-ink-soft">Выручка</span>
          <span className="font-mono text-ink tabular-nums">
            {formatNumber(stats.revenue)} ₽
          </span>
        </div>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-ink-soft">Себестоимость</span>
          <span className="font-mono text-ink tabular-nums">
            −{formatNumber(stats.cost)} ₽
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-[13px] font-semibold">
          <span className="text-ink">Маржа</span>
          <span className="font-mono text-accent tabular-nums">
            {formatNumber(stats.margin)} ₽
          </span>
        </div>
      </div>
    </BentoCard>
  );
}


/* ── KPI: попутные продажи (задача 9) ───────────────────────── */

export function CrossSellCard({ loading }: { loading: boolean }) {
  const router = useRouter();
  const orders = useOrdersStore((s) => s.orders);

  const { sum, ordersWithItems } = crossSellStats(orders);

  if (loading) {
    return <BentoCard loading skeleton={<KpiSkeleton />} />;
  }

  return (
    <BentoCard
      onClick={() => router.push("/catalog")}
      srLabel="Перейти в каталог попутных товаров"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-soft">Попутные продажи</h3>
        <ShoppingBasket className="relative z-20 size-4 text-accent" />
      </div>

      <p className="mt-3 text-right font-mono text-3xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={sum} />
        <span className="ml-1.5 text-lg text-ink-soft">₽</span>
      </p>
      <p className="mt-1 text-right text-sm text-ink-soft">
        за 30 дней · <span className="font-mono tabular-nums">{ordersWithItems}</span>{" "}
        {ordersWithItems === 1 ? "заказ" : "заказа"} с товарами
      </p>

      <p className="mt-3 border-t border-border/70 pt-2.5 text-[11.5px] leading-snug text-ink-soft">
        Масло, соусы, зелень к фри — та же машина, маржа выше
      </p>
    </BentoCard>
  );
}
