import { NextResponse } from "next/server";

import { offlineAnswer } from "@/lib/ai-offline";
import type { AiContext } from "@/lib/ai-context";

/**
 * POST /api/ai-assistant — мозг ИИ-Директора.
 *
 * Принимает живой контекст бизнеса (собирается на клиенте из CRM-стора),
 * историю последних 10 сообщений и Устав ИИ из настроек. Пробует ZAI;
 * если ключа нет или сеть подвела — отвечает офлайн-мозг на тех же цифрах,
 * так что чат не «умирает» никогда.
 */

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AssistantRequest {
  context: AiContext;
  history: ChatMessage[];
  charter?: string;
  /** advice — проактивный совет от триггера, а не ответ в чате. */
  mode?: "chat" | "advice";
}

function buildSystemPrompt(req: AssistantRequest): string {
  const p = req.context.pricing;
  const base = [
    "Ты — ИИ-Директор FryFlow: старший партнёр владельца оптового бизнеса картофеля фри в Ростове-на-Дону, а не «ассистент».",
    "Бизнес: замороженный картофель фри, упаковки 2,5 кг. Опт от 10 уп. — " + p.wholesalePerBox + " ₽/уп (" + p.wholesalePerKg + " ₽/кг), мелкий опт — " + p.smallWholesalePerBox + " ₽/уп. Себестоимость " + p.costPerKg + " ₽/кг. Проба — упаковка 2,5 кг за " + p.trialPrice + " ₽ (вычитается из первого опта). Основной канал продаж — холодные звонки, главный аргумент — калькулятор годовой выгоды.",
    "Клиенты: шаурмичные (green — приоритет), бургерные и столовые (yellow), пабы и кальянные (red). Отсрочка платежа по закону — максимум 40 дней, новым клиентам — только предоплата или наличные.",
    "",
    "УСТАВ ВЛАДЕЛЬЦА (приоритетнее общих советов):",
    req.charter?.trim() || "—",
    "",
    "ЖИВЫЕ ЦИФРЫ БИЗНЕСА СЕГОДНЯ (истина в последней инстанции, отвечай только ими):",
    JSON.stringify(req.context, null, 1),
    "",
    "ПРАВИЛА ОТВЕТА:",
    "1. Русский язык. Коротко и по делу — владелец читает с телефона между звонками.",
    "2. Структура: цифры → вывод → конкретное действие (кому позвонить, что спросить, когда заказать).",
    "3. Все числа бери из раздела «ЖИВЫЕ ЦИФРЫ». Не выдумывай цифры, которых там нет.",
    "4. Говори как партнёр: прямо, без канцелярита и без «как интересный вопрос».",
    "5. Если вопроса недостаточно — задай один уточняющий вопрос, но сначала дай то, что уже известно из цифр.",
  ];
  if (req.mode === "advice") {
    base.push(
      "",
      "РЕЖИМ ПРОАКТИВНОГО СОВЕТА: последний вопрос в истории — тема совета, а не вопрос клиента. Выдай ОДИН короткий проактивный совет (2–4 предложения, без приветствий и без списков из 10 пунктов): живые цифры → вывод → одно конкретное действие на сегодня. Если цифры горят (просрочка 15+ дней, склад ниже порога) — начни с этого и пометь срочность словом «срочно»/«просрочка»/«склад заканчивается».",
    );
  }
  return base.join("\n");
}

export async function POST(request: Request) {
  let body: AssistantRequest;
  try {
    body = (await request.json()) as AssistantRequest;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const { context, history = [] } = body;
  if (!context?.stock || !Array.isArray(history)) {
    return NextResponse.json({ error: "Нет контекста или истории" }, { status: 400 });
  }

  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const trimmed = history.slice(-10);

  /* Пробуем живую модель… */
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: buildSystemPrompt(body) },
        ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      ],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (reply) return NextResponse.json({ reply, source: "zai" });
  } catch (err) {
    console.warn("[ai-assistant] ZAI недоступен, отвечает офлайн-мозг:", err instanceof Error ? err.message : err);
  }

  /* …а если не вышло — офлайн-мозг на тех же цифрах. */
  return NextResponse.json({ reply: offlineAnswer(lastUser, context), source: "offline" });
}
