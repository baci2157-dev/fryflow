"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Minus,
  Plus,
  ShoppingCart,
  Snowflake,
  Warehouse,
} from "lucide-react";

import { MovementSheet } from "@/components/orders/movement-sheet";
import { useOrdersStore } from "@/lib/orders-store";
import {
  LOW_STOCK_KG,
  MOVEMENT_LABEL,
  type InventoryMovement,
  type MovementType,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Склад» — остаток считается сам: сумма всех движений
 * (приход − списания − заказы). Владелец видит кольцо с остатком
 * и журнал, порядок заказа у поставщика подсказывает баннер.
 *
 * Цвет кольца: зелёный >1000 кг, оранжевый 500–1000, красный <500.
 */

/** Нормативный максимум для кольца (полный склад), кг. */
const CAPACITY_KG = 4000;

const MOVEMENT_ICON: Record<MovementType, typeof Plus> = {
  in: ArrowDownToLine,
  out: ArrowUpFromLine,
  order: ShoppingCart,
};

const MOVEMENT_COLOR: Record<MovementType, string> = {
  in: "var(--tier-green)",
  out: "var(--tier-red)",
  order: "var(--accent)",
};

export default function WarehousePage() {
  const movements = useOrdersStore((s) => s.movements);
  const [sheet, setSheet] = useState<"in" | "out" | null>(null);

  const kg = useMemo(
    () =>
      Math.round(
        movements.reduce(
          (sum, m) => sum + (m.type === "in" ? m.quantityKg : -m.quantityKg),
          0
        ) * 10
      ) / 10,
    [movements]
  );
  const packs = useMemo(
    () =>
      movements.reduce(
        (sum, m) => sum + (m.type === "in" ? m.quantityPacks : -m.quantityPacks),
        0
      ),
    [movements]
  );

  const ringColor =
    kg > 1000
      ? "var(--tier-green)"
      : kg >= LOW_STOCK_KG
        ? "var(--status-callback)"
        : "var(--tier-red)";
  const lowStock = kg < LOW_STOCK_KG;

  /* Статистика по типам движений. */
  const stats = useMemo(() => {
    const acc = { in: 0, out: 0, order: 0 } as Record<MovementType, number>;
    for (const m of movements) acc[m.type] += m.quantityPacks;
    return acc;
  }, [movements]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Warehouse className="size-6 text-accent" />
            Склад
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Картофель фри 2,5 кг · списание по заказам — автоматически
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSheet("out")}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-tier-red/40 hover:bg-tier-red/10"
          >
            <Minus className="size-4 text-tier-red" strokeWidth={2.6} />
            Списание
          </button>
          <button
            type="button"
            onClick={() => setSheet("in")}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            <Plus className="size-4" strokeWidth={2.6} />
            Приход
          </button>
        </div>
      </header>

      {/* ── Баннер «Пора заказывать» ── */}
      {lowStock && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="flex items-start gap-3 rounded-2xl border border-tier-red/35 bg-tier-red/[0.08] px-5 py-4"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-tier-red" />
          <div>
            <p className="text-[14px] font-semibold text-ink">
              Пора заказывать у поставщика
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
              Остаток ниже {LOW_STOCK_KG} кг ({(LOW_STOCK_KG / 2.5).toFixed(0)} уп.). При
              средней продаже 60 уп./день закончится через{" "}
              {Math.max(1, Math.floor(packs / 60))} дн.
            </p>
            <button
              type="button"
              onClick={() => setSheet("in")}
              className="mt-2 text-[13px] font-semibold text-tier-red hover:underline"
            >
              Оформить приход →
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Главная карточка: кольцо остатка ── */}
      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col items-center rounded-2xl border border-border bg-surface p-6 lg:col-span-1">
          <BigRing
            value={Math.max(kg, 0)}
            max={CAPACITY_KG}
            color={ringColor}
            center={
              <>
                <span className="font-mono text-[34px] font-semibold leading-none text-ink tabular-nums">
                  {new Intl.NumberFormat("ru-RU").format(kg)}
                </span>
                <span className="mt-1 text-[13px] text-ink-soft">кг</span>
              </>
            }
          />
          <p className="mt-4 text-[14px] text-ink-soft">
            <span className="font-mono font-semibold text-ink tabular-nums">
              {new Intl.NumberFormat("ru-RU").format(packs)}
            </span>{" "}
            упаковок по 2,5 кг
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-soft">
            <Snowflake className="size-3.5 text-accent" />
            мороженое хранилище, −18 °C
          </p>
        </div>

        {/* Мини-статистика движений */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2">
          {(
            [
              { type: "in" as const, label: "Приход", detail: "поставки на склад" },
              { type: "order" as const, label: "По заказам", detail: "отгружено клиентам" },
              { type: "out" as const, label: "Списания", detail: "брак и порча" },
            ]
          ).map(({ type, label, detail }) => {
            const Icon = MOVEMENT_ICON[type];
            return (
              <div
                key={type}
                className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-9 items-center justify-center rounded-full"
                    style={{
                      color: MOVEMENT_COLOR[type],
                      background: `color-mix(in srgb, ${MOVEMENT_COLOR[type]} 12%, transparent)`,
                    }}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="text-[13px] font-semibold text-ink">
                    {label}
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-right font-mono text-2xl font-semibold text-ink tabular-nums">
                    {new Intl.NumberFormat("ru-RU").format(stats[type])}
                    <span className="ml-1 text-sm text-ink-soft">уп.</span>
                  </p>
                  <p className="mt-0.5 text-right text-[11.5px] text-ink-soft">
                    {detail}
                  </p>
                </div>
              </div>
            );
          })}
          <p className="col-span-full rounded-xl bg-tint/60 px-4 py-2.5 text-[12px] leading-snug text-ink-soft">
            Заказ автоматически списывает склад — movements с типом «По заказу».
            Порог «Пора заказывать»:{" "}
            <span className="font-mono text-ink tabular-nums">{LOW_STOCK_KG} кг</span>.
          </p>
        </div>
      </section>

      {/* ── Журнал движений ── */}
      <section className="mt-6">
        <h2 className="text-[15px] font-semibold text-ink">Журнал движений</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">
          {movements.length} записей · свежие сверху
        </p>

        {movements.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
            <Warehouse className="size-8 text-ink-soft/50" />
            <p className="text-sm text-ink-soft">
              Движений пока нет — оформите приход.
            </p>
          </div>
        ) : (
          <>
            {/* Десктоп: таблица */}
            <div className="mt-3 hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-tint/50 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    <th className="py-2.5 pl-5 pr-3">Дата</th>
                    <th className="py-2.5 pr-3">Тип</th>
                    <th className="py-2.5 pr-3 text-right">Количество</th>
                    <th className="py-2.5 pr-5">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <MovementRow key={m.id} movement={m} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Мобильные: карточки */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:hidden">
              {movements.slice(0, 40).map((m) => (
                <MovementCard key={m.id} movement={m} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Шит прихода/списания ── */}
      <MovementSheet
        open={sheet !== null}
        type={sheet ?? "in"}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

/* ── Большое кольцо остатка (spring-анимация дуги) ────────── */

function BigRing({
  value,
  max,
  color,
  center,
}: {
  value: number;
  max: number;
  color: string;
  center: React.ReactNode;
}) {
  const size = 208;
  const thickness = 16;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(max > 0 ? value / max : 0, 0), 1);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={thickness}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ type: "spring", stiffness: 90, damping: 20, delay: 0.1 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {center}
      </div>
    </div>
  );
}

/* ── Строка журнала (десктоп) ────────────────────────────── */

function MovementRow({ movement }: { movement: InventoryMovement }) {
  const Icon = MOVEMENT_ICON[movement.type];
  const sign = movement.type === "in" ? "+" : "−";
  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className="whitespace-nowrap py-3 pl-5 pr-3 font-mono text-[12.5px] text-ink-soft tabular-nums">
        {format(new Date(movement.createdAt), "d.MM.yyyy, HH:mm")}
      </td>
      <td className="py-3 pr-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            color: MOVEMENT_COLOR[movement.type],
            background: `color-mix(in srgb, ${MOVEMENT_COLOR[movement.type]} 12%, transparent)`,
          }}
        >
          <Icon className="size-3" />
          {MOVEMENT_LABEL[movement.type]}
        </span>
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[13px] font-semibold text-ink tabular-nums">
        {sign}
        {new Intl.NumberFormat("ru-RU").format(movement.quantityPacks)} уп.
        <span className="ml-1.5 text-[11px] font-normal text-ink-soft">
          ({sign}
          {new Intl.NumberFormat("ru-RU").format(movement.quantityKg)} кг)
        </span>
      </td>
      <td className="max-w-[340px] truncate py-3 pr-5 text-[13px] text-ink-soft">
        {movement.description}
      </td>
    </tr>
  );
}

/* ── Карточка журнала (мобильные) ────────────────────────── */

function MovementCard({ movement }: { movement: InventoryMovement }) {
  const Icon = MOVEMENT_ICON[movement.type];
  const sign = movement.type === "in" ? "+" : "−";
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{
          color: MOVEMENT_COLOR[movement.type],
          background: `color-mix(in srgb, ${MOVEMENT_COLOR[movement.type]} 12%, transparent)`,
        }}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-ink">
            {MOVEMENT_LABEL[movement.type]}
          </span>
          <span className="shrink-0 font-mono text-[14px] font-semibold text-ink tabular-nums">
            {sign}
            {new Intl.NumberFormat("ru-RU").format(movement.quantityPacks)} уп.
          </span>
        </p>
        <p className="mt-0.5 truncate text-[12px] text-ink-soft">
          {movement.description}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-ink-soft/80 tabular-nums">
          {format(new Date(movement.createdAt), "d MMMM, HH:mm", { locale: ru })}
          {" · "}
          {sign}
          {new Intl.NumberFormat("ru-RU").format(movement.quantityKg)} кг
        </p>
      </div>
    </div>
  );
}
