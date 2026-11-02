import {
  COST_PER_KG,
  DEBT_DANGER_DAYS,
  DEBT_WARN_DAYS,
  LOW_STOCK_KG,
  MIN_WHOLESALE_BOXES,
  PACK_KG,
  PRICE_PER_PACK,
  SMALL_WHOLESALE_PRICE_PER_PACK,
  TRIAL_PRICE,
  type Client,
  type InventoryMovement,
  type Order,
  type Payment,
  type RegionalPartner,
} from "@/types/models";

/**
 * Сборщик контекста для ИИ-Директора.
 *
 * Перед каждым запросом собирает живые цифры из CRM-стора: склад,
 * дебиторку с возрастом, холодные лиды по районам, выручку и маржу
 * за 30 дней. ИИ видит ровно то же, что видит владелец, — поэтому
 * отвечает делом, а не общими словами.
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
}

const rub = (n: number) => Math.round(n);
const num = (order: Order) => Number(order.id.replace(/\D/g, "")) || 0;
const zoneOf = (days: number): AiDebtor["zone"] =>
  days >= DEBT_DANGER_DAYS ? "danger" : days >= DEBT_WARN_DAYS ? "warn" : "fresh";

/** Собирает снимок бизнеса для системного промпта ИИ. */
export function buildAiContext({
  clients,
  orders,
  movements,
  regions,
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
