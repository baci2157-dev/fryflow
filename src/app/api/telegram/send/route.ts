import { NextResponse } from "next/server";

import { readConfig, sendTelegramMessage } from "@/lib/telegram-server";

/**
 * POST /api/telegram/send — критичный алерт ИИ-Директора.
 *
 * Вызывается движком триггеров (lib/ai-triggers.ts), когда
 * пользователь неактивен, а совет содержит «просрочку» /
 * «склад заканчивается» / «срочно». Токен читается на сервере —
 * клиент его не видит.
 */

export const runtime = "nodejs";

interface SendBody {
  text?: string;
}

export async function POST(request: Request) {
  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Пустой текст алерта" }, { status: 400 });
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

  const result = await sendTelegramMessage(
    cfg.botToken,
    cfg.chatId,
    text.slice(0, 4000)
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
