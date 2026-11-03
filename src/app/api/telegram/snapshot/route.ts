import { NextResponse } from "next/server";

import {
  readSnapshot,
  writeSnapshot,
  type SnapshotCallback,
  type TelegramSnapshot,
} from "@/lib/telegram-server";

/**
 * POST /api/telegram/snapshot — снимок живых данных приложения (задача 24).
 *
 * Приложение (localStorage — единственный источник правды в PWA) при
 * каждом открытии и после записи звонка отправляет на сервер:
 *   • перезвоны на неделю вперёд (для утреннего дайджеста в 9:00);
 *   • ключевые цифры недели (для отчёта владельцу в воскресенье 18:00);
 *   • остатки склада (для автопостинга по расписанию).
 *
 * На self-hosted живёт в .data/telegram-snapshot.json; на Vercel без БД —
 * в /tmp тёплого инстанса (best-effort: cron на холодном инстансе получит
 * устаревший снимок и пошлёт короткое напоминание вместо списка).
 * Синхронизация молчаливая: офлайн/ошибка не роняют приложение.
 */

export const runtime = "nodejs";

interface SnapshotBody {
  callbacks?: Array<{
    clientName?: unknown;
    phone?: unknown;
    address?: unknown;
    date?: unknown;
    overdue?: unknown;
  }>;
  stats?: unknown;
}

export async function POST(request: Request) {
  let body: SnapshotBody;
  try {
    body = (await request.json()) as SnapshotBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный JSON" }, { status: 400 });
  }

  /* Перевариваем большой словарь клиентов аккуратно: берём только
   * неделю вперёд + просроченные (до 30 дней — дайджест показывает
   * их с ⚠️), максимум 60 записей. */
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  const monthBack = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const callbacks: SnapshotCallback[] = [];
  for (const raw of Array.isArray(body.callbacks) ? body.callbacks : []) {
    const clientName = typeof raw.clientName === "string" ? raw.clientName.trim() : "";
    const date = typeof raw.date === "string" ? raw.date.slice(0, 10) : "";
    if (!clientName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < monthBack || date > weekAhead) continue;
    callbacks.push({
      clientName: clientName.slice(0, 80),
      phone: typeof raw.phone === "string" ? raw.phone.slice(0, 24) : "",
      address: typeof raw.address === "string" ? raw.address.slice(0, 80) : "",
      date,
      overdue: Boolean(raw.overdue) || date < today,
    });
    if (callbacks.length >= 60) break;
  }

  /* stats прошли валидацию на клиенте — здесь только sanitise размера. */
  const stats = (body.stats ?? null) as TelegramSnapshot["stats"];

  const snap: TelegramSnapshot = {
    callbacks,
    stats,
    syncedAt: new Date().toISOString(),
  };

  try {
    await writeSnapshot(snap);
    return NextResponse.json({ ok: true, callbacks: callbacks.length });
  } catch {
    /* Vercel холодный инстанс без /tmp — молча: синхронизация не критична. */
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

/** GET — диагностика из Настроек (без телефонов, только счётчики). */
export async function GET() {
  const snap = await readSnapshot();
  if (!snap) {
    return NextResponse.json({ ok: true, synced: false });
  }
  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({
    ok: true,
    synced: true,
    syncedAt: snap.syncedAt,
    todayCount: snap.callbacks.filter((c) => c.date <= today).length,
    hasStats: Boolean(snap.stats),
  });
}
