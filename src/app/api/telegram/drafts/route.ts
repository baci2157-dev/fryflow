import { NextResponse } from "next/server";

import {
  listDrafts,
  listUnappliedPaid,
  markAlertsApplied,
} from "@/lib/telegram-server";

/**
 * GET /api/telegram/drafts — заявки-черновики из Telegram (задачи 24–25).
 *
 * Экран «Заказы» (вкладка «Черновики») забирает список при монтировании
 * и мержит в CRM: каждая заявка становится заказом-черновиком с
 * externalId — по нему дедуп.
 *
 * Задача 25 — статусы заявок (решение кнопками в Telegram):
 *  • pending — создать локальный черновик (как раньше);
 *  • confirmed — подтвердить локальный черновик (или создать заказ сразу,
 *    если приложение ещё не видело заявку);
 *  • rejected — отклонить локальный черновик.
 *
 * Вместе со списком отдаём paidOrders — заказы, отмеченные «✅ Оплачено»
 * кнопкой в Telegram: приложение помечает их оплаченными и подтверждает
 * (POST { ackPaid }) — после этого сервер больше не отдаёт их.
 */

export const runtime = "nodejs";

export async function GET() {
  const drafts = await listDrafts();
  const paidAlerts = await listUnappliedPaid();
  return NextResponse.json({
    drafts,
    paidOrders: paidAlerts.map((a) => ({
      alertId: a.id,
      orderId: a.orderId,
      clientName: a.clientName,
      amount: a.amount,
    })),
  });
}

/** POST { ackPaid: [alertId…] } — оплата применена в приложении. */
export async function POST(request: Request) {
  let body: { ackPaid?: string[] };
  try {
    body = (await request.json()) as { ackPaid?: string[] };
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.ackPaid)
    ? body.ackPaid.filter((x): x is string => typeof x === "string").slice(0, 50)
    : [];
  await markAlertsApplied(ids);
  return NextResponse.json({ ok: true, applied: ids.length });
}
