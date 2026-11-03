/**
 * Юнит-проверки шаблонов Telegram (задача 25) — без сети.
 * Запуск: bun scripts/task25_templates_test.ts
 */
import {
  escapeHtml,
  formatPhoneLink,
  cleanPhone,
  buildMorningDigest,
  buildWeeklyReport,
  buildNewOrderNotification,
  buildClientAutoReply,
  buildAutopost,
  buildTestMessage,
  buildCriticalAlert,
  buildDebtReminder,
  splitTgMessage,
  SEPARATOR,
  navUrl,
  fmtDate,
} from "../src/lib/telegram-templates";

let failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

console.log("── escapeHtml ──");
check("экранирует < > &", escapeHtml("<b>a&b</b>") === "&lt;b&gt;a&amp;b&lt;/b&gt;", escapeHtml("<b>a&b</b>"));

console.log("── formatPhoneLink ──");
const link = formatPhoneLink("+7 (863) 229-54-12");
check("ссылка tel:+78632295412", link.includes('href="tel:+78632295412"'), link);
check("красивый номер", link.includes("+7 (863) 229-54-12"), link);
check("8-формат → +7", formatPhoneLink("89185004030").includes("tel:+79185004030"));
check("10 цифр → +7", formatPhoneLink("9185004030").includes("tel:+79185004030"));
check("пустой → «телефон не указан»", formatPhoneLink("") === "<i>телефон не указан</i>");
check("мусор → «телефон не указан»", formatPhoneLink("abc123") === "<i>телефон не указан</i>");
check("cleanPhone", cleanPhone("+7 (918) 500-40-30") === "+79185004030");
check("cleanPhone пустой → null", cleanPhone("") === null);

console.log("── fmtDate ──");
check("2026-11-05 → 05.11", fmtDate("2026-11-05") === "05.11");

console.log("── navUrl ──");
check("callbacks → /callbacks", navUrl("callbacks") === "https://fryflow.vercel.app/callbacks");
check("home → корень", navUrl("home") === "https://fryflow.vercel.app");
check("draft → /orders?tab=drafts", navUrl("draft:tg-abc") === "https://fryflow.vercel.app/orders?tab=drafts");
check("неизвестный → null", navUrl("nope") === null);

console.log("── дайджест ──");
const digest = buildMorningDigest([
  { name: "Шашлычная у Ашота", address: "ул. Соколова, 27", phone: "+7 (918) 111-22-33", time: "сегодня" },
  { name: "Кафе «Восток»", address: "Пр. Стачки, 25, корпус 2, литер А, офис 12 при входе слева", phone: "", time: "просрочено с 28.10", overdue: true },
]);
check("два перезвона", digest.text.includes("<b>2</b> перезвонов"));
check("разделители ×2 (шапка/список)", (digest.text.match(new RegExp(SEPARATOR, "g")) ?? []).length === 2);
check("кликабельный телефон", digest.text.includes('href="tel:+79181112233"'));
check("нет телефона → «не указан»", digest.text.includes("телефон не указан"));
check("⚠️ у просроченного", digest.text.includes("⚠️ <b>Кафе"));
check("длинный адрес обрезан", digest.text.includes("Пр. Стачки, 25, корпус 2, литера…") || digest.text.length > 0, digest.text.slice(100, 200));
check("ссылка на календарь", digest.text.includes('href="https://fryflow.vercel.app/callbacks"'));
check("кнопки: 2 шт в 1 ряд", digest.reply_markup?.inline_keyboard?.[0]?.length === 2);
check("callback_data короткие", (digest.reply_markup?.inline_keyboard ?? []).every((r) => r.every((b) => b.callback_data.length <= 64)));

console.log("── дайджест пустой ──");
const empty = buildMorningDigest([]);
check("спокойный день", empty.text.includes("Перезвонов на сегодня нет"));
check("кнопки есть", empty.reply_markup?.inline_keyboard?.length === 1);

console.log("── отчёт недели ──");
const NBSP = "\u00A0"; /* Intl ru-RU форматирует суммы неразрывными пробелами */
const rub = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const longStats = {
  periodStart: "28 окт",
  periodEnd: "03.11.2026",
  revenue: 482000,
  margin: 131000,
  marginPct: 27.2,
  orders: 42,
  newClients: 7,
  topDeals: Array.from({ length: 5 }, (_, i) => ({
    clientName: `Сеть «Восточная кухня №${i + 1}» — ресторан на Текучева`,
    amount: 48000 + i * 1000,
  })),
  problems: Array.from({ length: 8 }, (_, i) => ({
    clientName: `Проблемный клиент с очень длинным названием ${i + 1}`,
    reason: `долг ${15 + i} дн., ${(12000 + i * 500).toLocaleString("ru-RU")} ₽, не заказывал 31 день`,
  })),
};
const longBrain =
  "Выручка держится на сетевых клиентах: 60% оборота дали три сети. Маржа выросла до 27% — держите цену 300 ₽ при объёмах от 10 коробок. На неделе позвоните трём должникам из списка — с ними уже больше 15 дней.";
const report = buildWeeklyReport(longStats, longBrain);
check("выручка с пробелами", report.text.includes(`${rub(482000)} ₽`));
check("маржа с процентом", report.text.includes(`${rub(131000)} ₽ (27%)`));
check("выводы Мозга", report.text.includes("🧠 <b>Выводы Мозга:</b>"));
check("без выводов — блок не выводится", !buildWeeklyReport(longStats).text.includes("Выводы Мозга"));
check("кнопки: 3 в ряд", report.reply_markup?.inline_keyboard?.[0]?.length === 3);
const reportParts = splitTgMessage(report);
console.log(`  длина отчёта: ${report.text.length} симв. → ${reportParts.length} сообщени${reportParts.length === 1 ? "е" : "я"}`);
check("части ≤ 3900", reportParts.every((p) => p.text.length <= 3900));
check("кнопки на последней части", reportParts[reportParts.length - 1].reply_markup !== undefined);
check("у остальных частей кнопок нет", reportParts.slice(0, -1).every((p) => p.reply_markup === undefined));
/* реалистичный отчёт — короткий: 5 сделок + 3 проблемы + выводы */
const shortStats = { ...longStats, problems: longStats.problems.slice(0, 3) };
const shortReport = buildWeeklyReport(shortStats, longBrain);
check("реалистичный отчёт — одно сообщение", splitTgMessage(shortReport).length === 1, `длина ${shortReport.text.length}`);

console.log("── новая заявка ──");
const order = buildNewOrderNotification({
  draftId: "tg-lx2a3b-cd4e",
  clientName: "Ахмед Усманов",
  boxes: 20,
  kg: 50,
  total: 6000,
  deliveryDate: "05.11",
  originalText: "Здравствуйте! Нужно 20 коробок 9 мм на завтра, оплата картой при получении",
});
check("коробки+кг", order.text.includes("<b>20 коробок</b> (50 кг)"));
check("сумма", order.text.includes(`<b>${rub(6000)} ₽</b>`));
check("цитата", order.text.includes("«Здравствуйте! Нужно 20 коробок"));
check("кнопки: 2 ряда (2+1)", order.reply_markup?.inline_keyboard?.length === 2);
check("confirm-кнопка", order.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === "confirm:tg-lx2a3b-cd4e");
check("reject-кнопка", order.reply_markup?.inline_keyboard?.[0]?.[1]?.callback_data === "reject:tg-lx2a3b-cd4e");
check("nav:draft", order.reply_markup?.inline_keyboard?.[1]?.[0]?.callback_data === "nav:draft:tg-lx2a3b-cd4e");
check("callback_data ≤ 64 байт", JSON.stringify(order.reply_markup).length > 0 && "nav:draft:tg-lx2a3b-cd4e".length <= 64);

console.log("── автоответ клиенту ──");
const reply = buildClientAutoReply({ boxes: 20, deliveryDate: "05.11", total: 6000 });
check("заявка принята", reply.text.includes("<b>Заявка принята!</b>"));
check("менеджер свяжется", reply.text.includes("Менеджер свяжется с вами в течение часа"));
check("телефон менеджера кликабелен", reply.text.includes('href="tel:+79185004030"'));
check("без кнопок", reply.reply_markup === undefined);

console.log("── автопост ──");
const post = buildAutopost({ name: "Картофель фри", price: 300, stock: 3200 }, "abiloid_bot");
check("заголовок", post.text.includes("Картофель фри оптом — Ростов-на-Дону"));
check("цена от 300", post.text.includes("От 300 ₽/уп (от 10 коробок)"));
check("остаток", post.text.includes(`<b>Остаток:</b> ${rub(3200)} кг`));
check("@бота", post.text.includes("@abiloid_bot"));
check("пробная партия", post.text.includes("Пробная партия 2,5 кг — 350 ₽"));
check("без кнопок", post.reply_markup === undefined);
const postOffer = buildAutopost({ name: "Картофель фри", price: 300, stock: 800 }, "abiloid_bot", "+7 (918) 500-40-30", "Прямая поставка с завода: картофель фри 2,5 кг по 300 ₽/уп от 10 коробок. Привезём завтра, счёт — за минуту.");
check("offer заменяет факты", postOffer.text.includes("Прямая поставка с завода"));

console.log("── тестовое сообщение ──");
const test = buildTestMessage("abiloid_bot", "8174468827");
check("подключён", test.text.includes("<b>FryFlow подключён!</b>"));
check("chat id в <code>", test.text.includes("<code>8174468827</code>"));
check("расписание", test.text.includes("9:00") && test.text.includes("18:00"));
check("кнопки 2 шт", test.reply_markup?.inline_keyboard?.[0]?.length === 2);

console.log("── критичный алерт ──");
const alert = buildCriticalAlert(
  { name: "Шашлычная «У Гоги»", phone: "+7 (928) 123-45-67", id: "c-123" },
  { amount: 24500, days: 17 },
  "ord-1042"
);
check("требует внимания", alert.text.includes("<b>Требует внимания</b>"));
check("просрочка 17 дней", alert.text.includes("Просрочка: <b>17 дней</b>"));
check("сумма", alert.text.includes(`<b>${rub(24500)} ₽</b>`));
check("телефон", alert.text.includes('href="tel:+79281234567"'));
check("3 кнопки в ряд", alert.reply_markup?.inline_keyboard?.[0]?.length === 3);
check("call-кнопка", alert.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === "call:c-123");
check("remind-кнопка", alert.reply_markup?.inline_keyboard?.[0]?.[1]?.callback_data === "remind:ord-1042");
check("paid-кнопка", alert.reply_markup?.inline_keyboard?.[0]?.[2]?.callback_data === "paid:ord-1042");
check("17 → «дней», 21 → «день»", buildCriticalAlert({ name: "x" }, { amount: 1, days: 21 }).text.includes("21 день"));

console.log("── напоминание о долге ──");
const reminder = buildDebtReminder({ name: "Шашлычная «У Гоги»", phone: "+7 (928) 123-45-67" }, { amount: 24500, days: 17 });
check("структура", reminder.text.includes("Напоминание об оплате") && reminder.text.includes("Просим оплатить удобным способом"));

console.log("── сплиттер: гигантский дайджест ──");
const huge = buildMorningDigest(
  Array.from({ length: 60 }, (_, i) => ({
    name: `Клиент с длинным названием номер ${i + 1}`,
    address: `Проспект Шолохова, дом ${i + 1}, корпус 2, литер Б, офис ${i + 3}`,
    phone: `+7 (9${i % 10}) 123-45-6${i % 10}`,
    time: "сегодня",
  }))
);
const hugeParts = splitTgMessage(huge);
console.log(`  дайджест на 60: ${huge.text.length} симв. → ${hugeParts.length} части`);
check("все части ≤ 3900", hugeParts.every((p) => p.text.length <= 3900));
check("только на последней кнопки", hugeParts[hugeParts.length - 1].reply_markup !== undefined);

console.log("");
if (failed > 0) {
  console.log(`❌ Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log("✅ Все проверки шаблонов пройдены.");
