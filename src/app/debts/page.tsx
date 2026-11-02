"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Download,
  FileText,
  MessageCircle,
  Phone,
  Wallet,
} from "lucide-react";

import { AgeBadge, money } from "@/components/orders/order-views";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import { csvDateSuffix, downloadCsv } from "@/lib/csv";
import {
  debtDays,
  debtOrders,
  ordersTotal,
  orderNumber,
  useOrdersStore,
} from "@/lib/orders-store";
import { markOrderPaid as markOrderPaidQ } from "@/lib/queries";
import { debtReminderText, waLink } from "@/lib/whatsapp";
import { useInvoiceAction } from "@/lib/use-invoice";
import { DEBT_DANGER_DAYS, type Order } from "@/types/models";

/**
 * Экран «Долги» — коллекция дебиторки с «возрастом»: старые сверху,
 * цвет от жёлтого к красному, просрочка 15+ — красная полоса слева.
 * Кнопки: позвонить, напомнить, отметить оплатой, счёт.
 */

export default function DebtsPage() {
  const orders = useOrdersStore((s) => s.orders);
  /* Сервисный слой: оплата идёт и в базу (Supabase), офлайн — в очередь. */
  const markOrderPaid = markOrderPaidQ;
  const clients = useCrmStore((s) => s.clients);
  const { toast } = useToast();
  const handleInvoice = useInvoiceAction();

  /** Сортировка по возрасту долга — старые сверху. */
  const debts = useMemo(() => debtOrders(orders), [orders]);

  const total = ordersTotal(debts);
  const overdue15 = debts.filter((o) => debtDays(o) >= DEBT_DANGER_DAYS);
  const overdue15Total = ordersTotal(overdue15);
  const oldest = debts.length ? debtDays(debts[0]) : 0;

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients]
  );

  const handlePaid = (order: Order) => {
    markOrderPaid(order.id);
    toast({
      title: `Долг закрыт: ${order.clientName}`,
      description: `${money(order.totalAmount)} ₽ (заказ #${orderNumber(order)}) — оплата записана в «Финансы».`,
      duration: 3600,
    });
  };

  const remind = (order: Order) => {
    const client = clientById.get(order.clientId);
    const days = debtDays(order);
    if (!client?.phone) {
      toast({
        title: "Телефон не указан",
        description: `У «${order.clientName}» нет телефона — контакт берите из 2ГИС.`,
        duration: 3600,
      });
      return;
    }
    window.open(waLink(client.phone, debtReminderText(order, days)), "_blank");
    toast({
      title: "Напоминание в WhatsApp",
      description: "Чат открыт, текст готов — жмите «Отправить».",
      duration: 3200,
    });
  };

  const exportCsv = () => {
    downloadCsv(
      `fryflow-debts-${csvDateSuffix()}`,
      ["№ заказа", "Клиент", "Сумма ₽", "Дата заказа", "Возраст, дней", "Зона", "Комментарий"],
      debts.map((o) => {
        const days = debtDays(o);
        return [
          orderNumber(o),
          o.clientName,
          o.totalAmount,
          format(new Date(o.createdAt), "yyyy-MM-dd"),
          days,
          days >= DEBT_DANGER_DAYS ? "красная (15+)" : days >= 8 ? "оранжевая (8-14)" : "жёлтая (1-7)",
          o.comment ?? "",
        ];
      })
    );
    toast({
      title: "CSV выгружен",
      description: `${debts.length} должников — сумма ${money(total)} ₽.`,
      duration: 3200,
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <Wallet className="size-6 text-accent" />
            Долги
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Старые сверху — начинаем день с самых красных
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
        >
          <Download className="size-4 text-accent" />
          Экспорт CSV
        </button>
      </header>

      {/* ── Сводка ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-ink-soft">Общая сумма долгов</p>
          <p className="mt-2 text-right font-mono text-[28px] font-semibold leading-tight text-ink tabular-nums">
            {money(total)}
            <span className="ml-1 text-base text-ink-soft">₽</span>
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-ink-soft">Должников</p>
          <p className="mt-2 text-right font-mono text-[28px] font-semibold leading-tight text-ink tabular-nums">
            {debts.length}
            <span className="ml-1.5 text-base text-ink-soft">чел.</span>
          </p>
          <p className="mt-1 text-right text-[11.5px] text-ink-soft">
            старший — {oldest} дн.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
          className={
            overdue15.length
              ? "rounded-2xl border border-tier-red/35 bg-tier-red/[0.07] p-5"
              : "rounded-2xl border border-border bg-surface p-5"
          }
        >
          <p className="text-[13px] font-medium text-ink-soft">Просрочка 15+</p>
          <p
            className="mt-2 text-right font-mono text-[28px] font-semibold leading-tight tabular-nums"
            style={{ color: overdue15.length ? "var(--tier-red)" : "var(--ink)" }}
          >
            {money(overdue15Total)}
            <span className="ml-1 text-base text-ink-soft">₽</span>
          </p>
          <p className="mt-1 text-right text-[11.5px] text-ink-soft">
            {overdue15.length
              ? `${overdue15.length} клиент(ов) — звонить сегодня`
              : "просроченных нет"}
          </p>
        </motion.div>
      </div>

      {/* ── Карточки должников ── */}
      {debts.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <Wallet className="size-8 text-tier-green/60" />
          <p className="text-sm font-medium text-ink">Должников нет!</p>
          <p className="max-w-xs text-[13px] text-ink-soft">
            Все заказы оплачены. Деньги работают, а не висят.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {debts.map((order) => {
              const days = debtDays(order);
              const overdue = days >= DEBT_DANGER_DAYS;
              const client = clientById.get(order.clientId);
              const phone = client?.phone || "";
              const telHref = phone
                ? `tel:${phone.replace(/[^+\d]/g, "")}`
                : undefined;
              return (
                <motion.article
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 pl-6"
                >
                  {/* Просрочка — красная полоса слева */}
                  {overdue && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5 bg-tier-red"
                    />
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[16.5px] font-semibold leading-tight text-ink">
                        {order.clientName}
                      </h3>
                      <p className="mt-1 font-mono text-[11.5px] text-ink-soft tabular-nums">
                        заказ #{orderNumber(order)} от{" "}
                        {format(new Date(order.createdAt), "d MMMM", { locale: ru })} ·{" "}
                        {order.boxesCount} уп.
                      </p>
                    </div>
                    <AgeBadge days={days} className="shrink-0" />
                  </div>

                  <p className="mt-3 text-right font-mono text-2xl font-semibold text-ink tabular-nums">
                    {money(order.totalAmount)} ₽
                  </p>

                  {order.comment && (
                    <p className="mt-2 rounded-lg bg-tint/70 px-3 py-2 text-[12px] leading-snug text-ink-soft">
                      {order.comment}
                    </p>
                  )}

                  {/* Кнопки 48px */}
                  <div className="mt-3.5 grid grid-cols-4 gap-2">
                    <a
                      href={telHref ?? "#"}
                      onClick={
                        telHref
                          ? undefined
                          : (e) => {
                              e.preventDefault();
                              toast({
                                title: "Телефон не указан",
                                description: "Номера нет в базе — ищите в 2ГИС.",
                                duration: 3200,
                              });
                            }
                      }
                      title="Позвонить"
                      className="inline-flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface text-[10.5px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-ink"
                    >
                      <Phone className="size-[18px]" />
                      Позвонить
                    </a>
                    <button
                      type="button"
                      onClick={() => remind(order)}
                      title="Напомнить в WhatsApp"
                      className="inline-flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface text-[10.5px] font-medium text-ink-soft transition-colors hover:border-tier-green/40 hover:bg-tier-green/10 hover:text-ink"
                    >
                      <MessageCircle className="size-[18px]" />
                      Напомнить
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handlePaid(order)}
                      className="inline-flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-tier-green/12 text-[10.5px] font-semibold text-tier-green transition-colors hover:bg-tier-green/20"
                    >
                      <BadgeCheck className="size-[18px]" />
                      Оплатить
                    </motion.button>
                    <button
                      type="button"
                      onClick={() => handleInvoice(order)}
                      title="Сформировать счёт (PDF)"
                      className="inline-flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface text-[10.5px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-ink"
                    >
                      <FileText className="size-[18px]" />
                      Счёт
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
