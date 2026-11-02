import { fmtKg, fmtRub, ZONE_LABEL, type AiContext, type AiDebtor } from "@/lib/ai-context";

/**
 * Офлайн-режим «Мозга».
 *
 * Работает без ключа ZAI и при сетевых сбоях: строит короткие,
 * предметные ответы на живых цифрах контекста (склад, долги, лиды,
 * выручка). Никаких «как интересный вопрос» — только цифры,
 * вывод и действие.
 */

const plural = (n: number, one: string, few: string, many: string) => {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d100 >= 11 && d100 <= 14) return many;
  if (d10 === 1) return one;
  if (d10 >= 2 && d10 <= 4) return few;
  return many;
};

/** «Кировский» → «с Кировского» — родительный падеж района. */
const genDistrict = (d: string) => d.replace(/ский$/, "ского");

const debtorLine = (d: AiDebtor) =>
  `• ${d.name} — ${fmtRub(d.amountRub)}, ${d.days} ${plural(d.days, "день", "дня", "дней")} (${ZONE_LABEL[d.zone]}), заказ №${d.order}`;

/** Чистка ответа модели: без markdown-звёздочек и решёток —
 *  чат и виджеты FryFlow печатают текст как есть. */
export function cleanMarkdown(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/^#{1,4}\s*/gm, "")
    .replace(/(^|\s)#{1,4}(?=\s)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function debtAnswer(c: AiContext): string {
  const { debtors, totalRub } = c.receivables;
  if (!debtors.length) {
    return `Должников нет — все заказы закрыты. Дебиторка ${fmtRub(0)}.\n\nВывод: деньги не зависли, можно спокойно заниматься новыми лидами.`;
  }
  const danger = debtors.filter((d) => d.zone === "danger");
  const lines = [
    `У вас ${debtors.length} ${plural(debtors.length, "должник", "должника", "должников")} на сумму ${fmtRub(totalRub)}:`,
    "",
    ...debtors.map(debtorLine),
  ];
  if (danger.length) {
    lines.push(
      "",
      `Вывод: ${danger.length} ${plural(danger.length, "просрочка", "просрочки", "просрочек")} 15+ дней — это ${fmtRub(danger.reduce((s, d) => s + d.amountRub, 0))}.`,
      "",
      `Действие: начните день со звонка «${danger[0].name}» (${fmtRub(danger[0].amountRub)}). Скрипт: счёт выставлен, отгрузки замораживаются до оплаты. Кнопка «Напомнить» на экране «Долги» отправит готовый текст в WhatsApp.`
    );
  } else {
    lines.push(
      "",
      `Вывод: красной зоны нет, но ${fmtRub(totalRub)} стоят вне кассы.`,
      "",
      "Действие: прозвоните должников из жёлтой зоны сегодня — чем младше долг, тем проще его закрыть."
    );
  }
  return lines.join("\n");
}

function stockAnswer(c: AiContext): string {
  const s = c.stock;
  const orders = Math.floor(s.packs / 61); // средний заказ ~61 уп./мес на базу — грубая прикидка
  const lines = [
    `На складе ${fmtKg(s.kg)} (${new Intl.NumberFormat("ru-RU").format(s.packs)} уп. по 2,5 кг).`,
  ];
  if (s.outflowKgPerDay > 0) {
    lines.push(
      `Расход за 30 дней: ~${fmtKg(s.outflowKgPerDay)} в день → запаса хватит примерно на ${s.daysLeft} ${plural(s.daysLeft ?? 0, "день", "дня", "дней")}.`
    );
  }
  if (s.isLow) {
    lines.push(
      "",
      `Вывод: остаток ниже порога ${fmtKg(s.lowStockKg)} — это красная зона склада.`,
      "",
      "Действие: заказывайте у поставщика сегодня, пока логистика не превратила дефицит в потерянные заказы."
    );
  } else if (s.daysLeft !== null && s.daysLeft < 14) {
    lines.push(
      "",
      `Вывод: запас опустится ниже порога ${fmtKg(s.lowStockKg)} меньше чем через две недели.`,
      "",
      "Действие: запросите у поставщика счёт на пополнение — ориентир ещё ~1 000–1 400 уп., чтобы не замораживать деньги в лишнем товаре."
    );
  } else {
    lines.push(
      "",
      "Вывод: склад в зелёной зоне, примерно на " +
        `${orders} ${plural(orders, "полный заказ", "полных заказа", "полных заказов")} базы вперёд.`,
      "",
      "Действие: ничего не делать — следить за порогом через «Склад»."
    );
  }
  return lines.join("\n");
}

function leadsAnswer(c: AiContext): string {
  const l = c.leads;
  const top = l.byDistrict.slice(0, 3);
  const lines = [
    `В базе ${l.total} ${plural(l.total, "лид", "лида", "лидов")} для прозвона: ${l.cold} холодных и ${l.noAnswer} ${plural(l.noAnswer, "недозвон", "недозвона", "недозвонов")}.`,
    `С телефоном — ${l.withPhone}, остальным нужен номер из 2ГИС.`,
  ];
  if (top.length) {
    lines.push(
      "",
      "По районам:",
      ...top.map((d) => `• ${d.district} — ${d.count} ${plural(d.count, "точка", "точки", "точек")}`)
    );
  }
  lines.push(
    "",
    "Вывод: главный аргумент звонка — калькулятор выгоды: клиент экономит в год, а не «купите дешевле».",
    "",
    `Действие: обзвоните ${Math.min(l.withPhone, 15)} лидов с телефонами сегодня (10–15 звонков в час). Начните с ${genDistrict(top[0]?.district ?? "вашего района")} — там плотность точек выше, меньше дороги.`
  );
  return lines.join("\n");
}

function financeAnswer(c: AiContext): string {
  const { last30 } = c.orders;
  const marginPerKg = last30.boxes
    ? Math.round((last30.marginRub / (last30.boxes * c.pricing.packKg)) * 10) / 10
    : 0;
  const lines = [
    `За 30 дней: ${last30.count} ${plural(last30.count, "заказ", "заказа", "заказов")} на ${fmtRub(last30.revenueRub)}.`,
    `Себестоимость закупки — ${c.pricing.costPerKg} ₽/кг, маржа составила ${fmtRub(last30.marginRub)} (~${marginPerKg} ₽/кг).`,
  ];
  if (c.receivables.totalRub > 0) {
    lines.push(`Дебиторка на сегодня: ${fmtRub(c.receivables.totalRub)}.`);
  }
  lines.push(
    "",
    "Вывод: маржа держится в целевом коридоре 20–40 ₽/кг." ,
    "",
    "Действие: дожмите дебиторку — каждая неделя ожидания съедает оборотку. Больше зелёных шаурмичных в базе — выше средний чек."
  );
  return lines.join("\n");
}

function priceAnswer(c: AiContext): string {
  const p = c.pricing;
  return [
    "Ценовая политика FryFlow:",
    `• Опт от ${p.minWholesaleBoxes} уп.: ${p.wholesalePerBox} ₽/уп (${p.wholesalePerKg} ₽/кг).`,
    `• Мелкий опт до ${p.minWholesaleBoxes} уп.: ${p.smallWholesalePerBox} ₽/уп (${p.smallWholesalePerKg} ₽/кг).`,
    `• Пробная партия 2,5 кг — ${p.trialPrice} ₽, вычитается из первого оптового заказа.`,
    "",
    `Вывод: себестоимость ${p.costPerKg} ₽/кг — на опте вы зарабатываете ${p.wholesalePerKg - p.costPerKg} ₽/кг.`,
    "",
    "Действие: скидку ниже 280 ₽/уп не давать — это рубильник маржи. Лучше дать объём: «+2 коробки по той же цене».",
  ].join("\n");
}

function regionAnswer(c: AiContext): string {
  const top = c.leads.byDistrict.slice(0, 4);
  if (!top.length) return "Свободных районов для экспансии не вижу — вся база уже в работе.";
  return [
    "Карта лидов по районам:",
    ...top.map(
      (d) => `• ${d.district} — ${d.count} ${plural(d.count, "лид", "лида", "лидов")}`
    ),
    "",
    `Вывод: плотнее всего — ${top[0].district}: один заезд закрывает ${top[0].count} ${plural(top[0].count, "точку", "точки", "точек")}, дорога дешевле.`,
    "",
    "Действие: соберите маршрут дня по этому району (экран «Маршрут») и заезжайте с пробами лично.",
  ].join("\n");
}

/* Региональные оптовики юга (фурами). */
function regionsPartnersAnswer(c: AiContext): string {
  const r = c.regions;
  if (!r || r.partners === 0) {
    return "В базе «Регионы» пока пусто — добавьте оптовика после первого созвона, и я начну советовать, кого добивать до фуры.";
  }
  const cities = r.byCity
    .map((x) => `• ${x.city} — ${x.partners} ${plural(x.partners, "оптовик", "оптовика", "оптовиков")}, ${x.tons} т/мес`)
    .join("\n");
  const lines = [
    `Региональный канал: ${r.partners} ${plural(r.partners, "оптовик", "оптовика", "оптовиков")} на ${r.tons} т/мес: ${r.trucks} ${plural(r.trucks, "фура", "фуры", "фур")} работают, ${r.tests} в тесте.`,
    "",
    "По городам:",
    cities,
    "",
    `Вывод: ближе всего к деньгам — ${r.top[0].company} (${r.top[0].city}, ${r.top[0].volumeTons} т/мес, статус «${r.top[0].status}»).`,
    "",
    "Действие: правильный вопрос тест-оптовикам — «что мешает перейти на фуру?». Обычно это цена доставки: фура 20 т × 300 ₽/уп — это 240 000 ₽ за рейс, предложите фикс на логистику. Экран «Регионы» — статусы меняются прямо в списке.",
  ];
  return lines.join("\n");
}

function clientsAnswer(c: AiContext): string {
  const cl = c.clients;
  const chains = cl.chains.length
    ? `Сети в базе: ${cl.chains.join(", ")}.`
    : "Сетей в базе пока нет.";
  return [
    `База: ${cl.total} ${plural(cl.total, "клиент", "клиента", "клиентов")} — ${cl.green} green, ${cl.yellow} yellow, ${cl.red} red.`,
    chains,
    "",
    "Вывод: шаурмичные (green) — золото: заказывают чаще и больше, платят стабильнее.",
    "",
    "Действие: приоритет звонков — green без заказа дольше 7 дней, потом сети, потом остальное.",
  ].join("\n");
}

/* Кросс-сейл и сезонность (задача 10): каталог + «только фри» + сезон. */
function crossSellAnswer(c: AiContext): string {
  const cs = c.crossSell;
  const onlyFries = c.clientPatterns.filter((p) => p.onlyFries).slice(0, 5);
  const lines: string[] = [];

  if (cs.products.length === 0) {
    lines.push("Каталог попутных товаров пуст — добавьте масло или соус в «Каталоге», и я начну советовать кросс-сейл к каждому заказу.");
  } else {
    lines.push(
      `Каталог попутных: ${cs.products
        .map((p) => `${p.name} — ${fmtRub(p.priceRub)}, маржа ${fmtRub(p.marginRub)} (${p.marginPct}%)`)
        .join("; ")}.`
    );
    lines.push(
      `За 30 дней попутных продано на ${fmtRub(cs.last30Rub)} в ${cs.last30Orders} ${plural(cs.last30Orders, "заказе", "заказах", "заказах")}.`
    );
  }

  lines.push(
    "",
    `Сезон — ${c.seasonality.season} (${c.seasonality.month}). ${c.seasonality.hint}`
  );

  if (onlyFries.length) {
    lines.push(
      "",
      "Берут только фри — кросс-сейл ещё не прижился:",
      ...onlyFries.map(
        (p) =>
          `• ${p.name} (${p.segment}, ${p.ordersCount} ${plural(p.ordersCount, "заказ", "заказа", "заказов")}, с последнего прошло ${p.daysSinceLastOrder} ${plural(p.daysSinceLastOrder, "день", "дня", "дней")})`
      ),
      "",
      `Действие: при следующем звонке предложите «${onlyFries[0].name}» соус или масло к фри — та же машина, доставка бесплатная, маржа чистая.`
    );
  } else {
    lines.push(
      "",
      "Действие: клиенты с историей уже берут попутные товары — двигайте сезонные позиции и следите за остатками в «Каталоге»."
    );
  }
  return lines.join("\n");
}

/* Клиенты «назрели»: без заказа дольше своего интервала — пора с акцией. */
function overdueAnswer(c: AiContext): string {
  const overdue = c.clientPatterns.filter((p) => p.overdue).slice(0, 6);
  if (!overdue.length) {
    return [
      "Назревших клиентов нет — все заказывают в своём ритме.",
      "",
      "Действие: займитесь попутными товарами — у половины клиентов в истории только фри, это бесплатная маржа.",
    ].join("\n");
  }
  const lines = [
    `Назрели — без заказа дольше своего обычного интервала: ${overdue.length} ${plural(overdue.length, "клиент", "клиента", "клиентов")}:`,
    "",
    ...overdue.map(
      (p) =>
        `• ${p.name} (${p.segment}, ${p.tier}) — обычно раз в ${p.avgIntervalDays} ${plural(Math.round(p.avgIntervalDays ?? 0), "день", "дня", "дней")}, прошло ${p.daysSinceLastOrder} ${plural(p.daysSinceLastOrder, "день", "дня", "дней")}, средний чек ${fmtRub(p.avgCheckRub)}`
    ),
    "",
    `Действие: начните с «${overdue[0].name}» — предложите акцию: «+1 упаковка в подарок к заказу от 10 уп» или скидку на попутный товар. Один звонок возвращает средний чек ${fmtRub(overdue[0].avgCheckRub)}.`,
  ];
  return lines.join("\n");
}

function planAnswer(c: AiContext): string {
  const danger = c.receivables.debtors.filter((d) => d.zone === "danger");
  const actions: string[] = [];
  if (c.receivables.debtors.length) {
    actions.push(
      `1. Долги: позвонить ${danger.length ? `просрочке 15+ — ${danger.map((d) => d.name).join(", ")}` : `всем ${c.receivables.debtors.length} должникам`} (${fmtRub(c.receivables.totalRub)} на кону).`
    );
  }
  if (c.leads.withPhone) {
    actions.push(`2. Лиды: обзвонить ${Math.min(c.leads.withPhone, 15)} точек — калькулятор выгоды в руках.`);
  }
  actions.push(
    `3. Склад: ${fmtKg(c.stock.kg)}${c.stock.isLow ? " — ниже порога, пополнить!" : ` — запас на ~${c.stock.daysLeft ?? "∞"} ${plural(c.stock.daysLeft ?? 0, "день", "дней", "дней")}.`}`
  );
  return [
    "План на сегодня по вашим цифрам:",
    "",
    ...actions,
    "",
    "Вывод: сначала деньги (долги), потом новые (лиды), потом запас (склад).",
  ].join("\n");
}

function defaultAnswer(c: AiContext): string {
  return [
    `Сводка на ${new Date().toLocaleDateString("ru-RU")} : склад ${fmtKg(c.stock.kg)}, дебиторка ${fmtRub(c.receivables.totalRub)} (${c.receivables.debtors.length} ${plural(c.receivables.debtors.length, "должник", "должника", "должников")}), за 30 дней ${fmtRub(c.orders.last30.revenueRub)} выручки, ${c.leads.total} ${plural(c.leads.total, "лид", "лида", "лидов")} на прозвон.`,
    "",
    "Спросите точнее: «Сколько у меня долгов?», «На сколько хватит склада?», «Кому звонить сегодня?» — отвечу цифрами и действиями.",
  ].join("\n");
}

/* ── Маршрутизация по смыслу вопроса ─────────────────────── */

type Rule = { keys: RegExp; answer: (c: AiContext) => string };

const RULES: Rule[] = [
  { keys: /долг|должн|дебитор|не плат|просроч|вернуть деньг|кто должен/i, answer: debtAnswer },
  { keys: /склад|остат|запас|картош|пополн|поставщик|хватит/i, answer: stockAnswer },
  { keys: /лид|звон|холод|обзвон|прозвон/i, answer: leadsAnswer },
  { keys: /выруч|марж|прибыл|финанс|денег|заработал|за 30|оборуд/i, answer: financeAnswer },
  { keys: /цен|скидк|дорог|дешев|опт/i, answer: priceAnswer },
  { keys: /оптовик|фур(?:а|ы|ам)?|регион|краснодар|волгоград|ставропол|юг[аеи]/i, answer: regionsPartnersAnswer },
  { keys: /район|город|карт/i, answer: regionAnswer },
  /* Задача 10: кросс-сейл и «назревшие» клиенты — до общих вопросов о клиентах. */
  { keys: /соус|масл|солень|зелен|попутн|кросс|сезон|каталог|товар добавить|что добавить|что предложить к заказу|чесноч|сырн/i, answer: crossSellAnswer },
  { keys: /давно не заказ|акцию|акци\b|назрел|вернуть клиент|не заказывал/i, answer: overdueAnswer },
  { keys: /клиент|база|шаурм|бургер|паб|столов|сеть|green|зелён/i, answer: clientsAnswer },
  { keys: /план|приоритет|с чего нач|утро|день нач|фокус|задач/i, answer: planAnswer },
];

/* ── Нормализация частичного контекста ─────────────────────
 *
 * Офлайн-мозг — последний рубеж роута: он вызывается, когда живая
 * модель недоступна (прод без ключа и SDK). Прийти может что угодно
 * (урезанный/чужой payload, старый клиент) — нормализуем недостающие
 * секции нулями и пустыми списками, чтобы ответ был всегда, а не 500-я.
 */
function normalizeContext(raw: Partial<AiContext> | null | undefined): AiContext {
  const c = (raw ?? {}) as Partial<AiContext>;
  const month = new Date().getMonth();
  const season =
    month === 11 || month <= 1 ? "зима" : month <= 4 ? "весна" : month <= 7 ? "лето" : "осень";
  return {
    today: c.today ?? new Date().toISOString().slice(0, 10),
    stock: {
      kg: 0, packs: 0, lowStockKg: 500, isLow: false,
      outflowKgPerDay: 0, daysLeft: null,
      ...c.stock,
    },
    receivables: { totalRub: 0, debtors: [], ...c.receivables },
    orders: {
      last30: { count: 0, revenueRub: 0, boxes: 0, marginRub: 0, ...c.orders?.last30 },
      drafts: c.orders?.drafts ?? 0,
    },
    leads: {
      cold: 0, noAnswer: 0, total: 0, byDistrict: [], withPhone: 0,
      ...c.leads,
    },
    clients: { total: 0, green: 0, yellow: 0, red: 0, chains: [], ...c.clients },
    regions: c.regions ?? { partners: 0, tons: 0, trucks: 0, tests: 0, byCity: [], top: [] },
    recentOrders: c.recentOrders ?? [],
    clientPatterns: c.clientPatterns ?? [],
    seasonality: {
      month: ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"][month],
      season,
      hint: "",
      ...c.seasonality,
    },
    crossSell: { products: [], last30Rub: 0, last30Orders: 0, ...c.crossSell },
    discovery: {
      pendingLeads: 0, approvedLeads: 0, newPoints7d: 0, uncalledNewPoints: [],
      ...c.discovery,
    },
    pricing: c.pricing ?? {
      wholesalePerBox: 300, wholesalePerKg: 120,
      smallWholesalePerBox: 350, smallWholesalePerKg: 140,
      costPerKg: 100, minWholesaleBoxes: 10,
      trialPrice: 350, packKg: 2.5,
    },
    thresholds: { debtWarnDays: 8, debtDangerDays: 15, ...c.thresholds },
  };
}

/** Ответ офлайн-ИИ на вопрос пользователя по контексту бизнеса. */
export function offlineAnswer(question: string, context: AiContext): string {
  const c = normalizeContext(context);
  for (const rule of RULES) {
    if (rule.keys.test(question)) return rule.answer(c);
  }
  return defaultAnswer(c);
}

/** Приветствие Мозга: первое сообщение — самое важное. */
export function greetingMessage(c: AiContext): string {
  const lines = [
    "Добрый день! Я — Мозг FryFlow, ваш коммерческий директор: вижу историю заказов, паттерны клиентов и сезон.",
    "",
    `Сводка на сегодня:`,
    `• Склад: ${fmtKg(c.stock.kg)} (${new Intl.NumberFormat("ru-RU").format(c.stock.packs)} уп.)${c.stock.isLow ? " — ниже порога!" : ""}`,
    `• Дебиторка: ${fmtRub(c.receivables.totalRub)} — ${c.receivables.debtors.length} ${plural(c.receivables.debtors.length, "должник", "должника", "должников")}`,
    `• За 30 дней: ${fmtRub(c.orders.last30.revenueRub)} выручки, маржа ${fmtRub(c.orders.last30.marginRub)}`,
    `• На прозвон: ${c.leads.total} ${plural(c.leads.total, "лид", "лида", "лидов")}`,
    `• Попутные товары: ${fmtRub(c.crossSell.last30Rub)} за 30 дней — сезон: ${c.seasonality.season}`,
  ];
  const danger = c.receivables.debtors.filter((d) => d.zone === "danger");
  if (danger.length) {
    lines.push(
      "",
      `Первое, что я бы сделал: закрыл просрочку 15+ дней — ${danger.map((d) => `${d.name} (${fmtRub(d.amountRub)})`).join(", ")}.`
    );
  }
  lines.push(
    "",
    "Спрашивайте: «Кому предложить соус?», «Кто давно не заказывал?», «Сколько у меня долгов?»"
  );
  return lines.join("\n");
}
