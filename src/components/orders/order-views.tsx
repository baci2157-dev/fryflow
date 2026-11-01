"use client";

import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  FileText,
  MessageCircle,
  PackageCheck,
  X,
} from "lucide-react";

import { formatMoney } from "@/lib/mock-data";
import { orderNumber } from "@/lib/orders-store";
import { orderReceiptText, waLink } from "@/lib/whatsapp";
import { debtAge, type Order } from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Представления заказа: бейджи оплаты и возраста долга, мобильная
 * карточка (крупные кнопки 48px) и строка таблицы для десктопа,
 * карточка черновика с «Подтвердить» / «Отклонить».
 */

export const money = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

/** Русская плюрализация: 1 день, 2 дня, 5 дней. */
export function pluralDays(n: number): string {
  const abs = n % 100;
  const d = n % 10;
  if (abs >= 11 && abs <= 14) return "дней";
  if (d === 1) return "день";
  if (d >= 2 && d <= 4) return "дня";
  return "дней";
}

export function ageText(days: number): string {
  return `${days} ${pluralDays(days)}`;
}

/* ── Бейджи ─────────────────────────────────────────────── */

export function PaidBadge({ order }: { order: Order }) {
  if (order.isDraft) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
        Черновик
      </span>
    );
  }
  return order.isPaid ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-tier-green/12 px-2.5 py-0.5 text-[11px] font-semibold text-tier-green">
      <Check className="size-3" strokeWidth={3} />
      Оплачен
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
      Долг
    </span>
  );
}

/** Возраст долга: 1–7 жёлтый, 8–14 оранжевый, 15+ красный. */
export function AgeBadge({ days, className }: { days: number; className?: string }) {
  const tone = debtAge(days);
  const color =
    tone === "danger"
      ? "var(--tier-red)"
      : tone === "warn"
        ? "var(--status-callback)"
        : "var(--tier-yellow)";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        className
      )}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
      }}
    >
      {ageText(days)}
    </span>
  );
}

/* ── Действия ───────────────────────────────────────────── */

export function invoiceStub(onToast: (title: string, description: string) => void) {
  onToast(
    "Счёт (PDF)",
    "Автогенерация счёта появится в следующей версии — пока считаем вручную.",
  );
}

function waHref(order: Order, phone: string | undefined): string {
  const text = encodeURIComponent(orderReceiptText(order));
  return phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/* ── Мобильная карточка заказа ──────────────────────────── */

export function OrderCard({
  order,
  phone,
  onPaid,
  onInvoice,
}: {
  order: Order;
  phone?: string;
  onPaid: (order: Order) => void;
  onInvoice: () => void;
}) {
  const delivery = format(
    new Date(`${order.deliveryDate}T00:00:00`),
    "d MMM, EEE",
    { locale: ru }
  );
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(28,26,23,0.04)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11.5px] text-ink-soft tabular-nums">
          #{orderNumber(order)}
        </span>
        <PaidBadge order={order} />
      </div>

      <h3 className="mt-1.5 text-[17px] font-semibold leading-tight text-ink">
        {order.clientName}
      </h3>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[13px] leading-snug text-ink-soft">
          <span className="font-mono font-semibold text-ink tabular-nums">
            {order.boxesCount}
          </span>{" "}
          уп. · {money(order.boxesCount * 2.5)} кг
          <span className="mx-1.5 text-border">|</span>
          {order.pricePerBox} ₽/уп
        </p>
        <p className="shrink-0 font-mono text-xl font-semibold text-ink tabular-nums">
          {money(order.totalAmount)} ₽
        </p>
      </div>

      <p className="mt-1.5 text-[12px] text-ink-soft">
        Доставка: {delivery}
        {!order.isDraft && !order.isPaid && (
          <>
            {" · "}долг {ageText(orderAge(order))}
          </>
        )}
      </p>

      {order.comment && (
        <p className="mt-2 rounded-lg bg-tint/70 px-3 py-2 text-[12px] leading-snug text-ink-soft">
          {order.comment}
        </p>
      )}

      {!order.isDraft && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          <a
            href={waHref(order, phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-[13.5px] font-medium text-ink transition-colors hover:border-tier-green/40 hover:bg-tier-green/10"
          >
            <MessageCircle className="size-[18px] text-tier-green" />
            Чек в WhatsApp
          </a>
          {!order.isPaid && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onPaid(order)}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-tier-green/12 px-3 text-[13.5px] font-semibold text-tier-green transition-colors hover:bg-tier-green/20"
            >
              <BadgeCheck className="size-[18px]" />
              Оплачен
            </motion.button>
          )}
          <button
            type="button"
            onClick={onInvoice}
            aria-label="Сформировать счёт PDF"
            className="inline-flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-ink-soft transition-colors hover:bg-tint hover:text-ink"
          >
            <FileText className="size-[18px]" />
          </button>
        </div>
      )}
    </motion.article>
  );
}

/* ── Строка таблицы (десктоп) ───────────────────────────── */

export function OrderRow({
  order,
  phone,
  onPaid,
  onInvoice,
}: {
  order: Order;
  phone?: string;
  onPaid: (order: Order) => void;
  onInvoice: () => void;
}) {
  return (
    <tr className="border-b border-border/60 last:border-b-0 hover:bg-tint/50">
      <td className="py-3 pl-5 pr-2 font-mono text-[12.5px] text-ink-soft tabular-nums">
        #{orderNumber(order)}
      </td>
      <td className="max-w-[220px] truncate py-3 pr-3 text-[13.5px] font-medium text-ink">
        {order.clientName}
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[13px] text-ink-soft tabular-nums">
        {order.boxesCount} уп.
        <span className="ml-1.5 text-[11px] text-ink-soft/70">
          {money(order.boxesCount * 2.5)} кг
        </span>
      </td>
      <td className="py-3 pr-3 text-right font-mono text-[13.5px] font-semibold text-ink tabular-nums">
        {money(order.totalAmount)} ₽
      </td>
      <td className="py-3 pr-3 font-mono text-[12.5px] text-ink-soft tabular-nums">
        {format(new Date(`${order.deliveryDate}T00:00:00`), "d.MM.yyyy")}
      </td>
      <td className="py-3 pr-3">
        <PaidBadge order={order} />
      </td>
      <td className="py-3 pr-4 text-right">
        {!order.isDraft && (
          <div className="flex items-center justify-end gap-1.5">
            <a
              href={waHref(order, phone)}
              target="_blank"
              rel="noopener noreferrer"
              title="Чек в WhatsApp"
              className="flex size-9 items-center justify-center rounded-lg border border-border text-ink-soft transition-colors hover:border-tier-green/40 hover:text-tier-green"
            >
              <MessageCircle className="size-4" />
            </a>
            {!order.isPaid && (
              <button
                type="button"
                onClick={() => onPaid(order)}
                title="Отметить оплаченным"
                className="flex size-9 items-center justify-center rounded-lg border border-border text-ink-soft transition-colors hover:border-tier-green/40 hover:text-tier-green"
              >
                <BadgeCheck className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onInvoice}
              title="Сформировать счёт (PDF)"
              className="flex size-9 items-center justify-center rounded-lg border border-border text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
            >
              <FileText className="size-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/* ── Карточка черновика (заявка из Telegram) ────────────── */

export function DraftCard({
  order,
  onConfirm,
  onReject,
}: {
  order: Order;
  onConfirm: (order: Order) => void;
  onReject: (order: Order) => void;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="rounded-2xl border border-dashed border-accent/45 bg-accent/[0.06] p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11.5px] text-ink-soft tabular-nums">
          #{orderNumber(order)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
          Заявка · черновик
        </span>
      </div>

      <h3 className="mt-1.5 text-[17px] font-semibold leading-tight text-ink">
        {order.clientName}
      </h3>
      <p className="mt-1.5 text-[13px] text-ink-soft">
        <span className="font-mono font-semibold text-ink tabular-nums">
          {order.boxesCount}
        </span>{" "}
        уп. · {money(order.boxesCount * 2.5)} кг ·{" "}
        <span className="font-mono text-ink tabular-nums">
          {formatMoney(order.totalAmount)}
        </span>{" "}
        · доставка{" "}
        {format(new Date(`${order.deliveryDate}T00:00:00`), "d MMM", { locale: ru })}
      </p>
      {order.comment && (
        <p className="mt-2 rounded-lg bg-surface/70 px-3 py-2 text-[12px] leading-snug text-ink-soft">
          «{order.comment}»
        </p>
      )}

      <div className="mt-4 flex gap-2.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onConfirm(order)}
          className="inline-flex h-12 flex-[1.5] items-center justify-center gap-2 rounded-xl bg-tier-green text-[14.5px] font-semibold text-white transition-colors hover:bg-tier-green/90"
        >
          <PackageCheck className="size-5" />
          Подтвердить
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onReject(order)}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-[14.5px] font-medium text-ink-soft transition-colors hover:bg-tint hover:text-ink"
        >
          <X className="size-[18px]" />
          Отклонить
        </motion.button>
      </div>
    </motion.article>
  );
}

/** Возраст заказа в днях (для долга). */
function orderAge(order: Order): number {
  const then = new Date(order.createdAt);
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86_400_000));
}
