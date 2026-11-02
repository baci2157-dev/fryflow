import { format } from "date-fns";
import { ru } from "date-fns/locale";

import type { Order } from "@/types/models";

/** Человекочитаемый номер: ord-1048 → 1048. */
const num = (order: Order) => order.id.replace(/^ord-/, "");

/**
 * WhatsApp-интеграция FryFlow: чек по заказу и напоминание о долге.
 * Открываем wa.me с предзаполненным текстом — владелец жмёт «Отправить»
 * уже в своём WhatsApp (бизнес-аккаунт не нужен).
 */

/** +7 (918) 558-34-12 → 79185583412 (формат wa.me без + и разделителей). */
export function waPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 11) return null;
  return digits;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
}

const money = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;
const kg = (packs: number) => `${new Intl.NumberFormat("ru-RU").format(packs * 2.5)} кг`;

/** Чек по заказу: что, сколько, когда, на какую сумму. */
export function orderReceiptText(order: Order): string {
  const lines = [
    "FryFlow — картофель фри 2,5 кг ❄️",
    "",
    `Заказ #${num(order)}`,
    `${order.clientName}`,
    "",
    `Картофель фри замороженный — ${order.boxesCount} уп. (${kg(order.boxesCount)})`,
    `${order.boxesCount} × ${money(order.pricePerBox)} = ${money(order.totalAmount)}`,
    "",
    `Доставка: ${format(new Date(`${order.deliveryDate}T00:00:00`), "d MMMM, EEEE", { locale: ru })}`,
    order.isPaid ? "Оплачено ✅" : "К оплате при получении",
  ];
  if (order.comment) lines.push("", `Комментарий: ${order.comment}`);
  lines.push("", "Спасибо за заказ! FryFlow 🍟");
  return lines.join("\n");
}

/** Напоминание о долге — вежливое, с суммой и возрастом. */
export function debtReminderText(order: Order, days: number): string {
  const word = days === 1 ? "день" : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? "дня" : "дней";
  return [
    `Здравствуйте! Это FryFlow 🍟`,
    "",
    `По заказу #${num(order)} от ${format(new Date(order.createdAt), "d MMMM", { locale: ru })} осталась оплата ${money(order.totalAmount)} (${days} ${word} назад).`,
    "",
    "Если уже оплатили — проигнорируйте сообщение. Будем рады продолжить поставки!",
    "Реквизиты для оплаты пришлём в ответном сообщении.",
  ].join("\n");
}
