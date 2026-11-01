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
}

export const todayTasks: Task[] = [
  { id: "t1", time: "09:00", title: "Перезвон: Кафе «Ватрушка»", kind: "call", done: true },
  { id: "t2", time: "09:20", title: "Перезвон: Пекарня «Колосок»", kind: "call", done: true },
  { id: "t3", time: "09:40", title: "Долг: Кузнецов А. — 34 дня", kind: "debt", done: true },
  { id: "t4", time: "10:00", title: "Перезвон: Ресторан «Уют»", kind: "call", done: true },
  { id: "t5", time: "10:30", title: "Перезвон: Кофейня «Мокко»", kind: "call", done: false },
  { id: "t6", time: "11:00", title: "Долг: Столовая №8 — 5 дней", kind: "debt", done: false },
  { id: "t7", time: "11:30", title: "Перезвон: Бургерная «Огонь»", kind: "call", done: false },
  { id: "t8", time: "12:00", title: "Перезвон: Пиццерия «Тесто»", kind: "call", done: false },
  { id: "t9", time: "13:00", title: "Долг: Ресторан «Уют» — 12 дней", kind: "debt", done: false },
  { id: "t10", time: "13:30", title: "Перезвон: Закусочная «Сытно»", kind: "call", done: false },
  { id: "t11", time: "14:00", title: "Перезвон: Кафе «Утро»", kind: "call", done: false },
  { id: "t12", time: "14:30", title: "Перезвон: Пекарня «Сдоба»", kind: "call", done: false },
  { id: "t13", time: "15:00", title: "Перезвон: Ресторан «Волга»", kind: "call", done: false },
  { id: "t14", time: "15:30", title: "Перезвон: Кафе «Млин»", kind: "call", done: false },
  { id: "t15", time: "16:00", title: "Перезвон: Столовая №8 — новый прайс", kind: "call", done: false },
];

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
  "Кузнецов А. — самый старый должник (34 дня). Звонок до 10:00 повышает шанс возврата: начните день с него.",
  "У «Бургерной «Огонь»» заказы растут на 20% три недели подряд — предложите объёмную скидку на фритюрное масло.",
  "Трём клиентам на этой неделе истекает отсрочка. Отправьте напоминания в Telegram до 12:00 — так открываемость выше.",
  "Маржа растёт третий месяц. Проверьте закупочные цены «Маслотреста» — возможно, пора пересмотреть контракт.",
];

/** Форматирование чисел: 3400 -> «3 400» (ru-RU, неразрывные пробелы). */
export const formatNumber = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
export const formatMoney = (n: number) => `${formatNumber(n)} ₽`;
