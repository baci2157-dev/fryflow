import { NextResponse } from "next/server";

import { chatCompletion } from "@/lib/ai-sdk";
import { handleCallbackQuery, notifyNewDraft } from "@/lib/telegram-callbacks";
import {
  addDraft,
  deleteTelegramWebhook,
  parseOrderRequest,
  readConfig,
  setTelegramWebhook,
  webhookSecret,
  writeConfig,
  type TelegramDraft,
} from "@/lib/telegram-server";
import { MIN_WHOLESALE_BOXES, PRICE_PER_PACK, SMALL_WHOLESALE_PRICE_PER_PACK } from "@/types/models";

/**
 * POST /api/telegram/webhook — приём апдейтов от Telegram (задача 24–25).
 *
 * Сюда Telegram присылает апдейты, когда вебхук зарегистрирован:
 *   • message — заявки клиентов: ИИ вытаскивает клиента, коробки и дату
 *     (ZAI, при сбое — офлайн-парсер) → черновик в базе → владельцу
 *     уведомление 🆕 с кнопками «Подтвердить / Отклонить», клиенту —
 *     автоответ ✅ без кнопок;
 *   • callback_query — нажатия inline-кнопок: confirm/reject (заявки),
 *     call (tel:), remind (напоминание об оплате), paid (оплачено),
 *     nav (разделы FryFlow) — см. lib/telegram-callbacks.ts.
 *
 * Регистрация вебхука — прямо отсюда (кнопка «Подключить вебхук»
 * в Настройках): POST { action: "connect" | "disconnect" }. Каждый
 * апдейт Telegram подписывает заголовком X-Telegram-Bot-Api-Secret-Token
 * (секрет TELEGRAM_WEBHOOK_SECRET) — подделать извне нельзя.
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
  callback_query?: {
    id: string;
    from?: TgUser;
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
      reply_markup?: {
        inline_keyboard?: Array<
          Array<{ text: string; callback_data?: string; url?: string }>
        >;
      };
    };
    data?: string;
  };
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

/** Сумма заявки: опт от 10 коробок — 300 ₽/уп, мелкий опт — 350 ₽. */
function draftTotal(boxes: number): number {
  return boxes * (boxes >= MIN_WHOLESALE_BOXES ? PRICE_PER_PACK : SMALL_WHOLESALE_PRICE_PER_PACK);
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

  const demo = Boolean(body.demo);

  /* ── Нажатие inline-кнопки (задача 25): confirm/reject/call/remind/paid/nav. */
  if (body.callback_query && !demo) {
    const cfg = await readConfig();
    if (!cfg.botToken) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const result = await handleCallbackQuery(cfg, body.callback_query);
    return NextResponse.json(result);
  }

  const msg = body.message;
  const text = msg?.text?.trim();
  if (!text) {
    /* Пустые апдейты (стикеры, фото) молча принимаем — Telegram
     * требует 200 OK, иначе он будет переотправлять вечно. */
    return NextResponse.json({ ok: true, ignored: true });
  }

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

  /* 3. Черновик заказа — «в базе», экран «Заказы» заберёт его.
   *    chatId клиента сохраняем: кнопка «Напомнить» сможет писать
   *    клиенту напрямую, если заказ станет просроченным. */
  const draft: TelegramDraft = {
    id: `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    clientName,
    boxes,
    deliveryDate,
    message: text,
    fromName,
    receivedAt: new Date().toISOString(),
    status: "pending",
    ...(msg?.chat?.id !== undefined ? { chatId: String(msg.chat.id) } : {}),
  };
  await addDraft(draft);

  /* 4. Уведомление владельцу (🆕 с кнопками) + автоответ клиенту (✅). */
  let notified = { ownerSent: false, clientSent: false, ownerMessageIds: [] as number[] };
  let notifyError: string | undefined;
  if (!demo) {
    const cfg = await readConfig();
    if (cfg.botToken && cfg.chatId) {
      const r = await notifyNewDraft(
        cfg,
        {
          id: draft.id,
          clientName: draft.clientName,
          boxes: draft.boxes,
          total: draftTotal(draft.boxes),
          deliveryDate: draft.deliveryDate,
          message: draft.message,
        },
        msg?.chat?.id !== undefined ? String(msg.chat.id) : undefined
      );
      notified = {
        ownerSent: r.ownerSent,
        clientSent: r.clientSent,
        ownerMessageIds: r.ownerMessageIds,
      };
      notifyError = r.ownerError;
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
    notified,
    ...(notifyError ? { notifyError } : {}),
  });
}
