/**
 * Шаблоны Telegram-сообщений FryFlow (задача 25).
 *
 * Все сообщения: parse_mode HTML, аккуратная структура с разделителями
 * ━━━, кликабельные телефоны (tel:), функциональные эмодзи (3–5 на
 * сообщение) и inline-кнопки для действий (максимум 3 в ряд).
 *
 * Правила:
 *  • любой пользовательский текст — через escapeHtml() (защита от
 *    сломанной разметки Telegram);
 *  • телефоны — только через formatPhoneLink(): чистит номер и даёт
 *    кликабельную ссылку tel: (на телефоне открывает звонилку);
 *    пустой/невалидный номер → «телефон не указан»;
 *  • длинные тексты (> 3900 символов) режутся splitTgMessage() по
 *    секциям-разделителям — Telegram принимает до 4096;
 *  • callback_data — короткие (лимит Telegram 64 байта), формат
 *    «action:entityId» (confirm:tg-abc123, paid:ord-1001, nav:clients).
 */

/** Сообщение Telegram: HTML-текст + необязательные inline-кнопки. */
export interface TgMessage {
  text: string;
  reply_markup?: {
    inline_keyboard: Array<
      Array<{ text: string; callback_data: string }>
    >;
  };
}

/** Тонкая линия между секциями сообщения. */
export const SEPARATOR = "━━━━━━━━━━━━━━━━━━";

/** Канонический адрес приложения (прод). */
export const APP_URL = "https://fryflow.vercel.app";

/** Менеджер FryFlow — для автоответов клиентам. */
export const MANAGER_PHONE = "+7 (918) 500-40-30";

/** Разбивка длинного текста: до этого предела — одно сообщение. */
const SPLIT_LIMIT = 3900;

/* ── Базовые утилиты ─────────────────────────────────────── */

/** Экранирование HTML: & < > → сущности (обязателен для parse_mode HTML). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Кликабельный телефон: чистит номер, валидирует и заворачивает в
 * <a href="tel:+7…">. Пустой или невалидный → «телефон не указан».
 */
export function formatPhoneLink(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  let normalized = "";
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    normalized = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    normalized = `7${digits}`;
  } else if (digits.length === 11 && digits[0] === "7") {
    normalized = digits;
  }
  if (!normalized) return "<i>телефон не указан</i>";
  const d = normalized;
  const pretty = `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  return `<a href="tel:+${d}">${pretty}</a>`;
}

/** Очистенный телефон для tel:-кнопок: «+79185004030» или null. */
export function cleanPhone(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  let normalized = "";
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    normalized = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    normalized = `7${digits}`;
  }
  return normalized ? `+${normalized}` : null;
}

/** Длинные адреса режем: 47 символов + «…». */
function cutAddress(address: string): string {
  const a = (address ?? "").trim();
  if (a.length <= 50) return a;
  return `${a.slice(0, 47).trimEnd()}…`;
}

/** «3 200» — деньги с пробелами (для ₽-сумм). */
const fmtRub = (n: number) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(n));

/** «2026-11-05» → «05.11». */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return (iso ?? "").slice(0, 10);
  return `${m[3]}.${m[2]}`;
}

/* ── Разбивка длинных сообщений ──────────────────────────── */

/**
 * Режет текст на куски ≤ ~3900 символов по линиям-разделителям
 * (секции остаются целыми). Кнопки уезжают на последнее сообщение.
 */
export function splitTgMessage(msg: TgMessage): TgMessage[] {
  if (msg.text.length <= SPLIT_LIMIT) return [msg];
  const sections = msg.text.split(`${SEPARATOR}\n`);
  const parts: string[] = [];
  let current = "";
  for (const section of sections) {
    const candidate = current ? `${current}${SEPARATOR}\n${section}` : section;
    if (candidate.length <= SPLIT_LIMIT) {
      current = candidate;
      continue;
    }
    if (current) parts.push(current);
    /* Секция сама огромная — режем по строкам. */
    if (section.length <= SPLIT_LIMIT) {
      current = section;
    } else {
      const lines = section.split("\n");
      let chunk = "";
      for (const line of lines) {
        if ((chunk + line).length > SPLIT_LIMIT) {
          if (chunk) parts.push(chunk);
          chunk = `${line}\n`;
        } else {
          chunk += `${line}\n`;
        }
      }
      current = chunk.trimEnd();
    }
  }
  if (current) parts.push(current);
  return parts.map((text, i) => ({
    text,
    ...(i === parts.length - 1 && msg.reply_markup
      ? { reply_markup: msg.reply_markup }
      : {}),
  }));
}

/* ── Кнопки-навигация ────────────────────────────────────── */

/** Куда ведут nav:-кнопки (разделы FryFlow). */
export const NAV_TARGETS: Record<string, string> = {
  home: "/",
  dashboard: "/",
  callbacks: "/callbacks",
  clients: "/clients",
  finance: "/finance",
  reports: "/settings",
  settings: "/settings",
};

/** Полный URL для nav:-действия («draft:tg-abc» → ?tab=drafts). */
export function navUrl(nav: string): string | null {
  const draftMatch = /^draft:(.+)$/.exec(nav);
  if (draftMatch) return `${APP_URL}/orders?tab=drafts`;
  const path = NAV_TARGETS[nav];
  return path ? `${APP_URL}${path === "/" ? "" : path}` : null;
}

/* ── 1. Утренний дайджест перезвонов ─────────────────────── */

export interface DigestCallback {
  /** Имя клиента. */
  name: string;
  address?: string;
  phone?: string;
  /** Готовая подпись: «сегодня», «просрочено с 28.10»… */
  time: string;
  /** Просроченный перезвон — помечаем ⚠️. */
  overdue?: boolean;
}

/** 🌅 Дайджест 9:00: список перезвонов с кликабельными телефонами. */
export function buildMorningDigest(callbacks: DigestCallback[]): TgMessage {
  if (callbacks.length === 0) {
    return {
      text:
        `🌅 <b>Доброе утро!</b>\n` +
        `Перезвонов на сегодня нет — спокойный день.\n\n` +
        `${SEPARATOR}\n\n` +
        `📋 <a href="${APP_URL}/callbacks">Открыть календарь</a>`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📋 Календарь", callback_data: "nav:callbacks" },
            { text: "📊 Дашборд", callback_data: "nav:dashboard" },
          ],
        ],
      },
    };
  }

  const items = callbacks.slice(0, 20);
  const lines = items.map((c, i) => {
    const name = c.name?.trim() || "Без имени";
    const address = cutAddress(c.address ?? "");
    const head = `${i + 1}. ${c.overdue ? "⚠️ " : ""}<b>${escapeHtml(name)}</b>${address ? ` — ${escapeHtml(address)}` : ""}`;
    return `${head}\n   ${formatPhoneLink(c.phone ?? "")}\n   <i>Перезвон: ${escapeHtml(c.time)}</i>`;
  });
  const rest =
    callbacks.length > 20
      ? `\n\n…и ещё ${callbacks.length - 20} — полный список в календаре.`
      : "";

  return {
    text:
      `🌅 <b>Доброе утро!</b>\n` +
      `Сегодня <b>${callbacks.length}</b> ${callbacks.length === 1 ? "перезвон" : "перезвонов"}.\n\n` +
      `${SEPARATOR}\n\n` +
      `📞 <b>Перезвонить сегодня:</b>\n\n` +
      `${lines.join("\n\n")}${rest}\n\n` +
      `${SEPARATOR}\n\n` +
      `📋 <a href="${APP_URL}/callbacks">Открыть календарь</a>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📋 Календарь", callback_data: "nav:callbacks" },
          { text: "📊 Дашборд", callback_data: "nav:dashboard" },
        ],
      ],
    },
  };
}

/* ── 2. Отчёт недели ─────────────────────────────────────── */

export interface WeeklyReportStats {
  /** «28 окт» и «03.11.2026» (или полные даты — выводим как есть). */
  periodStart: string;
  periodEnd: string;
  revenue: number;
  margin: number;
  marginPct: number;
  orders: number;
  newClients: number;
  topDeals: Array<{ clientName: string; amount: number }>;
  problems: Array<{ clientName: string; reason: string }>;
}

/** 📊 Отчёт недели (вс 18:00): цифры, топ-5, проблемные, выводы Мозга. */
export function buildWeeklyReport(
  stats: WeeklyReportStats,
  brainInsights?: string
): TgMessage {
  const top =
    stats.topDeals.length > 0
      ? stats.topDeals
          .map(
            (d, i) =>
              `${i + 1}. ${escapeHtml(d.clientName || "Без имени")} — ${fmtRub(d.amount)} ₽`
          )
          .join("\n")
      : "—";

  const problems =
    stats.problems.length > 0
      ? stats.problems
          .map(
            (p) =>
              `• ${escapeHtml(p.clientName || "Без имени")} — ${escapeHtml(p.reason)}`
          )
          .join("\n")
      : "—";

  const brain = brainInsights?.trim()
    ? `\n${SEPARATOR}\n\n🧠 <b>Выводы Мозга:</b>\n${escapeHtml(brainInsights.trim())}\n`
    : "";

  return {
    text:
      `📊 <b>Отчёт за неделю</b>\n` +
      `${escapeHtml(stats.periodStart)} — ${escapeHtml(stats.periodEnd)}\n\n` +
      `${SEPARATOR}\n\n` +
      `💰 <b>Выручка:</b> ${fmtRub(stats.revenue)} ₽\n` +
      `📈 <b>Маржа:</b> ${fmtRub(stats.margin)} ₽ (${Math.round(stats.marginPct)}%)\n` +
      `📦 <b>Заказов:</b> ${stats.orders}\n` +
      `👥 <b>Новых клиентов:</b> ${stats.newClients}\n\n` +
      `${SEPARATOR}\n\n` +
      `🔥 <b>Топ-5 сделок:</b>\n${top}\n\n` +
      `⚠️ <b>Требует внимания:</b>\n${problems}\n` +
      brain +
      `\n${SEPARATOR}\n\n` +
      `📊 <a href="${APP_URL}/finance">Открыть финансы</a>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📊 Финансы", callback_data: "nav:finance" },
          { text: "👥 Клиенты", callback_data: "nav:clients" },
          { text: "📋 Отчёты", callback_data: "nav:reports" },
        ],
      ],
    },
  };
}

/** Тот же отчёт без HTML-тегов — для показа в приложении (<pre> в Отчётах). */
export function weeklyReportPlain(
  stats: WeeklyReportStats,
  brainInsights?: string
): string {
  const top =
    stats.topDeals.length > 0
      ? stats.topDeals
          .map((d, i) => `${i + 1}. ${d.clientName || "Без имени"} — ${fmtRub(d.amount)} ₽`)
          .join("\n")
      : "—";
  const problems =
    stats.problems.length > 0
      ? stats.problems.map((p) => `• ${p.clientName || "Без имени"} — ${p.reason}`).join("\n")
      : "—";
  const brain = brainInsights?.trim()
    ? `\n\n🧠 Выводы Мозга:\n${brainInsights.trim()}`
    : "";
  return (
    `📊 Отчёт за неделю\n${stats.periodStart} — ${stats.periodEnd}\n\n` +
    `Выручка: ${fmtRub(stats.revenue)} ₽\n` +
    `Маржа: ${fmtRub(stats.margin)} ₽ (${Math.round(stats.marginPct)}%)\n` +
    `Заказов: ${stats.orders}\n` +
    `Новых клиентов: ${stats.newClients}\n\n` +
    `Топ-5 сделок:\n${top}\n\n` +
    `Требует внимания:\n${problems}${brain}`
  );
}

/* ── 3. Новая заявка из Telegram (владельцу) ─────────────── */

export interface NewOrderDraft {
  draftId: string;
  clientName?: string;
  phone?: string;
  address?: string;
  boxes: number;
  /** Килограммы (boxes × 2,5). */
  kg: number;
  /** Сумма заказа, ₽. */
  total: number;
  deliveryDate: string;
  originalText: string;
}

/** 🆕 Заявка клиенту → владельцу, с кнопками «Подтвердить/Отклонить». */
export function buildNewOrderNotification(d: NewOrderDraft): TgMessage {
  const name = d.clientName?.trim() || "Без имени";
  const address = cutAddress(d.address ?? "");
  const when = fmtDate(d.deliveryDate);
  return {
    text:
      `🆕 <b>Новая заявка из Telegram</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `👤 <b>${escapeHtml(name)}</b>\n` +
      `${formatPhoneLink(d.phone ?? "")}\n` +
      (address ? `📍 ${escapeHtml(address)}\n` : "") +
      `\n📦 <b>${d.boxes} коробок</b> (${d.kg} кг)\n` +
      `💰 <b>${fmtRub(d.total)} ₽</b>\n` +
      `📅 Доставка: ${escapeHtml(when)}\n\n` +
      `${SEPARATOR}\n\n` +
      `💬 <i>«${escapeHtml(d.originalText.slice(0, 300))}»</i>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить", callback_data: `confirm:${d.draftId}` },
          { text: "❌ Отклонить", callback_data: `reject:${d.draftId}` },
        ],
        [{ text: "👁 Открыть черновик", callback_data: `nav:draft:${d.draftId}` }],
      ],
    },
  };
}

/* ── 4. Автоответ клиенту ────────────────────────────────── */

export interface ClientReplyDraft {
  boxes: number;
  deliveryDate: string;
  total: number;
}

/** ✅ Автоответ клиенту после заявки (без кнопок). */
export function buildClientAutoReply(d: ClientReplyDraft): TgMessage {
  return {
    text:
      `✅ <b>Заявка принята!</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `📦 <b>${d.boxes} коробок</b>\n` +
      `📅 Доставка: ${fmtDate(d.deliveryDate)}\n` +
      `💰 ${fmtRub(d.total)} ₽\n\n` +
      `${SEPARATOR}\n\n` +
      `Менеджер свяжется с вами в течение часа для подтверждения.\n\n` +
      `❓ Вопросы: ${formatPhoneLink(MANAGER_PHONE)}`,
  };
}

/* ── 5. Автопостинг в группы ─────────────────────────────── */

export interface AutopostProduct {
  name: string;
  /** Оптовая цена, ₽/уп (от 10 коробок). */
  price: number;
  /** Остаток склада, кг. */
  stock: number;
}

/** 🍟 Объявление для оптовых групп (без inline-кнопок — в группах их не жмут). */
export function buildAutopost(
  product: AutopostProduct,
  botUsername?: string,
  phone: string = MANAGER_PHONE,
  offer?: string
): TgMessage {
  const writeLine = botUsername?.trim()
    ? `💬 Написать: @${escapeHtml(botUsername.trim().replace(/^@/, ""))}\n`
    : "";
  /* Анти-спам: живой рерайт питча владельца (offer) или факты по умолчанию. */
  const facts = offer?.trim()
    ? `<i>${escapeHtml(offer.trim())}</i>`
    : `✅ Замороженный, готов к жарке\n` +
      `📦 Фасовка 2,5 кг\n` +
      `💰 От ${fmtRub(product.price)} ₽/уп (от 10 коробок)\n` +
      `🚚 Доставка по городу\n` +
      `❄️ Хранение −18°C`;
  return {
    text:
      `🍟 <b>Картофель фри оптом — Ростов-на-Дону</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `${facts}\n\n` +
      `${SEPARATOR}\n\n` +
      `🔥 <b>Остаток:</b> ${fmtRub(product.stock)} кг\n\n` +
      `${formatPhoneLink(phone)}\n` +
      writeLine +
      `\n<i>Пробная партия 2,5 кг — 350 ₽. Вычтем при первом опте.</i>`,
  };
}

/* ── 6. Тестовое сообщение ───────────────────────────────── */

/** ✅ Проверка подключения: кто бот, куда шлём, расписание. */
export function buildTestMessage(botUsername: string, chatId: string): TgMessage {
  return {
    text:
      `✅ <b>FryFlow подключён!</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `🤖 Бот: <b>@${escapeHtml(botUsername.replace(/^@/, ""))}</b>\n` +
      `💬 Chat ID: <code>${escapeHtml(chatId)}</code>\n` +
      `⏰ Дайджест: ежедневно в 9:00\n` +
      `📊 Отчёт: воскресенье в 18:00\n\n` +
      `${SEPARATOR}\n\n` +
      `Всё работает. Первые уведомления придут завтра в 9:00.\n\n` +
      `<a href="${APP_URL}/">Открыть FryFlow</a>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🏠 Открыть FryFlow", callback_data: "nav:home" },
          { text: "⚙️ Настройки", callback_data: "nav:settings" },
        ],
      ],
    },
  };
}

/* ── 7. Критичный алерт ──────────────────────────────────── */

export interface CriticalClient {
  name: string;
  phone?: string;
  id?: string;
}

export interface CriticalDebt {
  amount: number;
  days: number;
}

/** 🚨 Просрочка 15+ дней / склад ниже порога: звонок, напоминание, оплата. */
export function buildCriticalAlert(
  client: CriticalClient,
  debt: CriticalDebt,
  orderId?: string
): TgMessage {
  const name = client.name?.trim() || "Без имени";
  const cid = client.id ?? "unknown";
  const oid = orderId ?? "unknown";
  return {
    text:
      `🚨 <b>Требует внимания</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `⚠️ <b>${escapeHtml(name)}</b>\n` +
      `Просрочка: <b>${debt.days} ${debt.days % 10 === 1 && debt.days % 100 !== 11 ? "день" : "дней"}</b>\n` +
      `Сумма: <b>${fmtRub(debt.amount)} ₽</b>\n` +
      `${formatPhoneLink(client.phone ?? "")}\n\n` +
      `${SEPARATOR}\n\n` +
      `<i>Пора напомнить об оплате.</i>`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📞 Позвонить", callback_data: `call:${cid}` },
          { text: "💬 Напомнить", callback_data: `remind:${oid}` },
          { text: "✅ Оплачено", callback_data: `paid:${oid}` },
        ],
      ],
    },
  };
}

/* ── Критичный алерт про склад (без клиента) ─────────────── */

/** 🚨 Общий критичный совет Мозга (склад заканчивается и т.п.). */
export function buildCriticalTextAlert(text: string): TgMessage {
  return {
    text:
      `🚨 <b>Требует внимания</b>\n\n` +
      `${SEPARATOR}\n\n` +
      escapeHtml(text),
  };
}

/* ── Напоминание об оплате (кнопка «Напомнить») ─────────── */

/** 💰 Напоминание о долге — клиенту напрямую или владельцу для пересылки. */
export function buildDebtReminder(
  client: CriticalClient,
  debt: CriticalDebt
): TgMessage {
  const name = client.name?.trim() || "Без имени";
  return {
    text:
      `💰 <b>Напоминание об оплате</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `👤 <b>${escapeHtml(name)}</b>\n` +
      `Просрочка: <b>${debt.days} ${debt.days % 10 === 1 && debt.days % 100 !== 11 ? "день" : "дней"}</b>\n` +
      `Сумма: <b>${fmtRub(debt.amount)} ₽</b>\n\n` +
      `${SEPARATOR}\n\n` +
      `Просим оплатить удобным способом. Спасибо за сотрудничество!\n\n` +
      `❓ Вопросы: ${formatPhoneLink(MANAGER_PHONE)}`,
  };
}
