import { NextResponse } from "next/server";

import { cleanMarkdown, offlineAnswer } from "@/lib/ai-offline";
import type { AiContext } from "@/lib/ai-context";
import { chatCompletion } from "@/lib/ai-sdk";
import {
  COST_PER_KG,
  MIN_WHOLESALE_BOXES,
  PACK_KG,
  PRICE_PER_KG,
  PRICE_PER_PACK,
  SMALL_WHOLESALE_PRICE_PER_PACK,
  TRIAL_PRICE,
} from "@/types/models";

/**
 * POST /api/ai-assistant — мозг ИИ-Директора.
 *
 * Принимает живой контекст бизнеса (собирается на клиенте из CRM-стора),
 * историю последних 10 сообщений и Устав ИИ из настроек. Отвечает через
 * двухрежимный слой lib/ai-sdk.ts (задача 12):
 *   • с ZAI_API_KEY — публичный API Z.AI, модель glm-4.7-flash (деплой);
 *   • без ключа — SDK песочницы с каскадом моделей (разработка).
 * Если оба недоступны — офлайн-мозг на тех же цифрах: чат не «умирает».
 *
 * Задача 10: роль «коммерческий директор» — паттерны, сезонность, кросс-сейл.
 * Задача 11: контекст дополнен discovery (новые точки, кому не звонили).
 * Задача 13 (Go-Live): веб-поиск временно отключён — ИИ-Директор работает
 * только на внутреннем контексте (остатки, долги, паттерны, каталог).
 */

export const runtime = "nodejs";
/* Vercel: бюджет ИИ-ответа до ~42с — просим максимум для Hobby-плана (60с).
 * На других платформах (self-hosted, платформа) экспорт безвреден. */
export const maxDuration = 60;

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
  /* Частичный контекст (например, чужой/старый клиент без pricing) —
   * не роняет роут 500-й: подставляем действующий прайс из моделей. */
  const p = req.context?.pricing ?? {
    wholesalePerBox: PRICE_PER_PACK,
    wholesalePerKg: PRICE_PER_KG,
    smallWholesalePerBox: SMALL_WHOLESALE_PRICE_PER_PACK,
    smallWholesalePerKg: Math.round((SMALL_WHOLESALE_PRICE_PER_PACK / PACK_KG) * 10) / 10,
    costPerKg: COST_PER_KG,
    minWholesaleBoxes: MIN_WHOLESALE_BOXES,
    trialPrice: TRIAL_PRICE,
    packKg: PACK_KG,
  };
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
    "• Раздел discovery — разведка и новые точки (задача 11): на вопрос «есть ли новые точки, которые я ещё не обзвонил» отвечай по discovery.uncalledNewPoints — назови точки поимённо с возрастом в днях и предложи обзвонить их сегодня. Кандидатов из «Найдено ИИ» (discovery.pendingLeads) предлагай добавить в CRM через раздел «Найдено ИИ».",
    "",
    "УСТАВ ВЛАДЕЛЬЦА (приоритетнее общих советов):",
    req.charter?.trim() || "—",
    "",
    "ЖИВЫЕ ЦИФРЫ БИЗНЕСА СЕГОДНЯ (истина в последней инстанции, отвечай только ими):",
    JSON.stringify(req.context, null, 1),
    "",
    "ПРАВИЛА ОТВЕТА:",
    "1. Только русский язык, без английских и китайских иероглифов и без эмодзи. Коротко и по делу — владелец читает с телефона между звонками.",
    "2. Структура: цифры → вывод → конкретное действие (кому позвонить, что спросить, когда заказать).",
    "3. Все числа бери из раздела «ЖИВЫЕ ЦИФРЫ». Не выдумывай цифры, которых там нет.",
    "4. Говори как партнёр: прямо, без канцелярита и без «как интересный вопрос».",
    "5. Если вопроса недостаточно — задай один уточняющий вопрос, но сначала дай то, что уже известно из цифр.",
    "6. Советуя кросс-сейл, называй клиента по имени и товар строго из crossSell.products — «Шаурма на Зорге берёт только фри, предложите соус чесночный за 350 ₽ (маржа 90 ₽)». Цены и маржу бери только из crossSell.products, не из recentOrders."
  ];

  if (req.mode === "advice") {
    base.push(
      "",
      "РЕЖИМ ПРОАКТИВНОГО СОВЕТА: последний вопрос в истории — тема совета, а не вопрос клиента. Выдай ОДИН короткий проактивный совет (2–4 предложения, без приветствий и без списков из 10 пунктов): живые цифры → вывод → одно конкретное действие на сегодня. Если цифры горят (просрочка 15+ дней, склад ниже порога) — начни с этого и пометь срочность словом «срочно»/«просрочка»/«склад заканчивается»."
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

  /* Живая модель через двухрежимный слой (задача 12):
   * публичный API с ключом / SDK песочницы без ключа.
   * Веб-поиск временно отключён (задача 13): ИИ отвечает только
   * по внутреннему контексту базы. */
  const { reply, mode, model, error } = await chatCompletion({
    messages: [
      { role: "system", content: buildSystemPrompt(body) },
      ...trimmed.map((m) => ({ role: m.role, content: m.content })),
    ],
    maxTokens: 2000,
  });

  if (reply) {
    return NextResponse.json({
      reply: cleanMarkdown(reply),
      source: "zai",
      mode,
      model,
    });
  }

  console.warn(
    `[ai-assistant] живая модель недоступна (${mode}${error ? `: ${error}` : ""}) — отвечает офлайн-мозг`
  );

  /* …а если не вышло — офлайн-мозг на тех же цифрах. */
  return NextResponse.json({
    reply: offlineAnswer(lastUser, context),
    source: "offline",
    mode,
  });
}
