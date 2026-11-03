import { NextResponse } from "next/server";

import { chatCompletion } from "@/lib/ai-sdk";
import {
  buildWeeklyReportText,
  readConfig,
  readSnapshot,
  sendTelegramMessage,
  type WeeklyStats,
} from "@/lib/telegram-server";

/**
 * GET /api/telegram/weekly-report — отчёт недели владельцу (задача 24).
 *
 * Vercel Cron (vercel.json): 0 15 * * 0 UTC = воскресенье 18:00 мск.
 * Из снапшота приложения (цифры недели) собираем отчёт: выручка, маржа,
 * новые клиенты, топ-5 сделок, проблемные клиенты. Мозг (ZAI) добавляет
 * 2–3 предложения выводов; при сбое — отчёт без выводов (не падаем).
 * Уходит в Telegram владельцу.
 *
 * POST { preview: true, stats: {...} } — «Показать отчёт» из Настроек:
 * тот же билдер на живых цифрах клиента, но БЕЗ отправки — текст
 * возвращается в приложение и сохраняется в разделе «Отчёты».
 *
 * Защита GET: CRON_SECRET (Vercel Cron шлёт Authorization: Bearer $CRON_SECRET).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** Мозг добавляет короткие выводы к цифрам (сбой — просто без выводов,
 *  но с описанием ошибки для диагностики из «Настроек»). */
async function brainSummary(
  stats: WeeklyStats
): Promise<{ text: string; error?: string }> {
  try {
    const { reply, error } = await chatCompletion({
      messages: [
        {
          role: "system",
          content: [
            "Ты — коммерческий директор оптового поставщика замороженного картофеля фри (Ростов-на-Дону).",
            "Ниже цифры недели. Дай 2–3 предложения: главный вывод и одно конкретное действие на следующую неделю.",
            "Пиши по-русски, по-деловому, без воды и без markdown-разметки. Только текст выводов.",
            "",
            buildWeeklyReportText(stats),
          ].join("\n"),
        },
        {
          role: "user",
          content: "Сделай краткие выводы по цифрам недели.",
        },
      ],
      maxTokens: 400,
      temperature: 0.5,
    });
    const text = (reply ?? "").trim();
    if (text) return { text: `\n\n🧠 Мозг: ${text}` };
    return { text: "", error: error ?? "пустой ответ модели" };
  } catch (e) {
    return { text: "", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Проверка цифр из клиента: только числа и строки, разумные рамки. */
function sanitizeStats(raw: unknown): WeeklyStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
  };
  const str = (v: unknown, len = 10) =>
    typeof v === "string" ? v.slice(0, len) : "";
  const topDeals = (Array.isArray(r.topDeals) ? r.topDeals : [])
    .slice(0, 5)
    .map((d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        clientName: typeof o.clientName === "string" ? o.clientName.slice(0, 60) : "—",
        amount: num(o.amount, 100_000_000),
      };
    });
  const problemClients = (Array.isArray(r.problemClients) ? r.problemClients : [])
    .slice(0, 8)
    .map((d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        clientName: typeof o.clientName === "string" ? o.clientName.slice(0, 60) : "—",
        reason: typeof o.reason === "string" ? o.reason.slice(0, 80) : "",
      };
    });
  return {
    periodStart: str(r.periodStart),
    periodEnd: str(r.periodEnd),
    revenue: num(r.revenue, 1_000_000_000),
    margin: num(r.margin, 1_000_000_000),
    marginPct: num(r.marginPct, 100),
    ordersCount: num(r.ordersCount, 100_000),
    newClients: num(r.newClients, 100_000),
    topDeals,
    problemClients,
    stockKg: num(r.stockKg, 1_000_000),
    stockPacks: num(r.stockPacks, 500_000),
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cfg = await readConfig();
  if (!cfg.botToken || !cfg.chatId) {
    return NextResponse.json({ ok: true, skipped: "not-configured" });
  }
  const snap = await readSnapshot();
  if (!snap?.stats) {
    const r = await sendTelegramMessage(
      cfg.botToken,
      cfg.chatId,
      "Отчёт недели FryFlow не собрался: приложение давно не открывали — цифры не синхронизированы. Откройте FryFlow, и в следующее воскресенье отчёт придёт полный."
    );
    return NextResponse.json({ ok: r.ok, error: r.error, sent: r.ok, fresh: false });
  }

  const brain = await brainSummary(snap.stats);
  const text = buildWeeklyReportText(snap.stats) + brain.text;
  const r = await sendTelegramMessage(cfg.botToken, cfg.chatId, text);
  return NextResponse.json({
    ok: r.ok,
    error: r.error,
    sent: r.ok,
    fresh: true,
    brainError: brain.error,
  });
}

export async function POST(request: Request) {
  let body: { preview?: boolean; stats?: unknown };
  try {
    body = (await request.json()) as { preview?: boolean; stats?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный JSON" }, { status: 400 });
  }

  /* «Показать отчёт» из Настроек: живые цифры клиента, без отправки. */
  if (body.preview) {
    const stats = sanitizeStats(body.stats);
    if (!stats) {
      return NextResponse.json(
        { ok: false, error: "Цифры недели не переданы — откройте приложение и повторите." },
        { status: 400 }
      );
    }
    const brain = await brainSummary(stats);
    const text = buildWeeklyReportText(stats) + brain.text;
    return NextResponse.json({ ok: true, text, brainError: brain.error });
  }

  /* Ручная отправка из приложения (кнопка «Отправить отчёт в Telegram»). */
  const cfg = await readConfig();
  if (!cfg.botToken || !cfg.chatId) {
    return NextResponse.json(
      { ok: false, error: "Telegram не настроен — укажите токен и Chat ID." },
      { status: 400 }
    );
  }
  const stats = sanitizeStats(body.stats);
  if (!stats) {
    return NextResponse.json(
      { ok: false, error: "Цифры недели не переданы." },
      { status: 400 }
    );
  }
  const brain = await brainSummary(stats);
  const text = buildWeeklyReportText(stats) + brain.text;
  const r = await sendTelegramMessage(cfg.botToken, cfg.chatId, text);
  return NextResponse.json({ ok: r.ok, error: r.error, sent: r.ok });
}
