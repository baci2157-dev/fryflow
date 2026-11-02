import {
  DEFAULT_ORDER_FREQUENCY,
  type Client,
} from "@/types/models";

/**
 * Health Score клиента — здоровье отношений, 0–100.
 *
 * Формула: база 100, минус штрафы:
 *  — просрочка от ожидаемой даты заказа:
 *      дни 1–7 → −5/день, дни 8–14 → −10/день, 15+ → −15/день
 *      (шкала накопительная: первые 7 дней по −5, следующие 7 по −10…);
 *  — отсутствие заказов больше 30 дней → −20;
 *  — статус «Отказ» → −30.
 *
 * Оценка «null» = истории заказов нет (новый или холодный лид) —
 * в интерфейсе показываем прочерк, а не обманчивую сотню.
 *
 * Цвет: 80+ — зелёный, 50–79 — жёлтый, ниже 50 — красный.
 */

export interface HealthBreakdown {
  /** Итоговая оценка или null, если истории заказов нет. */
  score: number | null;
  /** Дней с последнего заказа. */
  daysSinceLastOrder: number | null;
  /** Ожидаемая частота заказов, дней. */
  frequencyDays: number;
  /** Дни просрочки от ожидаемой даты заказа. */
  overdueDays: number;
  /** Разбор штрафов, ₽… то есть очков. */
  overduePenalty: number;
  noOrdersPenalty: number;
  refusedPenalty: number;
  /** Человекочитаемое объяснение для карточки клиента. */
  summary: string;
}

const MS_PER_DAY = 86_400_000;

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY));
}

/** Накопительный штраф за просрочку: 1–7 → 5/день, 8–14 → 10/день, 15+ → 15/день. */
export function overduePenalty(days: number): number {
  if (days <= 0) return 0;
  const tier1 = Math.min(days, 7); // дни 1–7
  const tier2 = Math.min(Math.max(days - 7, 0), 7); // дни 8–14
  const tier3 = Math.max(days - 14, 0); // 15+
  return tier1 * 5 + tier2 * 10 + tier3 * 15;
}

export function calcHealthScore(
  client: Client,
  now: Date = new Date()
): HealthBreakdown {
  const frequencyDays =
    client.orderFrequencyDays ?? DEFAULT_ORDER_FREQUENCY[client.type] ?? 7;

  // Нет истории заказов — оценки нет.
  if (!client.lastOrderAt) {
    return {
      score: null,
      daysSinceLastOrder: null,
      frequencyDays,
      overdueDays: 0,
      overduePenalty: 0,
      noOrdersPenalty: 0,
      refusedPenalty: 0,
      summary: "Истории заказов пока нет — сначала звонок и проба.",
    };
  }

  const days = daysSince(client.lastOrderAt, now);
  const overdueDays = Math.max(0, days - frequencyDays);
  const odPenalty = overduePenalty(overdueDays);
  const noOrdersPenalty = days > 30 ? 20 : 0;
  const refusedPenalty = client.status === "refused" ? 30 : 0;
  const score = Math.max(
    0,
    Math.min(100, 100 - odPenalty - noOrdersPenalty - refusedPenalty)
  );

  const parts: string[] = [`последний заказ ${days} дн. назад`];
  if (overdueDays > 0) parts.push(`просрочка ${overdueDays} дн. (−${odPenalty})`);
  if (noOrdersPenalty) parts.push("нет заказов больше 30 дней (−20)");
  if (refusedPenalty) parts.push("отказ (−30)");

  return {
    score,
    daysSinceLastOrder: days,
    frequencyDays,
    overdueDays,
    overduePenalty: odPenalty,
    noOrdersPenalty,
    refusedPenalty,
    summary: parts.join(" · "),
  };
}

/** CSS-переменная цвета оценки: 80+ зелёный, 50–79 жёлтый, ниже 50 красный. */
export function healthColorVar(score: number): string {
  if (score >= 80) return "var(--tier-green)";
  if (score >= 50) return "var(--tier-yellow)";
  return "var(--tier-red)";
}

/** Клиент «в зоне риска»: приоритет red или оценка ниже 50. */
export function isAtRisk(client: Client, now: Date = new Date()): boolean {
  if (client.priorityTier === "red") return true;
  const { score } = calcHealthScore(client, now);
  return score !== null && score < 50;
}
