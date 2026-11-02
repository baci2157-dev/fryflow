import { NextResponse } from "next/server";

import { listDrafts } from "@/lib/telegram-server";

/**
 * GET /api/telegram/drafts — заявки-черновики из Telegram.
 *
 * Экран «Заказы» (вкладка «Черновики») забирает список при
 * монтировании и мержит в CRM: каждая заявка становится
 * заказом-черновиком с externalId — по нему дедуп.
 */

export const runtime = "nodejs";

export async function GET() {
  const drafts = await listDrafts();
  return NextResponse.json({ drafts });
}
