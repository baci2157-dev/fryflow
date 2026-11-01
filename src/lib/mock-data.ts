/**
 * Заглушки данных FryFlow (поставка фритюрного масла для HoReCa).
 * В следующих задачах заменяются на реальный источник (API / Prisma).
 */

export const inventory = {
  totalKg: 3400,
  packs: 1360,
  /** порог «Пора заказывать» */
  thresholdKg: 500,
  /** нормативный максимум запаса — 100% прогресс-бара */
  capacityKg: 4000,
  /** остаток по дням, кг (последние 7 дней) */
  history: [3950, 3880, 3790, 3710, 3620, 3510, 3400],
};

export const receivables = {
  amount: 412500,
  debtors: 7,
  oldestDays: 34,
};

export const margin = {
  amount: 486200,
  changePct: 8.2,
  /** маржа по дням, тыс. ₽ */
  history: [
    412, 418, 425, 421, 430, 436, 441, 438, 445, 452,
    449, 456, 461, 458, 464, 470, 468, 473, 471, 477,
    482, 479, 484, 481, 486, 483, 488, 485, 490, 486,
  ],
};

export interface Task {
  id: string;
  time: string;
  title: string;
  kind: "call" | "debt";
  done: boolean;
  /** CRM-клиент — перезвоны кликабельны и ведут в «Звонки». */
  clientId?: string;
  /** Дата перезвона (yyyy-MM-dd) — для сортировки задач. */
  callbackDate?: string;
  /** Просроченный перезвон — подсвечиваем красным. */
  overdue?: boolean;
  /** Ссылка для кликабельных задач (долги → /debts). */
  href?: string;
}

export type OrderStatus = "delivered" | "transit" | "packing";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  delivered: "Доставлен",
  transit: "В пути",
  packing: "Собирается",
};

export interface RecentOrder {
  id: string;
  client: string;
  amount: number;
  status: OrderStatus;
  date: string;
}

export const recentOrders: RecentOrder[] = [
  { id: "#1042", client: "Кафе «Ватрушка»", amount: 48900, status: "delivered", date: "2 ноя, 11:40" },
  { id: "#1041", client: "Пекарня «Колосок»", amount: 32400, status: "transit", date: "2 ноя, 10:15" },
  { id: "#1040", client: "Ресторан «Уют»", amount: 61200, status: "transit", date: "1 ноя, 17:50" },
  { id: "#1039", client: "Столовая №8", amount: 18700, status: "packing", date: "1 ноя, 15:05" },
  { id: "#1038", client: "Бургерная «Огонь»", amount: 27300, status: "delivered", date: "1 ноя, 12:30" },
];

export interface ClientStub {
  id: string;
  name: string;
  address: string;
}

export const clients: ClientStub[] = [
  { id: "c1", name: "Кафе «Ватрушка»", address: "ул. Пятницкая, 12" },
  { id: "c2", name: "Ресторан «Уют»", address: "пр. Мира, 44" },
  { id: "c3", name: "Пекарня «Колосок»", address: "ул. Ленина, 7" },
  { id: "c4", name: "Столовая №8", address: "ул. Заводская, 1" },
  { id: "c5", name: "Бургерная «Огонь»", address: "ул. Гоголя, 23" },
  { id: "c6", name: "Кофейня «Мокко»", address: "наб. Реки Фонтанки, 5" },
];

export const aiAdvices: string[] = [
  "Манчестер Паб — самый старый должник (18 дней). Звонок до 10:00 повышает шанс возврата: начните день с него.",
  "«Шаурма Shop» заказы растут три недели подряд — предложите объёмную скидку на 15+ коробок.",
  "Сеть Kikchak — золото базы: 10 точек × 20 уп. Созвон с управляющим заменит 10 звонков.",
  "Маржа на мелком опте (350 ₽) — 40 ₽/кг, на опте — только 20 ₽/кг. Двигайте клиентов к 10+ коробкам.",
];

/** Форматирование чисел: 3400 -> «3 400» (ru-RU, неразрывные пробелы). */
export const formatNumber = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
export const formatMoney = (n: number) => `${formatNumber(n)} ₽`;
