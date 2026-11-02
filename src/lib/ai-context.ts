import {
  CLIENT_TYPE_LABEL,
  COST_PER_KG,
  DEBT_DANGER_DAYS,
  DEBT_WARN_DAYS,
  LOW_STOCK_KG,
  MIN_WHOLESALE_BOXES,
  PACK_KG,
  PRICE_PER_PACK,
  PRODUCT_CATEGORY_LABEL,
  SMALL_WHOLESALE_PRICE_PER_PACK,
  TRIAL_PRICE,
  crossSellSum,
  daysSince,
  type Call,
  type Client,
  type InventoryMovement,
  type Order,
  type Payment,
  type Product,
  type ProductCategory,
  type RegionalPartner,
} from "@/types/models";
import type { DiscoveredLead } from "@/lib/discovery-store";

/**
 * Сборщик контекста для ИИ-Директора.
 *
 * Перед каждым запросом собирает живые цифры из CRM-стора: склад,
 * дебиторку с возрастом, холодные лиды по районам, выручку и маржу
 * за 30 дней. ИИ видит ровно то же, что видит владелец, — поэтому
 * отвечает делом, а не общими словами.
 *
 * Задача 10 расширила контекст до «коммерческого директора»:
 *   • recentOrders — последние 10 заказов с попутными позициями;
 *   • clientPatterns — средний интервал, средний чек, «берёт только фри»;
 *   • seasonality — месяц, сезон и подсказка, что сейчас в тему;
 *   • crossSell — живой каталог попутных товаров с маржой.
 *
 * Задача 11 добавила разведку:
 *   • discovery — кандидаты из «Найдено ИИ» (веб-поиск) и новые
 *     точки за 7 дней, включая тех, кому ещё ни разу не звонили.
 */

export interface AiStock {
  kg: number;
  packs: number;
  lowStockKg: number;
  isLow: boolean;
  /** Средний расход за 30 дней, кг/день (по заказам). */
  outflowKgPerDay: number;
  /** Оценка «на сколько дней хватит» при текущем расходе. */
  daysLeft: number | null;
}

export interface AiDebtor {
  name: string;
  amountRub: number;
  days: number;
  order: number;
  zone: "fresh" | "warn" | "danger";
}

export interface AiRegions {
  /** Всего оптовиков в базе регионов. */
  partners: number;
  /** Суммарный объём, тонн. */
  tons: number;
  /** Работают фурами. */
  trucks: number;
  /** В статусе «Тест». */
  tests: number;
  byCity: Array<{ city: string; partners: number; tons: number }>;
  /** Топ оптовиков по объёму — с кого начинать день. */
  top: Array<{ company: string; city: string; volumeTons: number; status: string }>;
}

/* ── Задача 10: контекст «коммерческого директора» ─────────── */

/** Последний заказ — живая история с попутными позициями. */
export interface AiRecentOrder {
  client: string;
  date: string;
  sumRub: number;
  boxes: number;
  /** Попутные позиции текстом: «Соус чесночный ×2». */
  items: string[];
  crossSellRub: number;
}

/** Паттерн клиента: как часто и на сколько берёт, чем докупает. */
export interface AiClientPattern {
  name: string;
  tier: "green" | "yellow" | "red";
  segment: string;
  ordersCount: number;
  /** Средний интервал между заказами, дней (null — один заказ). */
  avgIntervalDays: number | null;
  /** Дней с последнего заказа — главный триггер «пора звонить». */
  daysSinceLastOrder: number;
  avgCheckRub: number;
  /** Интересы русскими словами: «масло», «соус». */
  interests: string[];
  /** true — за всю историю ни одного попутного товара: только фри. */
  onlyFries: boolean;
  /** Клиент «назрел»: без заказа дольше своего среднего интерввала. */
  overdue: boolean;
}

/** Сезонность: что сейчас в тему у шаурмичных и пабов. */
export interface AiSeasonality {
  month: string;
  season: "зима" | "весна" | "лето" | "осень";
  /** Бизнес-подсказка: на что смотреть в этом сезоне. */
  hint: string;
}

/** Разведка и новые точки (задача 11) — глазами ИИ. */
export interface AiDiscovery {
  /** Кандидаты в «Найдено ИИ», ждут решения владельца. */
  pendingLeads: number;
  /** Уже добавлены в CRM из «Найдено ИИ». */
  approvedLeads: number;
  /** Новых точек в базе за последние 7 дней. */
  newPoints7d: number;
  /** Новые точки без единого звонка — кого обзвонить первым. */
  uncalledNewPoints: Array<{
    name: string;
    tier: "green" | "yellow" | "red";
    segment: string;
    /** Дней с создания карточки (0 — сегодня). */
    daysOld: number;
  }>;
}

/** Каталог попутных товаров глазами ИИ. */
export interface AiCrossSell {
  products: Array<{
    name: string;
    category: string;
    priceRub: number;
    costRub: number;
    /** Маржа за единицу — ₽ и %, чтобы ИИ советовал выгодное. */
    marginRub: number;
    marginPct: number;
    stock: number;
    unit: string;
  }>;
  /** Попутные продажи за 30 дней, ₽ (маржа фри не растёт — эта растёт). */
  last30Rub: number;
  /** Заказов с попутными позициями за 30 дней. */
  last30Orders: number;
}

export interface AiContext {
  today: string;
  stock: AiStock;
  receivables: {
    totalRub: number;
    debtors: AiDebtor[];
  };
  orders: {
    last30: { count: number; revenueRub: number; boxes: number; marginRub: number };
    drafts: number;
  };
  leads: {
    cold: number;
    noAnswer: number;
    total: number;
    byDistrict: Array<{ district: string; count: number }>;
    withPhone: number;
  };
  clients: {
    total: number;
    green: number;
    yellow: number;
    red: number;
    chains: string[];
  };
  /** Региональные оптовики юга (задача 7). */
  regions?: AiRegions;
  /* ── Задача 10: история, паттерны, сезонность, каталог ── */
  /** Последние 10 заказов с попутными позициями. */
  recentOrders: AiRecentOrder[];
  /** Как заказывают клиенты: интервал, чек, «только фри». */
  clientPatterns: AiClientPattern[];
  /** Текущий месяц, сезон и что сейчас продавать. */
  seasonality: AiSeasonality;
  /** Каталог попутных товаров + продажи за 30 дней. */
  crossSell: AiCrossSell;
  /* ── Задача 11: разведка «Найдено ИИ» и новые точки ── */
  /** Кандидаты из веб-поиска + новые точки за 7 дней. */
  discovery: AiDiscovery;
  pricing: {
    wholesalePerBox: number;
    wholesalePerKg: number;
    smallWholesalePerBox: number;
    smallWholesalePerKg: number;
    costPerKg: number;
    minWholesaleBoxes: number;
    trialPrice: number;
    packKg: number;
  };
  thresholds: { debtWarnDays: number; debtDangerDays: number };
}

export interface AiContextDeps {
  clients: Client[];
  orders: Order[];
  movements: InventoryMovement[];
  payments: Payment[];
  /** Региональные оптовики (необязательно — для старых вызовов). */
  regions?: RegionalPartner[];
  /** Каталог попутных товаров (задача 10 — необязательно, старые
   *  вызовы получают пустой каталог и паттерны без интересов). */
  products?: Product[];
  /** Журнал звонков (задача 11) — для «кому ещё не звонили». */
  calls?: Call[];
  /** Кандидаты «Найдено ИИ» (задача 11). */
  discovered?: DiscoveredLead[];
}

const rub = (n: number) => Math.round(n);
const num = (order: Order) => Number(order.id.replace(/\D/g, "")) || 0;
const zoneOf = (days: number): AiDebtor["zone"] =>
  days >= DEBT_DANGER_DAYS ? "danger" : days >= DEBT_WARN_DAYS ? "warn" : "fresh";

/* ── Сезонность: месяц → сезон → что предлагать ──────────── */

const RU_MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

function seasonOf(monthIndex: number): AiSeasonality["season"] {
  if (monthIndex === 11 || monthIndex <= 1) return "зима";
  if (monthIndex <= 4) return "весна";
  if (monthIndex <= 7) return "лето";
  return "осень";
}

const SEASON_HINT: Record<AiSeasonality["season"], string> = {
  зима: "Спрос на соленья и заготовки, горячее меню растёт — предлагай соленья и сырные соусы к фри; масло для фритюра меняют чаще (жарка интенсивнее).",
  весна: "Сезон шаурмы разгоняется — свежая зелень и овощи в тему; хорошее время подсадить клиентов на соусы к летнему пику.",
  лето: "Пик зелени, овощей и лёгких соусов; туристический трафик — фри берут больше, следи за остатками попутных позиций.",
  осень: "Возврат к горячему меню: сырные и чесночные соусы растут, напомни клиентам про заготовку солений к зиме.",
};

/** Собирает снимок бизнеса для системного промпта ИИ. */
export function buildAiContext({
  clients,
  orders,
  movements,
  regions,
  products = [],
  calls = [],
  discovered = [],
}: AiContextDeps): AiContext {
  const now = Date.now();

  /* Склад: приход минус все списания. */
  const packs = movements.reduce(
    (sum, m) => sum + (m.type === "in" ? m.quantityPacks : -m.quantityPacks),
    0
  );
  const kg = Math.round(packs * PACK_KG * 10) / 10;

  /* Расход за 30 дней по заказам (упаковки → кг). */
  const from30d = now - 30 * 86_400_000;
  const shipped = orders.filter((o) => !o.isDraft && new Date(o.createdAt).getTime() >= from30d);
  const outKg30 = shipped.reduce((sum, o) => sum + o.boxesCount * PACK_KG, 0);
  const outflowKgPerDay = Math.round((outKg30 / 30) * 10) / 10;
  const daysLeft = outflowKgPerDay > 0 ? Math.floor(kg / outflowKgPerDay) : null;

  /* Дебиторка: не-черновики без оплаты, старые сверху. */
  const debtors: AiDebtor[] = orders
    .filter((o) => !o.isDraft && !o.isPaid)
    .map((o) => ({
      name: o.clientName,
      amountRub: o.totalAmount,
      days: Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 86_400_000)),
      order: num(o),
      zone: zoneOf(Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 86_400_000))),
    }))
    .sort((a, b) => b.days - a.days);

  /* Выручка и маржа за 30 дней. */
  const revenue = shipped.reduce((s, o) => s + o.totalAmount, 0);
  const boxes = shipped.reduce((s, o) => s + o.boxesCount, 0);
  const cost = shipped.reduce((s, o) => s + o.boxesCount * PACK_KG * COST_PER_KG, 0);

  /* Лиды: холодные и недозвоны по районам. */
  const leadClients = clients.filter(
    (c) => c.status === "cold" || c.status === "no_answer"
  );
  const byDistrict = new Map<string, number>();
  for (const c of leadClients) {
    byDistrict.set(c.district, (byDistrict.get(c.district) ?? 0) + 1);
  }

  /* Регионы: оптовики юга фурами (если стор передан). */
  const regionsBlock: AiRegions | undefined = regions
    ? {
        partners: regions.length,
        tons: Math.round(regions.reduce((s, p) => s + p.volumeTons, 0) * 10) / 10,
        trucks: regions.filter((p) => p.status === "truck").length,
        tests: regions.filter((p) => p.status === "test").length,
        byCity: (() => {
          const byCity = new Map<string, { city: string; partners: number; tons: number }>();
          for (const p of regions) {
            const city = byCity.get(p.city) ?? { city: p.city, partners: 0, tons: 0 };
            city.partners++;
            city.tons = Math.round((city.tons + p.volumeTons) * 10) / 10;
            byCity.set(p.city, city);
          }
          return [...byCity.values()].sort((a, b) => b.tons - a.tons);
        })(),
        top: [...regions]
          .sort((a, b) => b.volumeTons - a.volumeTons)
          .slice(0, 5)
          .map((p) => ({
            company: p.company,
            city: p.city,
            volumeTons: p.volumeTons,
            status:
              p.status === "truck" ? "Фура" : p.status === "test" ? "Тест" : "Первый контакт",
          })),
      }
    : undefined;

  /* ── Задача 10: последние 10 заказов с попутными позициями ── */
  const shippedAll = orders.filter((o) => !o.isDraft);
  const recentOrders: AiRecentOrder[] = [...shippedAll]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 10)
    .map((o) => ({
      client: o.clientName,
      date: o.createdAt.slice(0, 10),
      sumRub: o.totalAmount + crossSellSum(o.items),
      boxes: o.boxesCount,
      items: (o.items ?? []).map((i) => `${i.name} ×${i.qty}`),
      crossSellRub: crossSellSum(o.items),
    }));

  /* ── Задача 10: паттерны клиентов — интервал, чек, только фри ── */
  const byClient = new Map<string, Order[]>();
  for (const o of shippedAll) {
    const list = byClient.get(o.clientId) ?? [];
    list.push(o);
    byClient.set(o.clientId, list);
  }

  const clientPatterns: AiClientPattern[] = clients
    .map((c) => {
      const mine = (byClient.get(c.id) ?? []).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      if (mine.length === 0) return null;

      /* Интервалы между заказами → среднее, дней. */
      const times = mine.map((o) => new Date(o.createdAt).getTime());
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) {
        gaps.push((times[i] - times[i - 1]) / 86_400_000);
      }
      const avgIntervalDays =
        gaps.length > 0
          ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10
          : null;

      const last = times[times.length - 1];
      const daysSinceLastOrder = Math.max(
        0,
        Math.floor((now - last) / 86_400_000)
      );
      const avgCheckRub =
        Math.round(
          mine.reduce(
            (s, o) => s + o.totalAmount + crossSellSum(o.items),
            0
          ) / mine.length
        );

      return {
        name: c.name,
        tier: c.priorityTier,
        segment: CLIENT_TYPE_LABEL[c.type],
        ordersCount: mine.length,
        avgIntervalDays,
        daysSinceLastOrder,
        avgCheckRub,
        interests: (c.interests ?? []).map(
          (cat: ProductCategory) =>
            PRODUCT_CATEGORY_LABEL[cat].toLowerCase()
        ),
        onlyFries: mine.every((o) => (o.items ?? []).length === 0),
        overdue:
          avgIntervalDays !== null && daysSinceLastOrder > avgIntervalDays,
      } satisfies AiClientPattern;
    })
    .filter((p): p is AiClientPattern => p !== null)
    /* «Назревшие» сверху — их ИИ зовёт в первую очередь. */
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        b.daysSinceLastOrder - a.daysSinceLastOrder
    );

  /* ── Задача 10: сезонность ── */
  const today = new Date();
  const season = seasonOf(today.getMonth());
  const seasonality: AiSeasonality = {
    month: RU_MONTHS[today.getMonth()],
    season,
    hint: SEASON_HINT[season],
  };

  /* ── Задача 10: каталог попутных + продажи за 30 дней ── */
  const crossSellLast30 = shippedAll.filter(
    (o) => new Date(o.createdAt).getTime() >= from30d && (o.items ?? []).length > 0
  );
  const crossSell: AiCrossSell = {
    products: products.map((p) => ({
      name: p.name,
      category: PRODUCT_CATEGORY_LABEL[p.category].toLowerCase(),
      priceRub: p.price,
      costRub: p.cost,
      marginRub: p.price - p.cost,
      marginPct: p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0,
      stock: p.stock,
      unit: p.unit,
    })),
    last30Rub: rub(crossSellLast30.reduce((s, o) => s + crossSellSum(o.items), 0)),
    last30Orders: crossSellLast30.length,
  };

  /* ── Задача 11: разведка + новые точки ── */
  const calledIds = new Set(calls.map((c) => c.clientId));
  const newPoints = clients.filter((c) => daysSince(c.createdAt) < 7);
  const discovery: AiDiscovery = {
    pendingLeads: discovered.filter((l) => l.status === "pending").length,
    approvedLeads: discovered.filter((l) => l.status === "approved").length,
    newPoints7d: newPoints.length,
    uncalledNewPoints: newPoints
      .filter((c) => !calledIds.has(c.id))
      .map((c) => ({
        name: c.name,
        tier: c.priorityTier,
        segment: CLIENT_TYPE_LABEL[c.type],
        daysOld: daysSince(c.createdAt),
      }))
      .sort((a, b) => a.daysOld - b.daysOld),
  };

  return {
    today: new Date().toISOString().slice(0, 10),
    stock: {
      kg,
      packs,
      lowStockKg: LOW_STOCK_KG,
      isLow: kg < LOW_STOCK_KG,
      outflowKgPerDay,
      daysLeft,
    },
    receivables: {
      totalRub: rub(debtors.reduce((s, d) => s + d.amountRub, 0)),
      debtors,
    },
    orders: {
      last30: {
        count: shipped.length,
        revenueRub: rub(revenue),
        boxes,
        marginRub: rub(revenue - cost),
      },
      drafts: orders.filter((o) => o.isDraft).length,
    },
    leads: {
      cold: clients.filter((c) => c.status === "cold").length,
      noAnswer: clients.filter((c) => c.status === "no_answer").length,
      total: leadClients.length,
      byDistrict: [...byDistrict.entries()]
        .map(([district, count]) => ({ district, count }))
        .sort((a, b) => b.count - a.count),
      withPhone: leadClients.filter((c) => c.phone).length,
    },
    clients: {
      total: clients.length,
      green: clients.filter((c) => c.priorityTier === "green").length,
      yellow: clients.filter((c) => c.priorityTier === "yellow").length,
      red: clients.filter((c) => c.priorityTier === "red").length,
      chains: [...new Set(clients.filter((c) => c.chainName).map((c) => c.chainName as string))],
    },
    regions: regionsBlock,
    recentOrders,
    clientPatterns,
    seasonality,
    crossSell,
    discovery,
    pricing: {
      wholesalePerBox: PRICE_PER_PACK,
      wholesalePerKg: Math.round((PRICE_PER_PACK / PACK_KG) * 10) / 10,
      smallWholesalePerBox: SMALL_WHOLESALE_PRICE_PER_PACK,
      smallWholesalePerKg: Math.round((SMALL_WHOLESALE_PRICE_PER_PACK / PACK_KG) * 10) / 10,
      costPerKg: COST_PER_KG,
      minWholesaleBoxes: MIN_WHOLESALE_BOXES,
      trialPrice: TRIAL_PRICE,
      packKg: PACK_KG,
    },
    thresholds: { debtWarnDays: DEBT_WARN_DAYS, debtDangerDays: DEBT_DANGER_DAYS },
  };
}

/* ── Форматирование цифр для ответов ─────────────────────── */

export const fmtRub = (n: number) => `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₽`;
export const fmtKg = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} кг`;

export const ZONE_LABEL: Record<AiDebtor["zone"], string> = {
  fresh: "жёлтая зона",
  warn: "оранжевая зона",
  danger: "красная зона",
};
