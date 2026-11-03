"use client";

import { useEffect } from "react";

import { buildAiContext } from "@/lib/ai-context";
import { nextAdvicePrompt } from "@/lib/ai-prompts";
import { offlineAnswer } from "@/lib/ai-offline";
import { useAdviceStore, type AdviceRecord } from "@/lib/advice-store";
import { useCrmStore } from "@/lib/clients-store";
import { useDiscoveryStore } from "@/lib/discovery-store";
import { useOrdersStore } from "@/lib/orders-store";
import { useProductsStore } from "@/lib/products-store";
import { useRegionsStore } from "@/lib/regions-store";
import { useSettingsStore } from "@/lib/settings-store";
import { daysSince } from "@/types/models";

/**
 * Проактивный Мозг (задача 7).
 *
 * Двигатель умных триггеров:
 *  • следит за активностью: document.visibilityState + бездействие
 *    30 минут (тапы, скролл, клавиши, возвращение во вкладку);
 *  • раз в N часов (2/3/4 — из настроек) генерирует совет из банка
 *    20 промптов с ротацией;
 *  • пользователь активен → совет появляется в виджете на Дашборде;
 *  • пользователь неактивен (вкладка свёрнута) → ИИ проверяет ответ
 *    на критичность («просрочка», «склад заканчивается», «срочно»)
 *    и критичный отправляет в Telegram через серверный роут —
 *    токен живёт только на сервере, клиент его не видит;
 *  • раз в час спрашивает у сервера, не пора ли сделать автопост
 *    в группы (интервал 2/3/7 дней, проверка на сервере).
 */

/** Бездействие дольше этого — пользователь «ушёл». */
export const INACTIVITY_MS = 30 * 60_000;

/** Проверка триггеров — раз в минуту. */
const TICK_MS = 60_000;

/** Пинг автопостинга — раз в час (дедлайн считает сервер). */
const AUTOPOST_PING_MS = 60 * 60_000;

/**
 * Критичность совета: «просрочка», «склад заканчивается», «срочно»
 * и близкие формулировки («ниже порога», «красная зона склада»).
 */
export function isCriticalText(text: string): boolean {
  return /просроч|заканчив|срочн|ниже порога|красная зон|пора заказыв/i.test(
    text
  );
}

/** Активен ли пользователь: вкладка видима И было взаимодействие за 30 минут. */
export function isUserActive(lastActivityAt: number): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible") return false;
  return Date.now() - lastActivityAt < INACTIVITY_MS;
}

/** Живой контекст бизнеса из всех сторов — для ИИ и офлайн-мозга. */
export function currentAiContext() {
  const crm = useCrmStore.getState();
  const deals = useOrdersStore.getState();
  const regions = useRegionsStore.getState().partners;
  const products = useProductsStore.getState().products;
  const discovered = useDiscoveryStore.getState().leads;
  return buildAiContext({
    clients: crm.clients,
    orders: deals.orders,
    movements: deals.movements,
    payments: deals.payments,
    regions,
    products,
    calls: crm.calls,
    discovered,
  });
}

/** Чистка ответа модели: без markdown-звёздочек в виджете и Telegram. */
function cleanAdviceText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/^#{1,4}\s*/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Контекст критичного алерта (задача 25): самый проблемный
 *  неоплаченный заказ + телефон клиента из CRM — для кнопок
 *  «📞 Позвонить / 💬 Напомнить / ✅ Оплачено» в Telegram. */
function criticalOrderContext(): {
  orderId: string;
  externalId?: string;
  client: { id: string; name: string; phone: string };
  debt: { amount: number; days: number };
} | null {
  try {
    const deals = useOrdersStore.getState();
    const crm = useCrmStore.getState();
    const worst = deals.orders
      .filter((o) => !o.isDraft && !o.isPaid)
      .map((o) => ({ o, days: daysSince(o.createdAt) }))
      .sort((a, b) => b.days - a.days || b.o.totalAmount - a.o.totalAmount)[0];
    if (!worst) return null;
    const client = crm.clients.find((c) => c.id === worst.o.clientId);
    return {
      orderId: worst.o.id,
      ...(worst.o.externalId ? { externalId: worst.o.externalId } : {}),
      client: {
        id: worst.o.clientId,
        name: worst.o.clientName,
        phone: client?.phone ?? "",
      },
      debt: { amount: worst.o.totalAmount, days: worst.days },
    };
  } catch {
    return null;
  }
}

/**
 * Генерация одного совета из банка промптов.
 *
 * manual: true — по кнопке «Обновить» (пользователь активен,
 * в Telegram не дублируем). inactive: true — триггер сработал,
 * пока пользователь был неактивен: критичный совет уходит в Telegram.
 */
export async function generateAdvice(
  opts: { manual?: boolean; inactive?: boolean } = {}
): Promise<AdviceRecord | null> {
  const advice = useAdviceStore.getState();
  if (advice.generating) return advice.last;

  const prompt = nextAdvicePrompt(advice.promptIndex);
  advice.setGenerating(true);

  try {
    const context = currentAiContext();
    const charter = useSettingsStore.getState().ai.charter;

    /* Живой мозг — серверный роут (ZAI с офлайн-фолбэком внутри). */
    let text = "";
    let source: AdviceRecord["source"] = "offline";
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          history: [{ role: "user", content: prompt.text }],
          charter,
          mode: "advice",
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          reply?: string;
          source?: "zai" | "offline";
        };
        if (data.reply) {
          text = cleanAdviceText(data.reply);
          source = data.source === "zai" ? "zai" : "offline";
        }
      }
    } catch {
      /* сеть подвела — ответит офлайн-мозг ниже */
    }
    if (!text) text = cleanAdviceText(offlineAnswer(prompt.text, context));

    const critical = isCriticalText(text);
    const inactive = Boolean(opts.inactive) && !opts.manual;

    /* Пользователь неактивен, а совет горит — эскортируем в Telegram.
     * Задача 25: с контекстом долга — 🚨-алерт с кнопками «Позвонить /
     * Напомнить / Оплачено»; без контекста — просто текст. */
    let sentToTelegram = false;
    if (critical && inactive) {
      try {
        const ctx = criticalOrderContext();
        const r = await fetch("/api/telegram/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            ctx ? { kind: "critical", ...ctx } : { text: `⚠️ ${text}` }
          ),
        });
        const j = (await r.json()) as { ok?: boolean };
        sentToTelegram = Boolean(j.ok);
      } catch {
        sentToTelegram = false;
      }
    }

    const record: AdviceRecord = {
      text,
      category: prompt.category,
      critical,
      sentToTelegram,
      source,
      trigger: opts.manual ? "manual" : "auto",
      inactive,
      createdAt: new Date().toISOString(),
    };
    useAdviceStore.getState().setAdvice(record, prompt.id);
    return record;
  } finally {
    useAdviceStore.getState().setGenerating(false);
  }
}

/** Пинг автопостинга: сервер сам решает, пора ли (lastPostAt + интервал). */
async function pingAutopost() {
  try {
    const deals = useOrdersStore.getState();
    const packs = deals.movements.reduce(
      (sum, m) => sum + (m.type === "in" ? m.quantityPacks : -m.quantityPacks),
      0
    );
    const res = await fetch("/api/telegram/autopost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        force: false,
        stockKg: Math.round(packs * 25) / 10,
        stockPacks: packs,
      }),
    });
    const j = (await res.json()) as { posted?: number };
    /* опубликовано молча: текст потом виден в группах и в статусе настроек */
    void j;
  } catch {
    /* фоновая задача — тихо ждём следующего часа */
  }
}

/**
 * Хук движка триггеров. Монтируется один раз в AppShell.
 *
 * Активность: pointerdown / keydown / wheel / touchstart / focus
 * + visibilitychange. Проверка — раз в минуту: если с прошлого
 * совета прошло больше интервала и советы включены — генерируем.
 */
export function useAiTriggers() {
  const hydrated = useSettingsStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;

    let lastActivityAt = Date.now();
    let lastAutopostPing = 0;

    const onActivity = () => {
      lastActivityAt = Date.now();
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "focus",
    ];
    for (const e of events) {
      window.addEventListener(e, onActivity, { passive: true });
    }

    const tick = () => {
      const now = Date.now();

      /* Автопост: раз в час спрашиваем сервер, не вышел ли срок. */
      if (now - lastAutopostPing > AUTOPOST_PING_MS) {
        lastAutopostPing = now;
        void pingAutopost();
      }

      /* Проактивные советы: интервал из настроек (2/3/4 часа). */
      const settings = useSettingsStore.getState();
      const advice = useAdviceStore.getState();
      if (!settings.ai.proactive) return;
      if (advice.generating) return;
      if (now - advice.lastGeneratedAt < settings.ai.intervalHours * 3_600_000)
        return;

      const inactive = !isUserActive(lastActivityAt);
      void generateAdvice({ inactive });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastActivityAt = Date.now();
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void tick();
    const iv = setInterval(tick, TICK_MS);

    return () => {
      clearInterval(iv);
      for (const e of events) {
        window.removeEventListener(e, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated]);
}
