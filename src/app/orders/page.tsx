"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Plus, ShoppingCart, Download, Send } from "lucide-react";

import { CreateOrderDialog } from "@/components/orders/create-order-dialog";
import {
  DraftCard,
  OrderCard,
  OrderRow,
} from "@/components/orders/order-views";
import { useToast } from "@/hooks/use-toast";
import { useCrmStore } from "@/lib/clients-store";
import {
  orderNumber,
  useOrdersStore,
} from "@/lib/orders-store";
import {
  confirmDraft as confirmDraftQ,
  createOrder as createOrderQ,
  markOrderPaid as markOrderPaidQ,
  rejectDraft as rejectDraftQ,
} from "@/lib/queries";
import { csvDateSuffix, downloadCsv } from "@/lib/csv";
import { useInvoiceAction } from "@/lib/use-invoice";
import { MIN_WHOLESALE_BOXES, SMALL_WHOLESALE_PRICE_PER_PACK, PRICE_PER_PACK, type Order } from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Экран «Заказы» — полный список сделок.
 * Табы с живыми счётчиками: Все / Неоплаченные / Оплаченные / Черновики.
 * Десктоп — таблица, мобильные — карточки с кнопками 48px.
 *
 * Черновики — заявки из Telegram: вебхук кладёт их на сервер,
 * экран забирает при открытии (дедуп по externalId). «Подтвердить»
 * превращает заявку в заказ и списывает склад, «Отклонить» — удаляет.
 */

type TabId = "all" | "unpaid" | "paid" | "drafts";

/** Заявка из Telegram-сервера (см. /api/telegram/webhook).
 *  status (задача 25): pending — создать черновик, confirmed/rejected —
 *  решение принято кнопкой в Telegram, применяем в CRM. */
interface ServerDraft {
  id: string;
  clientName: string;
  boxes: number;
  deliveryDate: string;
  message: string;
  fromName: string;
  receivedAt: string;
  status?: "pending" | "confirmed" | "rejected" | "resolved";
}

/** Заказ, отмеченный «✅ Оплачено» кнопкой в Telegram (задача 25). */
interface ServerPaidOrder {
  alertId: string;
  orderId: string;
  clientName: string;
  amount: number;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "all", label: "Все" },
  { id: "unpaid", label: "Неоплаченные" },
  { id: "paid", label: "Оплаченные" },
  { id: "drafts", label: "Черновики" },
];

export default function OrdersPage() {
  const orders = useOrdersStore((s) => s.orders);
  /* Сервисный слой (мок/Supabase + офлайн-очередь) вместо прямых мутаций. */
  const createOrder = createOrderQ;
  const markOrderPaid = markOrderPaidQ;
  const confirmDraft = confirmDraftQ;
  const rejectDraft = rejectDraftQ;
  const clients = useCrmStore((s) => s.clients);
  const { toast } = useToast();
  const handleInvoice = useInvoiceAction();

  /* Глубокая ссылка из Telegram (кнопка «👁 Открыть черновик»):
   * /orders?tab=drafts — открываем вкладку «Черновики» сразу. */
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "all";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "drafts" || t === "all" || t === "unpaid" || t === "paid"
      ? (t as TabId)
      : "all";
  });
  const [createOpen, setCreateOpen] = useState(false);

  /* Синхронизация заявок из Telegram: сервер — истина по новым заявкам,
   * дедуп — по externalId. Забираем при открытии экрана и при
   * переключении на вкладку «Черновики».
   *
   * Задача 25: статусы заявок + оплаченные-через-Telegram заказы.
   *  • pending (новая) — создаём локальный черновик (как раньше);
   *  • confirmed — подтверждаем локальный черновик кнопкой из Telegram
   *    (или создаём заказ сразу, если заявку ещё не видели);
   *  • rejected — отклоняем локальный черновик;
   *  • paidOrders — помечаем оплаченными (кнопка «✅ Оплачено»),
   *    подтверждаем серверу (ackPaid), чтобы не применять дважды. */
  const syncTelegramDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/drafts");
      if (!res.ok) return;
      const { drafts, paidOrders } = (await res.json()) as {
        drafts: ServerDraft[];
        paidOrders?: ServerPaidOrder[];
      };

      const all = useOrdersStore.getState().orders;
      const byExternal = new Map(
        all.filter((o) => o.externalId).map((o) => [o.externalId as string, o] as const)
      );

      let confirmedCount = 0;
      let rejectedCount = 0;
      let createdCount = 0;

      for (const d of drafts) {
        const status = d.status ?? "pending";
        const known = byExternal.get(d.id);

        if (status === "pending") {
          if (known) continue;
          createOrder({
            clientId: `tg-${d.id}`,
            clientName: d.clientName,
            boxesCount: d.boxes,
            pricePerBox:
              d.boxes >= MIN_WHOLESALE_BOXES
                ? PRICE_PER_PACK
                : SMALL_WHOLESALE_PRICE_PER_PACK,
            deliveryDate: d.deliveryDate,
            isPaid: false,
            comment: `${d.message} — ${d.fromName}, Telegram`,
            isDraft: true,
            source: "telegram",
            externalId: d.id,
          });
          createdCount++;
          continue;
        }

        if (status === "confirmed") {
          if (known?.isDraft) {
            confirmDraft(known.id);
            confirmedCount++;
          } else if (!known) {
            /* Приложение заявку ещё не видело — создаём сразу заказом
             * (склад спишется при создании). */
            createOrder({
              clientId: `tg-${d.id}`,
              clientName: d.clientName,
              boxesCount: d.boxes,
              pricePerBox:
                d.boxes >= MIN_WHOLESALE_BOXES
                  ? PRICE_PER_PACK
                  : SMALL_WHOLESALE_PRICE_PER_PACK,
              deliveryDate: d.deliveryDate,
              isPaid: false,
              comment: `${d.message} — ${d.fromName}, Telegram (подтверждено в Telegram)`,
              isDraft: false,
              source: "telegram",
              externalId: d.id,
            });
            confirmedCount++;
          }
          /* Серверную заявку закрываем — решение применено. */
          void fetch("/api/telegram/drafts/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: d.id, action: "confirmed" }),
          }).catch(() => undefined);
          continue;
        }

        if (status === "rejected") {
          if (known?.isDraft) {
            rejectDraft(known.id);
            rejectedCount++;
          }
          void fetch("/api/telegram/drafts/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: d.id, action: "rejected" }),
          }).catch(() => undefined);
        }
      }

      /* Оплаченные кнопкой «✅ Оплачено» в Telegram. */
      const ackPaid: string[] = [];
      let paidCount = 0;
      for (const p of paidOrders ?? []) {
        const order = useOrdersStore
          .getState()
          .orders.find((o) => o.id === p.orderId && !o.isDraft);
        if (order && !order.isPaid) {
          markOrderPaid(order.id);
          paidCount++;
        }
        /* Не нашли заказ — всё равно подтверждаем: держать висяком
         * на сервере смысла нет (кнопка была из старого алерта). */
        ackPaid.push(p.alertId);
      }
      if (ackPaid.length > 0) {
        void fetch("/api/telegram/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ackPaid }),
        }).catch(() => undefined);
      }

      if (createdCount > 0) {
        toast({
          title: `Из Telegram: ${createdCount} ${createdCount === 1 ? "заявка" : "заявки"}`,
          description: "Клиенты написали боту — подтвердите во вкладке «Черновики».",
          duration: 4600,
        });
      }
      if (confirmedCount > 0 || rejectedCount > 0) {
        toast({
          title: "Решения из Telegram применены",
          description: `${confirmedCount} подтверждено, ${rejectedCount} отклонено — кнопками в Telegram.`,
          duration: 4600,
        });
      }
      if (paidCount > 0) {
        toast({
          title: `Оплачено в Telegram: ${paidCount}`,
          description: "Заказ помечен оплаченным кнопкой «✅ Оплачено» в Telegram.",
          duration: 4600,
        });
      }
    } catch {
      /* сервер недоступен — показываем локальные черновики */
    }
  }, [createOrder, confirmDraft, rejectDraft, markOrderPaid, toast]);

  useEffect(() => {
    void syncTelegramDrafts();
  }, [syncTelegramDrafts]);

  useEffect(() => {
    if (tab === "drafts") void syncTelegramDrafts();
  }, [tab, syncTelegramDrafts]);

  /* Убираем обработанную заявку с сервера — чтобы не приезжала снова. */
  const resolveServerDraft = (order: Order, action: "confirmed" | "rejected") => {
    if (!order.externalId) return;
    void fetch("/api/telegram/drafts/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.externalId, action }),
    }).catch(() => undefined);
  };

  /* Телефон клиента для WhatsApp-чека (клиента могли удалить — тогда undefined). */
  const phoneByClient = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) if (c.phone) m.set(c.id, c.phone);
    return m;
  }, [clients]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      unpaid: orders.filter((o) => !o.isDraft && !o.isPaid).length,
      paid: orders.filter((o) => !o.isDraft && o.isPaid).length,
      drafts: orders.filter((o) => o.isDraft).length,
    }),
    [orders]
  );

  /* Свежие сверху (по номеру заказа). */
  const visible = useMemo(() => {
    const byNumberDesc = (a: Order, b: Order) =>
      orderNumber(b) - orderNumber(a);
    if (tab === "drafts") return orders.filter((o) => o.isDraft);
    if (tab === "unpaid")
      return orders.filter((o) => !o.isDraft && !o.isPaid).sort(byNumberDesc);
    if (tab === "paid")
      return orders.filter((o) => !o.isDraft && o.isPaid).sort(byNumberDesc);
    return [...orders].sort(byNumberDesc);
  }, [orders, tab]);

  const handlePaid = (order: Order) => {
    markOrderPaid(order.id);
    toast({
      title: `Заказ #${orderNumber(order)} оплачен`,
      description: `${order.clientName} — ${new Intl.NumberFormat("ru-RU").format(order.totalAmount)} ₽. Долг закрыт, сумма ушла в «Финансы».`,
      duration: 3600,
    });
  };

  const handleConfirmDraft = (order: Order) => {
    confirmDraft(order.id);
    resolveServerDraft(order, "confirmed");
    toast({
      title: `Заявка #${orderNumber(order)} подтверждена`,
      description: `${order.clientName}: заказ создан, ${order.boxesCount} уп. списаны со склада.`,
      duration: 3800,
    });
  };

  const handleRejectDraft = (order: Order) => {
    rejectDraft(order.id);
    resolveServerDraft(order, "rejected");
    toast({
      title: `Заявка #${orderNumber(order)} отклонена`,
      description: "Черновик удалён, склад не менялся.",
      duration: 3200,
    });
  };

  const exportCsv = () => {
    downloadCsv(
      `fryflow-orders-${csvDateSuffix()}`,
      ["№", "Клиент", "Упаковок", "Кг", "Цена ₽", "Сумма ₽", "Доставка", "Оплата", "Создан", "Комментарий"],
      visible.map((o) => [
        orderNumber(o),
        o.clientName,
        o.boxesCount,
        o.boxesCount * 2.5,
        o.pricePerBox,
        o.totalAmount,
        o.deliveryDate,
        o.isDraft ? "черновик" : o.isPaid ? "оплачен" : "долг",
        new Date(o.createdAt).toLocaleString("ru-RU"),
        o.comment ?? "",
      ])
    );
    toast({
      title: "CSV выгружен",
      description: `${visible.length} заказов — файл откроется в Excel без кракозябр (UTF-8, «;»).`,
      duration: 3200,
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      {/* ── Заголовок ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 lg:py-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <ShoppingCart className="size-6 text-accent" />
            Заказы
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
              {counts.all}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {counts.unpaid} в долг · {counts.paid} оплачено · {counts.drafts}{" "}
            заявок-черновиков
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/10"
          >
            <Download className="size-4 text-accent" />
            Экспорт CSV
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-[#1C1A17] transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            <Plus className="size-4" strokeWidth={2.6} />
            Новый заказ
          </button>
        </div>
      </header>

      {/* ── Табы ── */}
      <div
        className="fryflow-scroll flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Фильтры заказов"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              tab === t.id
                ? "border-transparent bg-ink text-bg"
                : "border-border bg-surface text-ink-soft hover:bg-tint hover:text-ink"
            )}
          >
            {t.label}
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                tab === t.id ? "opacity-70" : "text-ink-soft"
              )}
            >
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Список ── */}
      {tab === "drafts" ? (
        /* Черновики: заявки из Telegram */
        visible.length === 0 ? (
          <EmptyState
            icon={<Send className="size-8 text-ink-soft/50" />}
            title="Заявок из Telegram пока нет"
            hint="Клиент пишет боту — ИИ разбирает заявку (коробки, дата) и она падает сюда. Проверить прямо сейчас: Настройки → Telegram → «Смоделировать заявку клиента»."
          />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((order) => (
                <DraftCard
                  key={order.id}
                  order={order}
                  onConfirm={handleConfirmDraft}
                  onReject={handleRejectDraft}
                />
              ))}
            </AnimatePresence>
          </div>
        )
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="size-8 text-ink-soft/50" />}
          title={tab === "all" ? "Заказов пока нет" : "Здесь пока пусто"}
          hint='Нажмите «+ Новый заказ» — три касания: клиент, количество, готово.'
        />
      ) : (
        <>
          {/* Десктоп: таблица */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-tint/50 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="py-2.5 pl-5 pr-2">№</th>
                  <th className="py-2.5 pr-3">Клиент</th>
                  <th className="py-2.5 pr-3 text-right">Упаковок</th>
                  <th className="py-2.5 pr-3 text-right">Сумма</th>
                  <th className="py-2.5 pr-3">Доставка</th>
                  <th className="py-2.5 pr-3">Оплата</th>
                  <th className="py-2.5 pr-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    phone={phoneByClient.get(order.clientId)}
                    onPaid={handlePaid}
                    onInvoice={() => handleInvoice(order)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильные: карточки */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  phone={phoneByClient.get(order.clientId)}
                  onPaid={handlePaid}
                  onInvoice={() => handleInvoice(order)}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── Форма нового заказа ── */}
      <CreateOrderDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      {icon}
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-xs text-[13px] leading-snug text-ink-soft">{hint}</p>
    </div>
  );
}
