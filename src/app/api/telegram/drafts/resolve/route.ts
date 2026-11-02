import { NextResponse } from "next/server";

import { removeDraft } from "@/lib/telegram-server";

/**
 * POST /api/telegram/drafts/resolve — заявка обработана.
 *
 * Экран «Заказы» вызывает после «Подтвердить» или «Отклонить»,
 * чтобы заявка не приезжала снова при следующей синхронизации.
 */

export const runtime = "nodejs";

interface ResolveBody {
  id?: string;
  action?: "confirmed" | "rejected";
}

export async function POST(request: Request) {
  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Не передан id заявки" }, { status: 400 });
  }

  const removed = await removeDraft(body.id);
  return NextResponse.json({ ok: removed, id: body.id, action: body.action ?? "confirmed" });
}
