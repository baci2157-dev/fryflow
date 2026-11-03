import { NextResponse } from "next/server";

import {
  readConfig,
  readSnapshot,
  sendTgMessage,
  snapshotFresh,
} from "@/lib/telegram-server";
import {
  buildMorningDigest,
  fmtDate,
  type DigestCallback,
  type TgMessage,
} from "@/lib/telegram-templates";

/**
 * GET /api/telegram/digest — утренний дайджест перезвонов (задачи 24–25).
 *
 * Vercel Cron (vercel.json): 0 6 * * * UTC = 9:00 мск, каждый день.
 * «🌅 Сегодня N перезвонов» с кликабельными телефонами (tel:), адресами
 * и кнопками «📋 Календарь / 📊 Дашборд» — по свежему снапшоту приложения
 * (POST /api/telegram/snapshot). Снапшот старше 36 часов или его нет —
 * короткое напоминание открыть приложение.
 *
 * Заодно (в тот же проход, раз cron на Hobby-плане один в день)
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

/** Снапшот → элементы дайджеста: подпись времени + флаг просрочки. */
function digestItems(
  callbacks: Array<{ clientName: string; phone: string; address?: string; date: string; overdue: boolean }>,
  today: string
): DigestCallback[] {
  return callbacks
    .filter((c) => c.date <= today)
    .map((c) => ({
      name: c.clientName,
      ...(c.address ? { address: c.address } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
      time:
        c.date < today
          ? `просрочено с ${fmtDate(c.date)}`
          : "сегодня",
      overdue: c.overdue || c.date < today,
    }));
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
  const fresh = snapshotFresh(snap);

  let msg: TgMessage;
  if (!fresh) {
    msg = {
      text:
        `🌅 <b>Доброе утро!</b>\n\n` +
        `Список перезвонов на сегодня — в приложении (Дашборд → Перезвоны). ` +
        `Откройте FryFlow, и следующий утренний дайджест придёт со списком и телефонами.\n\n` +
        `📋 <a href="https://fryflow.vercel.app/callbacks">Открыть календарь</a>`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📋 Календарь", callback_data: "nav:callbacks" },
            { text: "📊 Дашборд", callback_data: "nav:dashboard" },
          ],
        ],
      },
    };
  } else {
    msg = buildMorningDigest(digestItems(snap?.callbacks ?? [], today));
  }

  const send = await sendTgMessage(cfg.botToken, cfg.chatId, msg);

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
