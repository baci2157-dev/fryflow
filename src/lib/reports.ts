"use client";

import { collectCallbacks } from "@/lib/callbacks";
import { useCrmStore } from "@/lib/clients-store";
import { calcHealthScore } from "@/lib/health-score";
import { debtDays, debtOrders, useOrdersStore } from "@/lib/orders-store";
import { COST_PER_KG, PACK_KG } from "@/types/models";

/**
 * Отчёты и синхронизация (задача 24).
 *
 * Цифры недели считаются на клиенте — localStorage PWA остаётся
 * единственным источником правды. Отчёт для владельца:
 *   • «Показать отчёт» в Настройках → Отчёты (Мозг добавляет выводы);
 *   • cron воскресенье 18:00 — тот же билдер на сервере по снапшоту.
 *
 * syncTelegramSnapshot() — молчаливая отправка снимка на сервер
 * (перезвоны на неделю + цифры недели + остатки): утренний дайджест 9:00
 * и воскресный отчёт собираются из него. Троттлинг — раз в 15 минут,
 * офлайн — молча пропускаем (следующее открытие приложения догонит).
 */

const SYNC_THROTTLE_MS = 15 * 60_000;
const SYNC_KEY = "fryflow-snapshot-synced-at";

export interface WeeklyStatsInput {
  periodStart: string;
  periodEnd: string;
  revenue: number;
  margin: number;
  marginPct: number;
  ordersCount: number;
  newClients: number;
  topDeals: Array<{ clientName: string; amount: number }>;
  problemClients: Array<{ clientName: string; reason: string }>;
  stockKg: number;
  stockPacks: number;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const fmtDay = (d: Date) =>
  d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

/** Цифры за последние 7 дней: выручка, маржа, новые, топ-5, проблемные. */
export function buildWeeklyStats(now = new Date()): WeeklyStatsInput {
  const clients = useCrmStore.getState().clients;
  const calls = useCrmStore.getState().calls;
  const orders = useOrdersStore.getState().orders;
  const movements = useOrdersStore.getState().movements;

  const weekAgo = now.getTime() - 7 * 86_400_000;
  const periodStart = isoDay(new Date(weekAgo));
  const periodEnd = isoDay(now);

  /* Заказы недели (не черновики): выручка + маржа (закупка 100 ₽/кг). */
  const weekOrders = orders.filter(
    (o) => !o.isDraft && new Date(o.createdAt).getTime() >= weekAgo
  );
  const revenue = weekOrders.reduce((s, o) => s + o.totalAmount, 0);
  const cost = weekOrders.reduce(
    (s, o) => s + o.boxesCount * PACK_KG * COST_PER_KG,
    0
  );
  const margin = revenue - cost;

  /* Новые клиенты за неделю. */
  const newClients = clients.filter(
    (c) => new Date(c.createdAt).getTime() >= weekAgo
  ).length;

  /* Топ-5 сделок недели. */
  const topDeals = [...weekOrders]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5)
    .map((o) => ({ clientName: o.clientName, amount: o.totalAmount }));

  /* Проблемные: просрочка оплаты 15+ дней; отток (Health Score < 50
   * или нет заказов > 30 дней при曾是 активности). */
  const problemClients: Array<{ clientName: string; reason: string }> = [];
  for (const o of debtOrders(orders)) {
    const days = debtDays(o);
    if (days >= 15) {
      problemClients.push({
        clientName: o.clientName,
        reason: `долг ${days} дн., ${o.totalAmount.toLocaleString("ru-RU")} ₽`,
      });
    }
  }
  for (const c of clients) {
    const h = calcHealthScore(c);
    if (h.score !== null && h.score < 50) {
      problemClients.push({ clientName: c.name, reason: `Health Score ${h.score}` });
    }
  }
  const uniqueProblems = problemClients
    .filter(
      (p, i, arr) => arr.findIndex((x) => x.clientName === p.clientName) === i
    )
    .slice(0, 8);

  /* Остаток склада: приходы минус отгрузки. */
  const stockPacks = movements.reduce(
    (sum, m) => sum + (m.type === "in" ? m.quantityPacks : -m.quantityPacks),
    0
  );

  return {
    periodStart: fmtDay(new Date(weekAgo)),
    periodEnd: fmtDay(now),
    revenue,
    margin,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
    ordersCount: weekOrders.length,
    newClients,
    topDeals,
    problemClients: uniqueProblems,
    stockKg: Math.round(stockPacks * PACK_KG * 10) / 10,
    stockPacks,
  };
}

/** Молчаливая синхронизация снапшота на сервер (троттл 15 минут). */
export async function syncTelegramSnapshot(force = false): Promise<void> {
  try {
    if (!force) {
      const last = Number(localStorage.getItem(SYNC_KEY) ?? "0");
      if (Date.now() - last < SYNC_THROTTLE_MS) return;
    }
    localStorage.setItem(SYNC_KEY, String(Date.now()));

    const { clients, calls } = useCrmStore.getState();
    const addressById = new Map(clients.map((c) => [c.id, c.address] as const));
    const items = collectCallbacks(clients, calls);
    const callbacks = items
      .filter((i) => i.overdue || i.date <= isoDay(new Date(Date.now() + 7 * 86_400_000)))
      .slice(0, 60)
      .map((i) => ({
        clientName: i.clientName,
        phone: i.phone,
        ...(addressById.get(i.clientId) ? { address: addressById.get(i.clientId) } : {}),
        date: i.date,
        overdue: i.overdue,
      }));
    const stats = buildWeeklyStats();

    await fetch("/api/telegram/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callbacks, stats }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* офлайн / сервер недоступен — молча: догонит следующее открытие */
  }
}
