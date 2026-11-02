import { NextResponse } from "next/server";

import { cleanMarkdown, offlineAnswer } from "@/lib/ai-offline";
import type { AiContext } from "@/lib/ai-context";

/**
 * POST /api/ai-assistant — мозг ИИ-Директора.
 *
 * Принимает живой контекст бизнеса (собирается на клиенте из CRM-стора),
 * историю последних 10 сообщений и Устав ИИ из настроек. Пробует ZAI;
 * если ключа нет или сеть подвела — отвечает офлайн-мозг на тех же цифрах,
 * так что чат не «умирает» никогда.
 *
 * Задача 10:
 *  • модель — GLM-4.5 (128K контекста): видит всю историю заказов,
 *    паттерны клиентов и каталог разом, советы стали точнее;
 *  • роль — «коммерческий директор»: анализ паттернов и сезонности,
 *    активный кросс-сейл («этот берёт только фри — предложи соус»);
 *  • опциональный поиск в интернете (functions.invoke web_search):
 *    для вопросов о трендах и конкурентах ИИ сверяется со свежими
 *    публикациями и прикладывает источники.
 */

export const runtime = "nodejs";

/** Модель чата: GLM-4.5 (128K), можно переопределить env-ом. */
const AI_MODEL = process.env.FRYFLOW_AI_MODEL || "glm-4.5";

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
  /** Поиск в интернете перед ответом (тумблер в «Настройках»). */
  webSearch?: boolean;
}

function buildSystemPrompt(req: AssistantRequest, webContext: string | null): string {
  const p = req.context.pricing;
  const base = [
    "Ты — ИИ-Директор FryFlow: коммерческий директор владельца оптового бизнеса картофелем фри в Ростове-на-Дону, а не «ассистент».",
    "Бизнес: замороженный картофель фри, упаковки 2,5 кг. Опт от 10 уп. — " + p.wholesalePerBox + " ₽/уп (" + p.wholesalePerKg + " ₽/кг), мелкий опт — " + p.smallWholesalePerBox + " ₽/уп. Себестоимость " + p.costPerKg + " ₽/кг. Проба — упаковка 2,5 кг за " + p.trialPrice + " ₽ (вычитается из первого опта). Основной канал продаж — холодные звонки, главный аргумент — калькулятор годовой выгоды.",
    "Клиенты: шаурмичные (green — приоритет), бургерные и столовые (yellow), пабы и кальянные (red). Отсрочка платежа по закону — максимум 40 дней, новым клиентам — только предоплата или наличные.",
    "",
    "ТЫ — КОММЕРЧЕСКИЙ ДИРЕКТОР (задача 10):",
    "• Анализируй историю заказов (recentOrders), паттерны клиентов (clientPatterns) и сезонность (seasonality) из «ЖИВЫХ ЦИФР».",
    "• Предлагай кросс-сейл ИСКЛЮЧИТЕЛЬНО из crossSell.products — этот список закрыт. Товара нет в crossSell.products — значит, он удалён из каталога: не предлагай его и не называй его цену ни при каких условиях, даже если он мелькает в recentOrders (это история прошлых продаж). Для клиента с onlyFries: true — предложи конкретный товар из каталога с ценой и маржей из crossSell.products.",
    "• Если сезон зима — предложи соленья и сырные соусы; лето — зелень и овощи (смотри seasonality.hint).",
    "• Если клиент давно не заказывал (overdue: true или daysSinceLastOrder сильно больше avgIntervalDays) — предложи акцию или звонок, назови имя клиента.",
    "• Попутные товары едут в той же машине — себестоимость доставки нулевая, вся маржа в плюс. Используй это как аргумент.",
    "",
    "УСТАВ ВЛАДЕЛЬЦА (приоритетнее общих советов):",
    req.charter?.trim() || "—",
    "",
    "ЖИВЫЕ ЦИФРЫ БИЗНЕСА СЕГОДНЯ (истина в последней инстанции, отвечай только ими):",
    JSON.stringify(req.context, null, 1),
  ];

  if (webContext) {
    base.push(
      "",
      "РЕЗУЛЬТАТЫ ПОИСКА В ИНТЕРНЕТЕ (свежие публикации по теме вопроса; опирайся на них в вопросах о трендах рынка и конкурентах, указывай источники):",
      webContext
    );
  }

  base.push(
    "",
    "ПРАВИЛА ОТВЕТА:",
    "1. Только русский язык, без английских и китайских иероглифов и без эмодзи. Коротко и по делу — владелец читает с телефона между звонками.",
    "2. Структура: цифры → вывод → конкретное действие (кому позвонить, что спросить, когда заказать).",
    "3. Все числа бери из раздела «ЖИВЫЕ ЦИФРЫ». Не выдумывай цифры, которых там нет.",
    "4. Говори как партнёр: прямо, без канцелярита и без «как интересный вопрос».",
    "5. Если вопроса недостаточно — задай один уточняющий вопрос, но сначала дай то, что уже известно из цифр.",
    "6. Советуя кросс-сейл, называй клиента по имени и товар строго из crossSell.products — «Шаурма на Зорге берёт только фри, предложите соус чесночный за 350 ₽ (маржа 90 ₽)». Цены и маржу бери только из crossSell.products, не из recentOrders."
  );

  if (req.mode === "advice") {
    base.push(
      "",
      "РЕЖИМ ПРОАКТИВНОГО СОВЕТА: последний вопрос в истории — тема совета, а не вопрос клиента. Выдай ОДИН короткий проактивный совет (2–4 предложения, без приветствий и без списков из 10 пунктов): живые цифры → вывод → одно конкретное действие на сегодня. Если цифры горят (просрочка 15+ дней, склад ниже порога) — начни с этого и пометь срочность словом «срочно»/«просрочка»/«склад заканчивается»."
    );
  }
  return base.join("\n");
}

/** Свежие публикации по теме вопроса (для трендов и конкурентов). */
async function searchWeb(query: string): Promise<string | null> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", {
      query,
      num: 5,
    });
    if (!Array.isArray(results) || results.length === 0) return null;
    return results
      .map(
        (r) =>
          `— ${r.name} (${r.host_name}${r.date ? ", " + r.date : ""}): ${r.snippet} [${r.url}]`
      )
      .join("\n");
  } catch (err) {
    console.warn(
      "[ai-assistant] web_search недоступен:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
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

  /* Поиск в интернете — до вызова модели, результаты уходят в промпт. */
  const webContext =
    body.webSearch && lastUser ? await searchWeb(lastUser) : null;

  /* Пробуем живую модель… */
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "assistant", content: buildSystemPrompt(body, webContext) },
        ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      ],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (reply)
      return NextResponse.json({ reply: cleanMarkdown(reply), source: "zai" });
  } catch (err) {
    console.warn("[ai-assistant] ZAI недоступен, отвечает офлайн-мозг:", err instanceof Error ? err.message : err);
  }

  /* …а если не вышло — офлайн-мозг на тех же цифрах. */
  return NextResponse.json({ reply: offlineAnswer(lastUser, context), source: "offline" });
}
