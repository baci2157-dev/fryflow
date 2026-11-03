import { NextResponse } from "next/server";

import { chatCompletion } from "@/lib/ai-sdk";
import {
  addDraft,
  DRAFT_REPLY,
  deleteTelegramWebhook,
  parseOrderRequest,
  readConfig,
  sendTelegramMessage,
  setTelegramWebhook,
  webhookSecret,
  writeConfig,
  type TelegramDraft,
} from "@/lib/telegram-server";

/**
 * POST /api/telegram/webhook — приём входящих сообщений от клиентов.
 *
 * Сюда Telegram присылает апдейты (Business Mode или личные чаты
 * бота), когда вебхук зарегистрирован. Регистрация — прямо отсюда:
 *   POST { action: "connect" } → setWebhook на текущий домен
 *   (кнопка «Подключить вебхук» в Настройках; с секретным токеном
 *   TELEGRAM_WEBHOOK_SECRET — каждый апдейт Telegram подписывает
 *   заголовком X-Telegram-Bot-Api-Secret-Token, подделать извне нельзя).
 *   POST { action: "disconnect" } → deleteWebhook.
 *
 * Цепочка: сообщение клиента → ИИ вытаскивает клиента, количество
 * коробок и дату доставки (ZAI, при сбое — офлайн-парсер) →
 * «Черновик заказа» в базе (.data/telegram-drafts.json, его забирает
 * экран «Заказы» → «Черновики») → автоответ клиенту: «Заявку принял…».
 *
 * Демо-режим: POST { demo: true, message: { text, from } } —
 * имитация заявки для проверки парсинга без реального бота.
 */

export const runtime = "nodejs";

interface TgUser {
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgMessage {
  text?: string;
  from?: TgUser;
  chat?: { id?: number | string; title?: string };
}

interface TgUpdate {
  message?: TgMessage;
}

interface WebhookBody extends TgUpdate {
  /** true — симуляция заявки из «Настроек» (реальный бот не нужен). */
  demo?: boolean;
  /** connect — зарегистрировать вебхук (setWebhook), disconnect — снять. */
  action?: "connect" | "disconnect";
  /** Публичный URL вебхука (по умолчанию — домен запроса). */
  url?: string;
}

/** Попытка вытянуть заявку из текста живой моделью (строгий JSON). */
async function extractWithZai(text: string) {
  try {
    const { reply } = await chatCompletion({
      messages: [
        {
          role: "system",
          content: [
            "Ты — парсер заявок оптового поставщика картофеля фри (упаковка 2,5 кг, минимальный опт 10 уп.).",
            "Из сообщения клиента верни ТОЛЬКО JSON без пояснений:",
            '{"client": "имя клиента или компании (если не названо — пустая строка)", "boxes": <целое число коробок>, "deliveryDate": "YYYY-MM-DD"}',
            "Дата: «сегодня/завтра» отсчитывай от слова в сообщении как от сегодня; дни недели — ближайший будущий; не указана — завтра.",
            "Если объём в кг — раздели на 2,5 и округли. Если объём не назван — boxes = 10.",
            "Сегодня: " + new Date().toISOString().slice(0, 10) + ".",
            "",
            "Сообщение клиента: «" + text + "»",
          ].join("\n"),
        },
        {
          role: "user",
          content: "Разбери сообщение по правилам выше и верни только JSON.",
        },
      ],
      maxTokens: 500,
      temperature: 0.2,
    });
    const raw = reply?.trim() ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { client?: string; boxes?: number; deliveryDate?: string };
    if (parsed.boxes && parsed.boxes > 0 && parsed.boxes <= 5000) {
      return {
        boxes: Math.round(parsed.boxes),
        deliveryDate:
          /^\d{4}-\d{2}-\d{2}$/.test(parsed.deliveryDate ?? "")
            ? (parsed.deliveryDate as string)
            : undefined,
        clientName: parsed.client?.trim() || undefined,
        source: "zai" as const,
      };
    }
  } catch {
    /* живая модель недоступна — ниже офлайн-парсер */
  }
  return null;
}

export async function POST(request: Request) {
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный JSON" }, { status: 400 });
  }

  /* ── Управление вебхуком (задача 24): «Подключить вебхук» в Настройках. */
  if (body.action === "connect" || body.action === "disconnect") {
    const cfg = await readConfig();
    if (!cfg.botToken) {
      return NextResponse.json(
        { ok: false, error: "Сначала укажите Bot Token в настройках Telegram." },
        { status: 400 }
      );
    }
    if (body.action === "disconnect") {
      const r = await deleteTelegramWebhook(cfg.botToken);
      if (r.ok) await writeConfig({ webhookActive: false });
      return NextResponse.json(
        r.ok ? { ok: true, connected: false } : { ok: false, error: r.error },
        { status: r.ok ? 200 : 400 }
      );
    }
    const origin = body.url?.trim() || new URL(request.url).origin;
    const target = `${origin}/api/telegram/webhook`;
    const r = await setTelegramWebhook(cfg.botToken, target);
    if (r.ok) await writeConfig({ webhookActive: true });
    return NextResponse.json(
      r.ok
        ? { ok: true, connected: true, url: target, secret: Boolean(webhookSecret()) }
        : { ok: false, error: r.error },
      { status: r.ok ? 200 : 400 }
    );
  }

  /* ── Секрет вебхука: если TELEGRAM_WEBHOOK_SECRET задан, Telegram
   * подписывает каждый апдейт заголовком X-Telegram-Bot-Api-Secret-Token.
   * Не совпал — запрос не от Telegram, молча отбрасываем (200, чтобы
   * Telegram не переотправлял). */
  const secret = webhookSecret();
  if (secret && !body.demo) {
    const got =
      request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (got !== secret) {
      return NextResponse.json({ ok: true, ignored: true });
    }
  }

  const msg = body.message;
  const text = msg?.text?.trim();
  if (!text) {
    /* Пустые апдейты (стикеры, фото) молча принимаем — Telegram
     * требует 200 OK, иначе он будет переотправлять вечно. */
    return NextResponse.json({ ok: true, ignored: true });
  }

  const demo = Boolean(body.demo);

  /* Кто писал: имя из Telegram или название группы. */
  const fromParts = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean);
  const fromName =
    msg?.chat?.title || (fromParts.length ? fromParts.join(" ") : msg?.from?.username) ||
    "Клиент из Telegram";

  /* 1. ИИ-извлечение: клиент, коробки, дата доставки.
   *    Явная дата в тексте (сегодня/завтра/день недели/дд.мм) — верим
   *    детерминированному парсеру; объём и имя клиента у ИИ выходят
   *    лучше (понимает числительные прописью). */
  const offline = parseOrderRequest(text);
  const ai = demo ? null : await extractWithZai(text);
  const hasExplicitDate =
    /(сегодня|послезавтра|завтра|понедельник|вторник|сред[уа]|четверг|пятниц|суббот|воскресенье|\d{1,2}\s*[.]\s*\d{1,2})/i.test(
      text
    );
  const boxes = ai?.boxes ?? offline.boxes;
  const deliveryDate = hasExplicitDate
    ? offline.deliveryDate
    : (ai?.deliveryDate ?? offline.deliveryDate);

  /* 2. Имя клиента: из текста (ИИ) или из Telegram-профиля. */
  const clientName = ai?.clientName || fromName;

  /* 3. Черновик заказа — «в базе», экран «Заказы» заберёт его. */
  const draft: TelegramDraft = {
    id: `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    clientName,
    boxes,
    deliveryDate,
    message: text,
    fromName,
    receivedAt: new Date().toISOString(),
  };
  await addDraft(draft);

  /* 4. Автоответ клиенту + отметка, что вебхук живой. */
  let replySent = false;
  let replyError: string | undefined;
  if (!demo) {
    const cfg = await readConfig();
    if (cfg.botToken && msg?.chat?.id !== undefined) {
      const r = await sendTelegramMessage(
        cfg.botToken,
        String(msg.chat.id),
        DRAFT_REPLY
      );
      replySent = r.ok;
      replyError = r.error;
    }
    if (!cfg.webhookActive) {
      await writeConfig({ webhookActive: true });
    }
  }

  return NextResponse.json({
    ok: true,
    draft,
    parsed: {
      boxes,
      deliveryDate,
      confident: offline.confident,
      engine: ai ? "zai" : "offline",
    },
    reply: DRAFT_REPLY,
    replySent,
    replyError,
  });
}
