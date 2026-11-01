import type { InventoryMovement, Order, Payment } from "@/types/models";

/**
 * Демо-данные задачи 5: полный цикл сделок FryFlow.
 *
 * 6 заказов: 2 оплаченных, 3 в долг (возраст 3 / 10 / 18 дней — все три
 * цвета бейджа возраста), 1 черновик (будущие заявки из Telegram).
 * Стартовый запас 3 400 кг (1 360 уп.) списан только выполненными
 * заказами — черновик склад не трогает.
 *
 * Клиенты ссылаются на демо-базу CRM (id стабильные, см. demo-data.ts).
 */

const iso = (daysAgo: number, hour = 12) =>
  new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .replace(/T.*$/, `T${String(hour).padStart(2, "0")}:00:00.000Z`);

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export function demoOrders(): Order[] {
  return [
    {
      id: "ord-1047",
      clientId: "cl-zorge",
      clientName: "Шаурма на Зорге",
      boxesCount: 8,
      pricePerBox: 300,
      totalAmount: 2400,
      deliveryDate: day(-5),
      isPaid: true,
      createdAt: iso(6),
      deliveredAt: iso(5, 14),
      comment: "Оплата на месте, наличными.",
      isDraft: false,
    },
    {
      id: "ord-1046",
      clientId: "cl-kikchak",
      clientName: "Kikchak",
      boxesCount: 20,
      pricePerBox: 300,
      totalAmount: 6000,
      deliveryDate: day(-4),
      isPaid: true,
      createdAt: iso(7),
      deliveredAt: iso(4, 11),
      comment: "Сеть: отгрузка на все 10 точек, оплата по счёту.",
      isDraft: false,
    },
    {
      id: "ord-1045",
      clientId: "cl-shef",
      clientName: "Шеф-шаурма",
      boxesCount: 12,
      pricePerBox: 300,
      totalAmount: 3600,
      deliveryDate: day(-3),
      isPaid: false,
      createdAt: iso(3),
      deliveredAt: iso(3, 15),
      comment: "Отсрочка по договорённости — ждём оплату до конца недели.",
      isDraft: false,
    },
    {
      id: "ord-1044",
      clientId: "cl-canteen55",
      clientName: "Столовая №55",
      boxesCount: 15,
      pricePerBox: 300,
      totalAmount: 4500,
      deliveryDate: day(-10),
      isPaid: false,
      createdAt: iso(10),
      deliveredAt: iso(10, 13),
      comment: "Бухгалтерия обещала оплатить после аванса.",
      isDraft: false,
    },
    {
      id: "ord-1043",
      clientId: "cl-manchester",
      clientName: "Манчестер Паб",
      boxesCount: 6,
      pricePerBox: 350,
      totalAmount: 2100,
      deliveryDate: day(-18),
      isPaid: false,
      createdAt: iso(18),
      deliveredAt: iso(18, 19),
      comment: "Мелкий опт (меньше 10 уп. — 350 ₽). Тянут с оплатой, напоминать.",
      isDraft: false,
    },
    {
      id: "ord-1042",
      clientId: "cl-bebop",
      clientName: "The Bebop Burgers",
      boxesCount: 10,
      pricePerBox: 300,
      totalAmount: 3000,
      deliveryDate: day(1),
      isPaid: false,
      createdAt: iso(0, 9),
      comment: "Заявка из Telegram: «привезите завтра как в прошлый раз».",
      isDraft: true,
    },
  ];
}

export function demoMovements(orders: Order[]): InventoryMovement[] {
  const list: InventoryMovement[] = [
    {
      id: "mov-1001",
      type: "in",
      quantityKg: 3400,
      quantityPacks: 1360,
      description: "Стартовый запас: поставка картофеля фри 2,5 кг",
      createdAt: iso(30, 9),
    },
  ];
  // Выполненные заказы списали склад (черновики — нет).
  const byOrder: Record<string, string> = {
    "ord-1047": "Заказ #1047 · Шаурма на Зорге",
    "ord-1046": "Заказ #1046 · Kikchak",
    "ord-1045": "Заказ #1045 · Шеф-шаурма",
    "ord-1044": "Заказ #1044 · Столовая №55",
    "ord-1043": "Заказ #1043 · Манчестер Паб",
  };
  for (const o of orders) {
    if (o.isDraft || !byOrder[o.id]) continue;
    list.push({
      id: `mov-${o.id.replace("ord-", "")}`,
      type: "order",
      quantityKg: o.boxesCount * 2.5,
      quantityPacks: o.boxesCount,
      description: byOrder[o.id],
      createdAt: o.deliveredAt ?? o.createdAt,
    });
  }
  // Свежие сверху.
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function demoPayments(): Payment[] {
  return [
    {
      id: "pay-1047",
      orderId: "ord-1047",
      amount: 2400,
      createdAt: iso(5, 14),
    },
    {
      id: "pay-1046",
      orderId: "ord-1046",
      amount: 6000,
      createdAt: iso(4, 12),
    },
  ];
}
