import { NextResponse } from "next/server";

import { chatCompletion } from "@/lib/ai-sdk";
import {
  getMe,
  readConfig,
  sendTgMessage,
  stripStockPlaceholder,
  writeConfig,
} from "@/lib/telegram-server";
import { buildAutopost, MANAGER_PHONE } from "@/lib/telegram-templates";
import { PRICE_PER_PACK } from "@/types/models";

/**
 * GET/POST /api/telegram/autopost — автопостинг в группы (задачи 7 → 25).
 *
 * Настройки (в «Настройках» → Telegram): Chat ID групп через
 * запятую, интервал 2/3/7 дней, базовый шаблон-питч с {stock}.
 *
 * Логика: движок триггеров раз в час пингует POST { force: false,
 * stockKg, stockPacks } — сервер сам решает, пора ли (lastPostAt +
 * интервал). Кнопка «Опубликовать сейчас» шлёт { force: true }.
 *
 * Пост (задача 25): структурированное объявление — 🍟 заголовок,
 * разделители, кликабельный телефон, @бот для лички, остаток склада
 * и пробная партия. Анти-спам: перед публикацией ИИ переписывает
 * питч владельца новым языком (сохранив цифры и смысл), при сбое —
 * питч как есть; {stock} уходит отдельной строкой «🔥 Остаток».
 */

export const runtime = "nodejs";

interface AutopostBody {
  force?: boolean;
  stockKg?: number;
  stockPacks?: number;
}

/** Живой копирайтер: уникализирует питч, сохраняя цифры и смысл.
 *  Задача 25: питч — блок внутри структурированного поста. */
async function rewriteWithZai(text: string): Promise<string | null> {
  try {
    const { reply } = await chatCompletion({
      messages: [
        {
          role: "system",
          content: [
            "Ты — копирайтер оптового поставщика замороженного картофеля фри. Задача: анти-спам для оптовых групп Telegram.",
            "Перепиши объявление НОВЫМ языком: сохрани все цифры, цены и смысл, но смени подачу (тон, порядок фраз, зачин).",
            "2–3 предложения, максимум один эмодзи, без хэштегов, без слова «скидка» (цены фиксированные), без воды, без HTML-тегов.",
            "В ответе — ТОЛЬКО один готовый текст поста: без вариантов «на выбор», без пояснений, без кавычек, без заголовков.",
            "",
            "Объявление: «" + text + "»",
          ].join("\n"),
        },
        { role: "user", content: "Перепиши объявление по правилам выше. Верни один готовый текст." },
      ],
      maxTokens: 700,
    });
    const post = cleanPostText(reply?.trim() ?? "");
    return post && post.length > 30 ? post : null;
  } catch {
    return null;
  }
}

/**
 * Чистка текста поста от «вариантов на выбор» и markdown:
 * модель любит перечислить 3 варианта — берём первый и молча.
 */
export function cleanPostText(raw: string): string {
  let t = raw
    .replace(/\*\*/g, "")
    .replace(/^#{1,4}\s*/gm, "")
    .trim();

  /* Несколько вариантов → первый. */
  const first = t.search(/вариант\s*\d/i);
  if (first >= 0) {
    const rest = t.slice(first);
    const second = rest.slice(1).search(/\n\s*вариант\s*\d/i);
    let chunk = second >= 0 ? rest.slice(0, second + 1) : rest.split(/\n\s*вариант\s*\d/i)[0];
    chunk = chunk.replace(/^\s*вариант\s*\d[^:\n]*(?:[:：]\s*)?\s*/i, "").trim();
    if (chunk.length > 30) t = chunk;
  }

  /* Вводная строка-пояснение перед постом («Готово. Вот текст:»). */
  t = t
    .replace(/^(?:готово|вот|держи|такой вариант)[^\n]*[:：]\s*\n?/i, "")
    .replace(/^(?:объявление|пост|текст)\s*[:：]\s*/i, "")
    .trim();

  return t;
}

export async function GET() {
  const cfg = await readConfig();
  const intervalMs = cfg.intervalDays * 86_400_000;
  return NextResponse.json({
    enabled: Boolean(cfg.botToken && cfg.groups.length > 0),
    groups: cfg.groups,
    intervalDays: cfg.intervalDays,
    lastPostAt: cfg.lastPostAt,
    nextPostAt: cfg.lastPostAt ? cfg.lastPostAt + intervalMs : 0,
  });
}

export async function POST(request: Request) {
  let body: AutopostBody;
  try {
    body = (await request.json()) as AutopostBody;
  } catch {
    body = {};
  }

  const cfg = await readConfig();

  if (!cfg.botToken) {
    return NextResponse.json(
      { posted: 0, error: "Сначала укажите Bot Token в настройках Telegram." },
      { status: 400 }
    );
  }
  if (cfg.groups.length === 0) {
    return NextResponse.json(
      { posted: 0, error: "Не указаны Chat ID групп для автопостинга." },
      { status: 400 }
    );
  }

  /* Пора ли? force = кнопка «Опубликовать сейчас». */
  const now = Date.now();
  const intervalMs = cfg.intervalDays * 86_400_000;
  const due = cfg.lastPostAt === 0 || now - cfg.lastPostAt >= intervalMs;
  if (!body.force && !due) {
    return NextResponse.json({
      posted: 0,
      skipped: "not-due",
      nextPostAt: cfg.lastPostAt + intervalMs,
    });
  }

  /* Актуальные остатки склада (клиент передаёт с собой — склад живёт
   * в localStorage браузера). {stock} из питча вырезаем — остаток
   * уходит отдельной строкой «🔥 Остаток». */
  const stockKg = Math.max(0, Math.round(Number(body.stockKg ?? 0)));
  const stockPacks = Math.max(0, Math.round(Number(body.stockPacks ?? 0)));
  const basePitch = stripStockPlaceholder(cfg.template) || undefined;

  /* Анти-спам: живой копирайтер или питч как есть. */
  const offer = basePitch
    ? ((await rewriteWithZai(basePitch)) ?? basePitch)
    : undefined;

  /* Структурированный пост (задача 25) + @бота для лички. */
  const me = await getMe(cfg.botToken);
  const post = buildAutopost(
    { name: "Картофель фри", price: PRICE_PER_PACK, stock: stockKg || stockPacks * 2.5 },
    me.username,
    MANAGER_PHONE,
    offer
  );

  /* Публикация во все группы; считаем успехи и собираем ошибки. */
  const results: Array<{ group: string; ok: boolean; error?: string }> = [];
  for (const group of cfg.groups) {
    const r = await sendTgMessage(cfg.botToken, group, post);
    results.push({ group, ok: r.ok, error: r.error });
  }
  const posted = results.filter((r) => r.ok).length;

  /* lastPostAt двигаем даже при частичном успехе — не спамим ретраями. */
  if (posted > 0) {
    await writeConfig({ lastPostAt: now });
  }

  return NextResponse.json({
    posted,
    total: cfg.groups.length,
    text: post.text,
    results,
    error: posted === 0 ? (results[0]?.error ?? "Не удалось опубликовать") : undefined,
  });
}
