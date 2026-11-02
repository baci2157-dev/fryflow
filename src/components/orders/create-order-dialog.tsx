"use client";

import { useMemo, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  Check,
  Minus,
  Package,
  Plus,
  Search,
  Snowflake,
  UserRound,
  Wallet,
} from "lucide-react";

import { SpringSheet } from "@/components/crm/spring-sheet";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { stockPacks, useOrdersStore } from "@/lib/orders-store";
import { createOrder as createOrderQ } from "@/lib/queries";
import {
  MIN_WHOLESALE_BOXES,
  PRICE_PER_PACK,
  SMALL_WHOLESALE_PRICE_PER_PACK,
  type Client,
} from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Форма «Новый заказ» — 3 касания: клиент → количество → создать.
 * Значения по умолчанию: 10 уп. по 300 ₽, доставка завтра, оплата на месте.
 * Цена сама переключается 300↔350 при пересечении порога опта (10 уп.),
 * пока владелец не задал свою цену вручную.
 *
 * Склад: подсказка «останется N уп.» и запрет заказа больше остатка.
 */

const money = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

interface CreateOrderDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateOrderDialog({ open, onClose }: CreateOrderDialogProps) {
  const clients = useCrmStore((s) => s.clients);
  const movements = useOrdersStore((s) => s.movements);
  /* Сервисный слой: мок — стор localStorage, Supabase — ещё и в базу
   * (офлайн — операция встанет в IndexedDB-очередь и догонит при сети). */
  const createOrder = createOrderQ;
  const { toast } = useToast();

  const remaining = stockPacks(movements);

  /* ── Состояние формы ── */
  const [query, setQuery] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [boxesCount, setBoxesCount] = useState(10);
  const [pricePerBox, setPricePerBox] = useState(PRICE_PER_PACK);
  /** Цена задана вручную — авто-переключение 300↔350 отключено. */
  const [priceTouched, setPriceTouched] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(() =>
    isoDay(addDays(new Date(), 1))
  );
  const [isPaid, setIsPaid] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const total = boxesCount * pricePerBox;
  const stockAfter = remaining - boxesCount;
  const notEnough = stockAfter < 0;
  const smallWholesale = boxesCount < MIN_WHOLESALE_BOXES;

  /* Поиск клиента: имя, район, телефон; приоритет green сверху. */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.district.toLowerCase().includes(q) ||
            c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "␀")
        )
      : clients;
    const tierRank = { green: 0, yellow: 1, red: 2 } as const;
    return [...base]
      .sort(
        (a, b) =>
          tierRank[a.priorityTier] - tierRank[b.priorityTier] ||
          a.name.localeCompare(b.name, "ru")
      )
      .slice(0, 6);
  }, [clients, query]);

  const changeCount = (delta: number) => {
    const next = Math.min(200, Math.max(1, boxesCount + delta));
    setBoxesCount(next);
    // Авто-цена при пересечении порога опта — только пока цена не тронута.
    if (!priceTouched) {
      setPricePerBox(
        next < MIN_WHOLESALE_BOXES
          ? SMALL_WHOLESALE_PRICE_PER_PACK
          : PRICE_PER_PACK
      );
    }
  };

  const submit = () => {
    if (!client || notEnough) return;
    const order = createOrder({
      clientId: client.id,
      clientName: client.name,
      boxesCount,
      pricePerBox,
      deliveryDate,
      isPaid,
    });
    toast({
      title: `Заказ #${order.id.replace("ord-", "")} создан`,
      description: `${client.name}: ${boxesCount} уп. на ${money(total)} ₽. ${
        isPaid
          ? "Оплачен — смотрите в «Финансах»."
          : "В долг — появился в разделе «Долги»."
      } Склад: ${money(stockAfter)} уп.`,
      duration: 4200,
    });
    // Сброс к значениям по умолчанию (3 касания — каждый заказ с чистого листа).
    setClient(null);
    setQuery("");
    setBoxesCount(10);
    setPricePerBox(PRICE_PER_PACK);
    setPriceTouched(false);
    setDeliveryDate(isoDay(addDays(new Date(), 1)));
    setIsPaid(true);
    setCalendarOpen(false);
    onClose();
  };

  const quickDates = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((offset) => {
      const d = addDays(now, offset);
      return {
        value: isoDay(d),
        label:
          offset === 0
            ? "Сегодня"
            : offset === 1
              ? "Завтра"
              : "Послезавтра",
        caption: format(d, "d MMM", { locale: ru }),
      };
    });
  }, []);

  const selectedDate = new Date(`${deliveryDate}T00:00:00`);

  return (
    <SpringSheet
      open={open}
      onClose={onClose}
      variant="dialog"
      title="Новый заказ"
    >
      {/* ── 1. Клиент: поиск с автокомплитом ── */}
      {!client ? (
        <div className="mt-3">
          <label className="relative block">
            <span className="sr-only">Поиск клиента</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя, район или телефон…"
              className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-3.5 text-[15px] text-ink placeholder:text-ink-soft/70 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <div className="mt-2 divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
            {matches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-soft">
                Ничего не нашли. Добавьте клиента в разделе «Клиенты».
              </p>
            ) : (
              matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClient(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tint"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tint text-ink-soft">
                    <UserRound className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">
                      {c.name}
                    </span>
                    <span className="block truncate text-[12px] text-ink-soft">
                      {c.district}
                      {c.phone ? ` · ${c.phone}` : " · без телефона"}
                    </span>
                  </span>
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      background: `var(--tier-${c.priorityTier})`,
                    }}
                    aria-label={`Приоритет ${c.priorityTier}`}
                  />
                </button>
              ))
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
            <Snowflake className="size-3.5 text-accent" />
            Сверху — клиенты green-приоритета: им отправляем заказ первыми
          </p>
        </div>
      ) : (
        <>
          {/* Выбранный клиент */}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-tint/60 px-4 py-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ink">
              <UserRound className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">
                {client.name}
              </p>
              <p className="truncate text-[12px] text-ink-soft">
                {client.district}
                {client.phone ? ` · ${client.phone}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setClient(null);
                setQuery("");
              }}
              className="shrink-0 text-[13px] font-medium text-accent hover:underline"
            >
              Сменить
            </button>
          </div>

          {/* ── 2. Количество упаковок: степперы ── */}
          <div className="mt-4 rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
                <Package className="size-4 text-accent" />
                Упаковок по 2,5 кг
              </span>
              <span className="font-mono text-[12px] text-ink-soft tabular-nums">
                {(boxesCount * 2.5).toLocaleString("ru-RU")} кг
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <motion.button
                type="button"
                aria-label="Минус одна упаковка"
                whileTap={{ scale: 0.9 }}
                onClick={() => changeCount(-1)}
                disabled={boxesCount <= 1}
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-ink transition-colors hover:bg-tint disabled:opacity-40"
              >
                <Minus className="size-5" strokeWidth={2.5} />
              </motion.button>
              <div className="flex-1 text-center">
                <motion.span
                  key={boxesCount}
                  initial={{ scale: 1.12 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="font-mono text-4xl font-semibold text-ink tabular-nums"
                >
                  {boxesCount}
                </motion.span>
              </div>
              <motion.button
                type="button"
                aria-label="Плюс одна упаковка"
                whileTap={{ scale: 0.9 }}
                onClick={() => changeCount(1)}
                disabled={boxesCount >= 200}
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-ink transition-colors hover:bg-tint disabled:opacity-40"
              >
                <Plus className="size-5" strokeWidth={2.5} />
              </motion.button>
            </div>
            {smallWholesale ? (
              <p className="mt-2.5 rounded-lg bg-tier-yellow/10 px-3 py-2 text-[12px] leading-snug text-ink-soft">
                Мелкий опт (до {MIN_WHOLESALE_BOXES - 1} уп.): цена{" "}
                {SMALL_WHOLESALE_PRICE_PER_PACK} ₽/уп. Опт 300 ₽ — от{" "}
                {MIN_WHOLESALE_BOXES} уп.
              </p>
            ) : (
              <p className="mt-2.5 text-[12px] text-ink-soft">
                Оптовая цена: {PRICE_PER_PACK} ₽/уп (120 ₽/кг)
              </p>
            )}
          </div>

          {/* ── Цена за упаковку ── */}
          <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
            <span className="text-[13.5px] text-ink">
              Цена за упаковку, ₽
              <span className="mt-0.5 block text-[11.5px] text-ink-soft">
                можно изменить для скидки
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              value={pricePerBox}
              onChange={(e) => {
                setPriceTouched(true);
                setPricePerBox(Math.max(1, Number(e.target.value) || 0));
              }}
              className="h-11 w-28 rounded-xl border border-border bg-surface px-3 text-right font-mono text-lg font-semibold text-ink tabular-nums focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </label>

          {/* ── Итого: крупно, моно, янтарный ── */}
          <div className="mt-3 flex items-end justify-between rounded-2xl bg-accent/10 px-4 py-3.5">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
              Итого
            </span>
            <motion.span
              key={total}
              initial={{ scale: 1.06 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 480, damping: 24 }}
              className="font-mono text-3xl font-semibold text-accent tabular-nums"
            >
              {money(total)} ₽
            </motion.span>
          </div>

          {/* ── Подсказка склада ── */}
          <p
            className={cn(
              "mt-2.5 flex items-center gap-1.5 px-1 text-[12.5px]",
              notEnough
                ? "text-tier-red"
                : stockAfter < 10
                  ? "text-accent"
                  : "text-ink-soft"
            )}
          >
            <Package className="size-3.5 shrink-0" />
            {notEnough
              ? `Не хватит: на складе только ${remaining} уп. Оформите приход или уменьшите заказ.`
              : `После заказа на складе останется ${money(stockAfter)} уп.`}
            {!notEnough && stockAfter < 10 && " — мало, закажите у поставщика"}
          </p>

          {/* ── Дата доставки ── */}
          <div className="mt-3 rounded-2xl border border-border p-4">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
              Дата доставки
            </span>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {quickDates.map((d) => {
                const active = deliveryDate === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDeliveryDate(d.value);
                      setCalendarOpen(false);
                    }}
                    className={
                      active
                        ? "inline-flex h-11 flex-col items-center justify-center rounded-xl border border-accent bg-accent/15 px-3.5 leading-tight"
                        : "inline-flex h-11 flex-col items-center justify-center rounded-xl border border-border bg-surface px-3.5 leading-tight transition-colors hover:bg-tint"
                    }
                  >
                    <span className="text-[12.5px] font-semibold text-ink">
                      {d.label}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-soft tabular-nums">
                      {d.caption}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={calendarOpen}
                onClick={() => setCalendarOpen((v) => !v)}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-xl border transition-colors",
                  calendarOpen
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
                )}
                aria-label="Календарь"
              >
                <Calendar className="size-5" />
              </button>
            </div>
            <AnimatePresence initial={false}>
              {calendarOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  className="overflow-hidden"
                >
                  <div className="fryflow-rdp mt-3 flex justify-center rounded-xl border border-border bg-surface p-2">
                    <DayPicker
                      mode="single"
                      locale={ru}
                      selected={selectedDate}
                      onSelect={(d) => {
                        if (d) {
                          setDeliveryDate(isoDay(d));
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={{ before: new Date() }}
                      animate={false}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <p className="mt-2.5 text-[12px] text-ink-soft">
              Доставка{" "}
              <span className="font-medium text-ink">
                {format(selectedDate, "d MMMM, EEEE", { locale: ru })}
              </span>
              {isSameDay(selectedDate, new Date()) && " — уже сегодня, успеем"}
            </p>
          </div>

          {/* ── Оплата: тумблер ── */}
          <div className="mt-3 rounded-2xl border border-border p-4">
            <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
              <Wallet className="size-4 text-accent" />
              Оплата
            </span>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {(
                [
                  { paid: true, label: "Оплачено", hint: "по факту / предоплата" },
                  { paid: false, label: "В долг", hint: "отсрочка до 40 дней" },
                ] as const
              ).map((opt) => {
                const active = isPaid === opt.paid;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setIsPaid(opt.paid)}
                    className={cn(
                      "flex min-h-[52px] flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-left transition-colors",
                      active
                        ? opt.paid
                          ? "border-tier-green/55 bg-tier-green/10"
                          : "border-accent bg-accent/12"
                        : "border-border bg-surface hover:bg-tint"
                    )}
                  >
                    <span className="text-[14px] font-semibold text-ink">
                      {opt.label}
                    </span>
                    <span className="text-[11.5px] text-ink-soft">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Кнопки ── */}
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-xl border border-border bg-surface text-[15px] font-medium text-ink transition-colors hover:bg-tint"
            >
              Отмена
            </button>
            <motion.button
              type="button"
              whileTap={client && !notEnough ? { scale: 0.98 } : undefined}
              onClick={submit}
              disabled={!client || notEnough}
              className={cn(
                "h-12 flex-[1.6] rounded-xl text-[15px] font-semibold transition-all",
                client && !notEnough
                  ? "bg-accent text-[#1C1A17] hover:bg-accent/90"
                  : "cursor-not-allowed bg-tint text-ink-soft/60"
              )}
            >
              {notEnough
                ? "Не хватает склада"
                : client
                  ? `Создать заказ · ${money(total)} ₽`
                  : "Выберите клиента"}
            </motion.button>
          </div>
        </>
      )}
    </SpringSheet>
  );
}
