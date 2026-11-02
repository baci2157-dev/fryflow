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

  /* ── Задача 9: попутные товары (cross-sell) ── */
  /** Интересы клиента — категории попутных товаров (масло, соус…).
   *  Основано на истории закупок: «этот обычно берёт масло и соус». */
  interests?: ProductCategory[];
}

export interface Call {
  id: string;
  clientId: string;
  result: CallResult;
  comment: string;
  /** Дата перезвона (yyyy-MM-dd) — только для result === "callback". */
  callbackDate?: string;
  createdAt: string;
  /** Номер попытки: 1 — первый звонок, 2 — второй… */
  attemptNumber: number;
}

/** Попутный товар, взятый в маршрут дня (задача 9). */
export interface RouteCrossSell {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

/** Точка маршрута дня. */
export interface RouteStop {
  clientId: string;
  /** Коробок к отгрузке (вместимость машины — 50 по умолчанию). */
  boxes: number;
  /** Сумма заказа, ₽ (коробки × 300 ₽). */
  orderSum: number;
  /** Попутные товары к точке: «заодно захватить масло». */
  crossSell?: RouteCrossSell[];
}

/* ── Заказы, склад, финансы (задача 5) ────────────────────── */

/** Заказ — сделка полного цикла: создание → склад → оплата. */
export interface Order {
  id: string;
  clientId: string;
  /** Копия имени клиента на момент заказа (клиента могут переименовать). */
  clientName: string;
  /** Упаковок по 2,5 кг (10 уп. = опт по 300 ₽). */
  boxesCount: number;
  /** ₽ за упаковку: 300 — опт от 10 уп., 350 — мелкий опт. */
  pricePerBox: number;
  /** boxesCount × pricePerBox, пересчитывается при создании. */
  totalAmount: number;
  /** Дата доставки (yyyy-MM-dd). */
  deliveryDate: string;
  isPaid: boolean;
  /** ISO-дата создания заказа. */
  createdAt: string;
  /** ISO-дата фактической доставки. */
  deliveredAt?: string;
  comment?: string;
  /** true — заявка-черновик (из Telegram), склад не списывается. */
  isDraft: boolean;
  /** Откуда пришёл заказ: руками или заявкой из Telegram-бота. */
  source?: "manual" | "telegram";
  /** id заявки на сервере Telegram-роута (дедуп при синхронизации). */
  externalId?: string;

  /* ── Задача 9: попутные товары в заказе ── */
  /** Попутные товары (масло, соус…) — снимок на момент заказа. */
  items?: OrderItem[];
}

/** Тип движения по складу. */
export type MovementType = "in" | "out" | "order";

/** Журнал движения товара по складу. */
export interface InventoryMovement {
  id: string;
  type: MovementType;
  /** Килограммы (упаковки × 2,5). */
  quantityKg: number;
  /** Упаковки. */
  quantityPacks: number;
  description: string;
  createdAt: string;
}

/** Частичная оплата заказа (суммы копятся, пока не закроют весь долг). */
export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  createdAt: string;
}

/* ── Попутные товары: каталог и строки заказа (задача 9) ── */

/** Категория попутного товара. */
export type ProductCategory =
  | "oil" // масло
  | "sauce" // соус
  | "greens" // зелень
  | "vegetables" // овощи
  | "semis" // полуфабрикаты
  | "packaging"; // упаковка

/** Товар каталога попутных позиций. */
export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  /** Единица: л / кг / шт. */
  unit: "л" | "кг" | "шт";
  /** Цена продажи, ₽ (за фасовку из описания: канистра, ведро, пачка). */
  price: number;
  /** Закупочная цена, ₽ (для маржи). */
  cost: number;
  /** Остаток на складе попутных товаров (в фасовках). */
  stock: number;
  description: string;
}

/** Попутный товар в заказе — снимок цен на момент продажи. */
export interface OrderItem {
  productId: string;
  name: string;
  category: ProductCategory;
  unit: "л" | "кг" | "шт";
  qty: number;
  price: number;
}

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  oil: "Масло",
  sauce: "Соус",
  greens: "Зелень",
  vegetables: "Овощи",
  semis: "Полуфабрикаты",
  packaging: "Упаковка",
};

/** Цветной бейдж категории (CSS-переменные заданы в globals.css). */
export const PRODUCT_CATEGORY_COLOR: Record<ProductCategory, string> = {
  oil: "var(--cat-oil)",
  sauce: "var(--cat-sauce)",
  greens: "var(--cat-greens)",
  vegetables: "var(--cat-vegetables)",
  semis: "var(--cat-semis)",
  packaging: "var(--cat-packaging)",
};

/** Сумма попутных товаров заказа (строки × количество), ₽. */
export function crossSellSum(items: OrderItem[] | undefined): number {
  return (items ?? []).reduce((sum, i) => sum + i.qty * i.price, 0);
}

/* ── Регионы: оптовики юга (задача 7) ────────────────────── */

/** Воронка регионального оптовика: Первый контакт → Тест → Фура. */
export type RegionalStatus = "first" | "test" | "truck";

export interface RegionalPartner {
  id: string;
  /** Компания / база оптовика. */
  company: string;
  /** Город: Краснодар, Волгоград, Ставрополь… */
  city: string;
  contactPerson: string;
  phone: string;
  /** Месячный объём, тонн (фура ≈ 20 т). */
  volumeTons: number;
  status: RegionalStatus;
  notes: string;
  /** ISO-дата создания карточки. */
  createdAt: string;
}

export const REGIONAL_STATUS_LABEL: Record<RegionalStatus, string> = {
  first: "Первый контакт",
  test: "Тест",
  truck: "Фура",
};

/** Подсказка «что значит статус» — редактируем прямо в списке. */
export const REGIONAL_STATUS_HINT: Record<RegionalStatus, string> = {
  first: "Переговоры: прайс отправлен, ждём решение",
  test: "Пробная отгрузка 2–10 т — присматриваемся друг к другу",
  truck: "Работаем фурами (~20 т) — золото регионального канала",
};

/* ── Справочники: заказы и склад ──────────────────────────── */

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  in: "Приход",
  out: "Списание",
  order: "По заказу",
};

/** Вес одной упаковки, кг. */
export const PACK_KG = 2.5;
/** Стартовый запас демо-данных: 3 400 кг = 1 360 упаковок. */
export const INITIAL_STOCK_KG = 3400;
export const INITIAL_STOCK_PACKS = 1360;
/** Порог «Пора заказывать у поставщика», кг. */
export const LOW_STOCK_KG = 500;
/** Возраст долга, дни: 1–7 жёлтый, 8–14 оранжевый, 15+ красный. */
export const DEBT_WARN_DAYS = 8;
export const DEBT_DANGER_DAYS = 15;
/** Отсрочка платежа по закону для продуктов питания, дней. */
export const DEFERMENT_DAYS = 40;

/** Тепловая карта возраста долга. */
export type DebtAge = "fresh" | "warn" | "danger";

export const DEBT_AGE_LABEL: Record<DebtAge, string> = {
  fresh: "до 7 дней",
  warn: "8–14 дней",
  danger: "15+ дней",
};

export function debtAge(days: number): DebtAge {
  if (days >= DEBT_DANGER_DAYS) return "danger";
  if (days >= DEBT_WARN_DAYS) return "warn";
  return "fresh";
}

/** Сколько дней прошло с даты (ISO или yyyy-MM-dd) до сегодня. */
export function daysSince(isoDate: string): number {
  const then = new Date(isoDate.length === 10 ? `${isoDate}T00:00:00` : isoDate);
  return Math.max(
    0,
    Math.floor((Date.now() - then.getTime()) / 86_400_000)
  );
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
  "Железнодорожный",
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

/** Оптовая цена упаковки картофеля фри 2,5 кг (от 10 коробок). */
export const PRICE_PER_PACK = 300;
/** Опт от 10 коробок: 300 ₽ / 2,5 кг = 120 ₽/кг. */
export const PRICE_PER_KG = 120;
/** Минимальный объём для оптовой цены, коробок. */
export const MIN_WHOLESALE_BOXES = 10;
/** Мелкий опт (меньше 10 коробок): 350 ₽ за упаковку. */
export const SMALL_WHOLESALE_PRICE_PER_PACK = 350;
/** Мелкий опт: 350 ₽ / 2,5 кг = 140 ₽/кг. */
export const SMALL_WHOLESALE_PRICE_PER_KG = 140;
/** Себестоимость закупки, ₽/кг (маржа 20–40 ₽/кг). */
export const COST_PER_KG = 100;
/** Пробная партия для холодного лида: одна упаковка 2,5 кг за 350 ₽,
 *  вычитается из первого оптового заказа. */
export const TRIAL_PRICE = 350;
export const TRIAL_PACK_KG = 2.5;
