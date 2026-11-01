/**
 * Модели данных CRM FryFlow.
 * Клиент — главный объект приложения: карточка открывается за один тап,
 * приоритет (green/yellow/red) — первое, что видит глаз.
 *
 * Бизнес-контекст: оптовая торговля картофелем фри (упаковка 2,5 кг,
 * 300 ₽/уп). Сегменты HoReCa: шаурмичные, бургерные, столовые, пабы.
 */

/* ── Перечисления ──────────────────────────────────────────── */

/** Сегмент клиента (тип заведения). */
export type ClientType =
  | "shawarma" // шаурмичная
  | "burger" // бургерная
  | "canteen" // столовая
  | "bar" // бар
  | "hookah" // кальянная
  | "foodcourt" // фудкорт
  | "darkkitchen"; // дарк-китчен

/** Статус воронки продаж. */
export type ClientStatus =
  | "cold" // холодный
  | "no_answer" // недозвон
  | "callback" // перезвонить
  | "trial" // проба
  | "regular" // постоянный
  | "refused"; // отказ

/** Приоритет базы: green — золото, yellow — тепло, red — остыло. */
export type PriorityTier = "green" | "yellow" | "red";

/** Результат звонка (журнал Call). */
export type CallResult = "trial" | "callback" | "refused" | "no_answer";

/* ── Сущности ──────────────────────────────────────────────── */

export interface Client {
  id: string;
  name: string;
  address: string;
  /** Район Ростова-на-Дону (см. DISTRICTS). */
  district: string;
  /** Пустая строка — клиент без телефона (просроченный лид). */
  phone: string;
  type: ClientType;
  status: ClientStatus;
  priorityTier: PriorityTier;
  /** Сеть — «золото» бизнеса: один звонок в Kikchak = 10 клиентов. */
  chainName?: string;
  chainSize?: number;
  coordinates: { lat: number; lng: number };
  notes: string;
  /** ISO-дата создания карточки. */
  createdAt: string;

  /* Данные для Health Score и маршрута дня */
  /** Последний заказ (ISO). Отсутствие = «нет истории» (оценка не считается). */
  lastOrderAt?: string;
  /** Ожидаемая частота заказов, дней (по умолчанию — по типу). */
  orderFrequencyDays?: number;
  /** Коробок в последнем заказе (для автосборки маршрута). */
  lastOrderBoxes?: number;
}

export interface Call {
  id: string;
  clientId: string;
  result: CallResult;
  comment: string;
  /** Дата перезвона (yyyy-MM-dd) — только для result === "callback". */
  callbackDate?: string;
  createdAt: string;
}

/** Точка маршрута дня. */
export interface RouteStop {
  clientId: string;
  /** Коробок к отгрузке (вместимость машины — 50 по умолчанию). */
  boxes: number;
  /** Сумма заказа, ₽ (коробки × 300 ₽). */
  orderSum: number;
}

/* ── Справочники ───────────────────────────────────────────── */

/** Районы Ростова-на-Дону. */
export const DISTRICTS = [
  "Кировский",
  "Ворошиловский",
  "Ленинский",
  "Октябрьский",
  "Первомайский",
  "Пролетарский",
  "Советский",
] as const;

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  shawarma: "Шаурмичная",
  burger: "Бургерная",
  canteen: "Столовая",
  bar: "Бар",
  hookah: "Кальянная",
  foodcourt: "Фудкорт",
  darkkitchen: "Дарк-китчен",
};

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  cold: "Холодный",
  no_answer: "Недозвон",
  callback: "Перезвонить",
  trial: "Проба",
  regular: "Постоянный",
  refused: "Отказ",
};

export const CALL_RESULT_LABEL: Record<CallResult, string> = {
  trial: "Проба",
  callback: "Перезвонить",
  refused: "Отказ",
  no_answer: "Недозвон",
};

export const PRIORITY_LABEL: Record<PriorityTier, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
};

/**
 * CSS-переменные цвета статуса воронки (заданы в globals.css
 * для светлой и тёмной тем). Используются в бейджах и на карте.
 */
export const STATUS_COLOR_VAR: Record<ClientStatus, string> = {
  cold: "var(--status-cold)",
  no_answer: "var(--status-no-answer)",
  callback: "var(--status-callback)",
  trial: "var(--status-trial)",
  regular: "var(--status-regular)",
  refused: "var(--status-refused)",
};

export const PRIORITY_COLOR_VAR: Record<PriorityTier, string> = {
  green: "var(--tier-green)",
  yellow: "var(--tier-yellow)",
  red: "var(--tier-red)",
};

/** Типовые часы работы по сегменту — временные окна маршрута. */
export const WORKING_HOURS: Record<ClientType, { from: number; to: number }> = {
  shawarma: { from: 10, to: 23 },
  burger: { from: 10, to: 22 },
  canteen: { from: 8, to: 16 },
  bar: { from: 12, to: 23 },
  hookah: { from: 14, to: 26 }, // до 02:00 следующих суток
  foodcourt: { from: 10, to: 21 },
  darkkitchen: { from: 10, to: 22 },
};

/** Ожидаемая частота заказов по сегменту, дней (для Health Score). */
export const DEFAULT_ORDER_FREQUENCY: Record<ClientType, number> = {
  shawarma: 5,
  burger: 7,
  canteen: 10,
  bar: 14,
  hookah: 14,
  foodcourt: 7,
  darkkitchen: 7,
};

/** Коробок в типовом заказе по сегменту (для автосборки маршрута). */
export const TYPICAL_ORDER_BOXES: Record<ClientType, number> = {
  shawarma: 6,
  burger: 4,
  canteen: 10,
  bar: 3,
  hookah: 2,
  foodcourt: 5,
  darkkitchen: 5,
};

/** Оптовая цена упаковки картофеля фри 2,5 кг. */
export const PRICE_PER_PACK = 300;
