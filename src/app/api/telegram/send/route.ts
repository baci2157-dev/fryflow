import { NextResponse } from "next/server";

import {
  addAlert,
  findDraft,
  getMe,
  readConfig,
  sendTgMessage,
} from "@/lib/telegram-server";
import {
  buildCriticalAlert,
  buildCriticalTextAlert,
  buildTestMessage,
  type TgMessage,
} from "@/lib/telegram-templates";

/**
 * POST /api/telegram/send — сообщения владельцу (задачи 7 → 25).
 *
 * Три вида сообщений (kind в теле запроса):
 *  • test — проверка подключения из Настроек: ✅-шаблон с кнопками
 *    «Открыть FryFlow / Настройки» и @username бота (getMe);
 *  • critical — критичный алерт Мозга (задача 7): 🚨-шаблон с кнопками
 *    «📞 Позвонить / 💬 Напомнить / ✅ Оплачено». Контекст (клиент, долг,
 *    заказ) сохраняется на сервере — по нему кнопки работают;
 *  • report — готовый HTML отчёта недели (раздел «Отчёты» в Настройках):
 *    отправляется как есть, с кнопками навигации;
 *  • без kind + text — произвольный текст (совместимость): экранируется
 *    и уходит в 🚨-обёртке.
 *
 * Токен читается на сервере — клиент его не видит.
 */

export const runtime = "nodejs";

interface SendBody {
  kind?: "test" | "critical" | "report";
  /** Произвольный текст (без kind) или HTML отчёта (kind=report). */
  text?: string;
  /** HTML отчёта недели (kind=report). */
  html?: string;
  /** Контекст критичного алерта. */
  orderId?: string;
  /** id заявки из Telegram (externalId заказа) — для чата клиента. */
  externalId?: string;
  client?: { id?: string; name?: string; phone?: string };
  debt?: { amount?: number; days?: number };
}

/** Кнопки под отправленным отчётом (разделы FryFlow). */
function reportButtons(): TgMessage["reply_markup"] {
  return {
    inline_keyboard: [
      [
        { text: "📊 Финансы", callback_data: "nav:finance" },
        { text: "👥 Клиенты", callback_data: "nav:clients" },
        { text: "📋 Отчёты", callback_data: "nav:reports" },
      ],
    ],
  };
}

export async function POST(request: Request) {
  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const cfg = await readConfig();
  if (!cfg.botToken || !cfg.chatId) {
    /* Telegram не настроен — это не ошибка приложения, просто
     * алерт некуда отправить. Виджет покажет бейдж «Критично». */
    return NextResponse.json(
      { ok: false, error: "Telegram не настроен" },
      { status: 200 }
    );
  }

  /* ── Тестовое сообщение (Настройки → «Отправить тестовое»). */
  if (body.kind === "test") {
    const me = await getMe(cfg.botToken);
    const username = me.username ?? "abiloid_bot";
    const r = await sendTgMessage(
      cfg.botToken,
      cfg.chatId,
      buildTestMessage(username, cfg.chatId)
    );
    return NextResponse.json(
      { ok: r.ok, ...(r.error ? { error: r.error } : {}) },
      { status: r.ok ? 200 : 400 }
    );
  }

  /* ── Критичный алерт с кнопками (Мозг, задача 25). */
  if (body.kind === "critical") {
    const debtAmount = Number(body.debt?.amount);
    const debtDays = Number(body.debt?.days);
    const clientName = (body.client?.name ?? "").trim();
    const orderId = (body.orderId ?? "").trim();
    if (
      !orderId ||
      !clientName ||
      !Number.isFinite(debtAmount) ||
      debtAmount <= 0 ||
      !Number.isFinite(debtDays) ||
      debtDays < 0
    ) {
      /* Контекста нет — уходим в простой текстовый алерт ниже. */
      const text = (body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "Пустой текст алерта" }, { status: 400 });
      }
      const r = await sendTgMessage(
        cfg.botToken,
        cfg.chatId,
        buildCriticalTextAlert(text.slice(0, 3900))
      );
      return NextResponse.json(
        { ok: r.ok, ...(r.error ? { error: r.error } : {}) },
        { status: r.ok ? 200 : 400 }
      );
    }

    /* Заказ пришёл из Telegram? Тогда сможем писать клиенту напрямую
     * (кнопка «Напомнить»): chat_id хранится в заявке. */
    const draft = body.externalId ? await findDraft(body.externalId) : null;

    const alert = await sendTgMessage(
      cfg.botToken,
      cfg.chatId,
      buildCriticalAlert(
        {
          name: clientName,
          phone: body.client?.phone ?? "",
          id: body.client?.id ?? "",
        },
        { amount: debtAmount, days: Math.round(debtDays) },
        orderId
      )
    );
    if (!alert.ok) {
      return NextResponse.json(
        { ok: false, error: alert.error },
        { status: 400 }
      );
    }

    /* Контекст кнопок — на сервере: «Позвонить» (tel:), «Напомнить»
     * (клиенту в Telegram), «Оплачено» (применит приложение). */
    await addAlert({
      orderId,
      clientId: body.client?.id ?? "",
      clientName,
      phone: body.client?.phone ?? "",
      amount: debtAmount,
      days: Math.round(debtDays),
      ...(draft?.chatId ? { clientChatId: draft.chatId } : {}),
    });

    return NextResponse.json({ ok: true, buttons: true });
  }

  /* ── Готовый отчёт недели (раздел «Отчёты»). */
  if (body.kind === "report") {
    const html = (body.html ?? body.text ?? "").trim();
    if (!html) {
      return NextResponse.json({ error: "Пустой текст отчёта" }, { status: 400 });
    }
    const r = await sendTgMessage(cfg.botToken, cfg.chatId, {
      text: html.slice(0, 3900),
      reply_markup: reportButtons(),
    });
    return NextResponse.json(
      { ok: r.ok, ...(r.error ? { error: r.error } : {}) },
      { status: r.ok ? 200 : 400 }
    );
  }

  /* ── Совместимость: произвольный текст (Мозг без контекста). */
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Пустой текст алерта" }, { status: 400 });
  }
  const r = await sendTgMessage(
    cfg.botToken,
    cfg.chatId,
    buildCriticalTextAlert(text.slice(0, 3900))
  );
  return NextResponse.json(
    { ok: r.ok, ...(r.error ? { error: r.error } : {}) },
    { status: r.ok ? 200 : 400 }
  );
}
