"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Landmark,
  MessageCircle,
  ShoppingBasket,
  Wallet,
} from "lucide-react";

import { AgeBadge, money } from "@/components/orders/order-views";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import {
  crossSellStats,
  debtDays,
  debtOrders,
  ordersTotal,
  orderNumber,
  useOrdersStore,
} from "@/lib/orders-store";
import { debtReminderText, waLink } from "@/lib/whatsapp";
import { useInvoiceAction } from "@/lib/use-invoice";
import { DEBT_DANGER_DAYS, type Order } from "@/types/models";

/**
 * Экран «Финансы» — куда уходят деньги: к получению, просрочка 15+,
 * оплачено. Возраст долга — цветовой сигнал: жёлтый → оранжевый → красный.
 * Отсюда же напоминание в WhatsApp и переход в «Долги».
 */

export default function FinancePage() {
  const orders = useOrdersStore((s) => s.orders);
  const clients = useCrmStore((s) => s.clients);
  const { toast } = useToast();
  const handleInvoice = useInvoiceAction();

  const [paidFilter, setPaidFilter] = useState(false);
  /** «Показать только попутные товары» — заказы с items (задача 9). */
  const [crossOnly, setCrossOnly] = useState(false);

  const unpaid = useMemo(() => debtOrders(orders), [orders]);
  const paid = useMemo(
    () => orders.filter((o) => !o.isDraft && o.isPaid),
    [orders]
  );

  const crossStats = crossSellStats(orders);

  const receivable = ordersTotal(unpaid);
  const overdue15 = ordersTotal(unpaid.filter((o) => debtDays(o) >= DEBT_DANGER_DAYS));
  const paidTotal = ordersTotal(paid);

  const phoneByClient = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) if (c.phone) m.set(c.id, c.phone);
    return m;
  }, [clients]);

  /** Показать оплаченные вместо долгов; «только попутные» — из обоих
   *  списков сразу (долг и оплата рядом, оцениваем канал целиком). */
  const list = crossOnly
    ? [...unpaid, ...paid]
        .filter((o) => (o.items ?? []).length > 0)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : paidFilter
      ? paid.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : unpaid;

  const remind = (order: Order) => {
    const phone = phoneByClient.get(order.clientId);
    if (!phone) {
      toast({
        title: "Телефон не указан",
        description: `У «${order.clientName}» нет телефона в базе — напомните при звонке.`,
        duration: 3600,
      });
      return;
    }
    window.open(waLink(phone, debtReminderText(order, debtDays(order))), "_blank");
    toast({
      title: "Напоминание в WhatsApp",
      description: `Открываем чат с «${order.clientName}» — текст уже набран, жмите «Отправить».`,
      duration: 3600,
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Landmark className="size-6 text-accent" />
            Финансы
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Оборачиваемость денег: {unpaid.length} сделок ждут оплату
          </p>
        </div>
        <Link
          href="/debts"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
        >
          Все долги
          <ArrowRight className="size-4 text-accent" />
        </Link>
      </header>

      {/* ── Сводка ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="К получению"
          value={money(receivable)}
          unit="₽"
          tone="accent"
          caption={`${unpaid.length} неоплаченных заказов`}
        />
        <SummaryCard
          label="Просрочка 15+"
          value={money(overdue15)}
          unit="₽"
          tone="red"
          caption={`красная зона — звонить сегодня`}
        />
        <SummaryCard
          label="Оплачено"
          value={money(paidTotal)}
          unit="₽"
          tone="green"
          caption={`${paid.length} закрытых сделок`}
        />
      </div>

      {/* ── Переключатель: долги / оплаченные ── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="fryflow-scroll flex gap-2" role="tablist" aria-label="Что показывать">
          {(
            [
              { id: false, label: "Ждут оплату", count: unpaid.length },
              { id: true, label: "Оплаченные", count: paid.length },
            ] as const
          ).map((t) => (
            <button
              key={String(t.id)}
              type="button"
              role="tab"
              aria-selected={paidFilter === t.id}
              onClick={() => setPaidFilter(t.id)}
              className={
                paidFilter === t.id
                  ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-ink px-3.5 text-[13px] font-medium text-bg"
                  : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-tint hover:text-ink"
              }
            >
              {t.label}
              <span className="font-mono text-[11px] tabular-nums opacity-70">
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-pressed={crossOnly}
            onClick={() => setCrossOnly((v) => !v)}
            className={
              crossOnly
                ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-accent bg-accent/12 px-3.5 text-[13px] font-medium text-accent"
                : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-tint hover:text-ink"
            }
          >
            <ShoppingBasket className="size-3.5" />
            Только попутные
            <span className="font-mono text-[11px] tabular-nums opacity-70">
              {crossStats.ordersWithItems}
            </span>
          </button>
          <p className="hidden text-xs text-ink-soft sm:block">
            возраст долга: <span className="font-semibold text-tier-yellow">1–7 дн</span>{" "}
            · <span className="font-semibold text-[var(--status-callback)]">8–14</span> ·{" "}
            <span className="font-semibold text-tier-red">15+</span>
          </p>
        </div>
      </div>

      {/* ── Список ── */}
      {list.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Wallet className="size-8 text-ink-soft/50" />
          <p className="text-sm text-ink-soft">
            {crossOnly
              ? "Заказов с попутными товарами пока нет — добавьте их при создании заказа"
              : paidFilter
                ? "Оплаченных заказов пока нет"
                : "Все заказы оплачены — красавчики!"}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
          <AnimatePresence initial={false}>
            {list.map((order) => {
              const days = debtDays(order);
              const overdue = !order.isPaid && days >= DEBT_DANGER_DAYS;
              const phone = phoneByClient.get(order.clientId);
              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3.5 last:border-b-0 sm:px-5"
                  style={
                    overdue
                      ? { boxShadow: "inset 3px 0 0 var(--tier-red)" }
                      : undefined
                  }
                >
                  <div className="min-w-0 flex-[2]">
                    <p className="flex items-baseline gap-2">
                      <span className="truncate text-[14.5px] font-semibold text-ink">
                        {order.clientName}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-soft tabular-nums">
                        #{orderNumber(order)}
                      </span>
                      {order.items && order.items.length > 0 && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                          style={{
                            color: "var(--accent)",
                            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                          }}
                          title={order.items.map((i) => i.name).join(", ")}
                        >
                          <ShoppingBasket className="size-3" />+{order.items.length}{" "}
                          {order.items.length === 1 ? "товар" : "товара"}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-[11.5px] text-ink-soft tabular-nums">
                      {format(new Date(order.createdAt), "d MMMM", { locale: ru })}
                      {" · "}
                      {order.boxesCount} уп.
                    </p>
                  </div>

                  <div className="flex-[1] text-right">
                    <p className="font-mono text-[16px] font-semibold text-ink tabular-nums">
                      {money(order.totalAmount)} ₽
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {order.isPaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tier-green/12 px-2.5 py-0.5 text-[11px] font-semibold text-tier-green">
                        <BadgeCheck className="size-3.5" />
                        Оплачен
                      </span>
                    ) : (
                      <>
                        <AgeBadge days={days} />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => remind(order)}
                            title="Напомнить в WhatsApp"
                            className="flex size-9 items-center justify-center rounded-lg border border-border text-ink-soft transition-colors hover:border-tier-green/40 hover:text-tier-green"
                          >
                            <MessageCircle className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInvoice(order)}
                            title="Сформировать счёт"
                            className="flex h-9 items-center justify-center rounded-lg border border-border px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
                          >
                            Счёт
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <p className="mt-4 rounded-xl bg-tint/60 px-4 py-2.5 text-[12px] leading-snug text-ink-soft">
        Отсрочка по закону для продуктов питания — до 40 дней, но новым клиентам
        только по факту или предоплата. Долг 15+ дней — сигнал звонить в тот же день.
      </p>
    </div>
  );
}

/* ── Карточка сводки ─────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  unit,
  tone,
  caption,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "accent" | "red" | "green";
  caption: string;
}) {
  const color =
    tone === "red"
      ? "var(--tier-red)"
      : tone === "green"
        ? "var(--tier-green)"
        : "var(--accent)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <p className="text-[13px] font-medium text-ink-soft">{label}</p>
      <p
        className="mt-2 text-right font-mono text-[28px] font-semibold leading-tight tabular-nums"
        style={{ color }}
      >
        {value}
        <span className="ml-1 text-base text-ink-soft">{unit}</span>
      </p>
      <p className="mt-1 text-right text-[11.5px] text-ink-soft">{caption}</p>
    </motion.div>
  );
}
