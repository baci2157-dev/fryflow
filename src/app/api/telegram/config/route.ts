import { NextResponse } from "next/server";

import {
  publicConfig,
  readConfig,
  writeConfig,
  type TelegramConfig,
} from "@/lib/telegram-server";

/**
 * GET/POST /api/telegram/config — настройки Telegram-интеграции.
 *
 * Безопасность: Bot Token принимается от клиента один раз (при
 * вводе в «Настройках») и сохраняется только в серверном файле
 * .data/telegram.json. Клиенту возвращается маска «12345…AbCd»,
 * но никогда — сам токен.
 */

export const runtime = "nodejs";

interface ConfigPatch {
  /** Пустая строка/undefined — не меняем сохранённый токен. */
  botToken?: string;
  chatId?: string;
  /** Chat ID групп через запятую (текст из настроек). */
  groupsText?: string;
  intervalDays?: number;
  template?: string;
}

const TOKEN_RE = /^\d{5,12}:[A-Za-z0-9_-]{30,}$/;

/** Chat ID бывает числом, -100… (группы) или @username (каналы). */
const CHAT_RE = /^(-?\d{3,}@[a-z0-9_]+)|(-?\d{3,})|(@[A-Za-z0-9_]{4,})$/;

function parseGroups(groupsText: string): string[] {
  return groupsText
    .split(/[,\n;]+/)
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

export async function GET() {
  const cfg = await readConfig();
  return NextResponse.json(publicConfig(cfg));
}

export async function POST(request: Request) {
  let body: ConfigPatch;
  try {
    body = (await request.json()) as ConfigPatch;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const patch: Partial<TelegramConfig> = {};

  /* Токен: пришёл непустой — валидируем и сохраняем; пустой — не трогаем. */
  if (typeof body.botToken === "string" && body.botToken.trim().length > 0) {
    const token = body.botToken.trim();
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json(
        {
          error:
            "Формат токена неверный. Пример: 7123456789:AAHfT… (копируйте целиком из @BotFather).",
        },
        { status: 400 }
      );
    }
    patch.botToken = token;
  }

  if (typeof body.chatId === "string") {
    const chatId = body.chatId.trim();
    if (chatId && !CHAT_RE.test(chatId)) {
      return NextResponse.json(
        { error: "Chat ID неверный: только цифры (например, 123456789) или @username." },
        { status: 400 }
      );
    }
    patch.chatId = chatId;
  }

  if (typeof body.groupsText === "string") {
    const groups = parseGroups(body.groupsText);
    for (const g of groups) {
      if (!CHAT_RE.test(g)) {
        return NextResponse.json(
          { error: `Chat ID группы «${g}» неверный — проверьте список.` },
          { status: 400 }
        );
      }
    }
    patch.groups = groups;
  }

  if (body.intervalDays !== undefined) {
    const d = Number(body.intervalDays);
    if (![2, 3, 7].includes(d)) {
      return NextResponse.json(
        { error: "Интервал автопостинга: 2, 3 или 7 дней." },
        { status: 400 }
      );
    }
    patch.intervalDays = d as TelegramConfig["intervalDays"];
  }

  if (typeof body.template === "string") {
    const template = body.template.trim();
    if (template.length < 20) {
      return NextResponse.json(
        { error: "Шаблон слишком короткий — напишите хотя бы пару предложений." },
        { status: 400 }
      );
    }
    patch.template = template.slice(0, 600);
  }

  const cfg = await writeConfig(patch);
  return NextResponse.json(publicConfig(cfg));
}
