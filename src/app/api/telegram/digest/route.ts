import { NextResponse } from "next/server";

import {
  buildCallbacksDigest,
  readConfig,
  readSnapshot,
  sendTelegramMessage,
} from "@/lib/telegram-server";

/**
 * GET /api/telegram/digest — утренний дайджест перезвонов (задача 24).
 *
 * Vercel Cron (vercel.json): 0 6 * * * UTC = 9:00 мск, каждый день.
 * «Сегодня 12 перезвонов: [список клиентов с телефонами]» — по свежему
 * снапшоту приложения (POST /api/telegram/snapshot). Снапшот старше
 * 36 часов или его нет — короткое напоминание открыть приложение.
 *
 * Заодно (в тот же проход, раз cron на Hobby-плане один в день):
 * автопостинг по расписанию — если пора (lastPostAt + интервал), публикуем
 * объявление с остатками из снапшота (та же логика, что «Опубликовать
 * сейчас» в Настройках, через /api/telegram/autopost).
 *
 * Защита: если задан CRON_SECRET, Vercel Cron шлёт
 * Authorization: Bearer $CRON_SECRET — чужие запросы отбрасываем.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true; // секрет не задан — защита не включена
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function runDigest(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cfg = await readConfig();
  if (!cfg.botToken || !cfg.chatId) {
    return NextResponse.json({ ok: true, skipped: "not-configured" });
  }

  const snap = await readSnapshot();
  const today = new Date().toISOString().slice(0, 10);
  const { text, fresh } = buildCallbacksDigest(snap, today);

  const send = await sendTelegramMessage(cfg.botToken, cfg.chatId, text);

  /* Автопостинг по расписанию: холодный проход cron-а подхватывает
   * дедлайн, если приложение давно не открывали (пинг из приложения
   * каждый час — основной канал, см. lib/ai-triggers.ts). */
  let autopost: unknown = { checked: false };
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/telegram/autopost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CRON_SECRET?.trim()
            ? { Authorization: `Bearer ${process.env.CRON_SECRET.trim()}` }
            : {}),
        },
        body: JSON.stringify({
          force: false,
          stockKg: snap?.stats?.stockKg ?? 0,
          stockPacks: snap?.stats?.stockPacks ?? 0,
        }),
        signal: AbortSignal.timeout(50_000),
      }
    );
    autopost = (await res.json().catch(() => null)) as unknown;
  } catch {
    autopost = { checked: true, error: "недоступен" };
  }

  return NextResponse.json({
    ok: send.ok,
    error: send.error,
    digestSent: send.ok,
    digestFresh: fresh,
    callbacksToday: fresh
      ? (snap?.callbacks ?? []).filter((c) => c.date <= today).length
      : null,
    autopost,
  });
}

export async function GET(request: Request) {
  return runDigest(request);
}

export async function POST(request: Request) {
  return runDigest(request);
}
