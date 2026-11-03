"use client";

import type { Call, Client } from "@/types/models";

/**
 * Календарь перезвонов (задача 24).
 *
 * «Перезвонить позже» в журнале звонков сохраняет дату (Call.callbackDate).
 * Здесь она превращается в items календаря: просроченные, сегодня, завтра
 * и неделя вперёд. Источник — живой журнал звонков CRM-стора.
 *
 * Правило «актуальности»: берём ПОСЛЕДНИЙ звонок клиента с результатом
 * «Перезвонить позже» и датой. Если после него был другой результат
 * (проба/отказ/недозвон без новой даты) — дата неактуальна и в календарь
 * не попадает: свежий исход перекрывает старое обещание.
 */

export interface CallbackItem {
  /** id звонка, назначившего перезвон. */
  callId: string;
  clientId: string;
  clientName: string;
  phone: string;
  /** Дата перезвона yyyy-MM-dd. */
  date: string;
  /** true — дата уже прошла, а результата нет. */
  overdue: boolean;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export function todayIso(): string {
  return isoDay(new Date());
}

/** Все актуальные перезвоны, отсортированные по дате. */
export function collectCallbacks(
  clients: Client[],
  calls: Call[],
  today = todayIso()
): CallbackItem[] {
  const byClient = new Map<string, Call>();
  /* Последний «callback»-звонок каждого клиента с датой. */
  for (const call of calls) {
    if (call.result !== "callback" || !call.callbackDate) continue;
    const prev = byClient.get(call.clientId);
    if (
      !prev ||
      call.createdAt > prev.createdAt ||
      (call.createdAt === prev.createdAt && (call.callbackDate ?? "") >= (prev.callbackDate ?? ""))
    ) {
      byClient.set(call.clientId, call);
    }
  }

  const clientById = new Map(clients.map((c) => [c.id, c] as const));
  const items: CallbackItem[] = [];
  for (const [clientId, call] of byClient) {
    const client = clientById.get(clientId);
    if (!client) continue; // клиент удалён — перезвон неактуален
    /* Статус воронки сменился (проба/отказ) — обещание перезвона снято. */
    if (client.status !== "callback") continue;
    items.push({
      callId: call.id,
      clientId,
      clientName: client.name,
      phone: client.phone ?? "",
      date: call.callbackDate as string,
      overdue: (call.callbackDate as string) < today,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  return items;
}

/** Группировка для календаря: [ключ, название, items]. */
export interface CallbackDay {
  /** yyyy-MM-dd (для «Просрочено» — фиктивный "overdue"). */
  key: string;
  /** Заголовок группы: «Просрочено», «Сегодня», «Вторник, 4 ноября»… */
  label: string;
  date?: string;
  items: CallbackItem[];
}

const WEEKDAY_LABEL = [
  "воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота",
];

export function groupCallbacks(
  items: CallbackItem[],
  now = new Date()
): CallbackDay[] {
  const today = isoDay(now);
  const tomorrow = isoDay(new Date(now.getTime() + 86_400_000));

  const overdue: CallbackItem[] = [];
  const days = new Map<string, CallbackItem[]>();

  for (const it of items) {
    if (it.date < today) {
      overdue.push(it);
    } else {
      const list = days.get(it.date) ?? [];
      list.push(it);
      days.set(it.date, list);
    }
  }

  const out: CallbackDay[] = [];
  if (overdue.length > 0) {
    out.push({ key: "overdue", label: "Просрочено", items: overdue });
  }

  /* Неделя вперёд: сегодня, завтра, +2…+7 — только дни с перезвонами. */
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now.getTime() + offset * 86_400_000);
    const key = isoDay(d);
    const list = days.get(key);
    if (!list || list.length === 0) continue;
    const label =
      offset === 0
        ? "Сегодня"
        : offset === 1
          ? "Завтра"
          : `${WEEKDAY_LABEL[d.getDay()].replace(/^./, (c) => c.toUpperCase())}, ${d.getDate()} ${
              d.toLocaleDateString("ru-RU", { month: "long" }).replace(/я$/, "я")
            }`;
    out.push({ key, label, date: key, items: list });
  }
  return out;
}

/** Сводка для виджета дашборда и заголовка календаря. */
export function callbacksSummary(items: CallbackItem[], now = new Date()) {
  const today = isoDay(now);
  const tomorrow = isoDay(new Date(now.getTime() + 86_400_000));
  let todayCount = 0;
  let tomorrowCount = 0;
  let overdueCount = 0;
  let weekCount = 0;
  for (const it of items) {
    if (it.date < today) {
      overdueCount++;
      weekCount++;
    } else if (it.date === today) {
      todayCount++;
      weekCount++;
    } else if (it.date === tomorrow) {
      tomorrowCount++;
      weekCount++;
    } else if (it.date <= isoDay(new Date(now.getTime() + 7 * 86_400_000))) {
      weekCount++;
    }
  }
  return { todayCount, tomorrowCount, overdueCount, weekCount };
}
