import { promises as fs } from "fs";
import path from "path";

import { getSupabase, TABLES } from "@/lib/supabase";
import {
  escapeHtml,
  splitTgMessage,
  type TgMessage,
} from "@/lib/telegram-templates";

/**
 * Серверная библиотека Telegram-интеграции (задача 7).
 *
 * Безопасность: Bot Token живёт ТОЛЬКО на сервере — в файлах
 * .data/telegram.json (каталог в .gitignore) или переменных
 * окружения TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (деплой на
 * Vercel, где файловая система только для чтения). Клиент получает
 * статусы и маски, но никогда — сам токен. Все запросы к
 * api.telegram.org идут из API-роутов Next.js.
 */

/**
 * Где живут серверные данные (.data). Тонкость продакшена:
 * Next.js standalone-сервер делает process.chdir(__dirname) внутрь
 * .next/standalone — а этот каталог стирается при каждой пересборке
 * (bun run build). Поэтому из standalone поднимаемся к корню проекта:
 * конфиг и черновики переживают пересборку и общие для dev/прода.
 *
 * Приоритет: FRYFLOW_DATA_DIR (явное указание каталога) → корень
 * проекта → cwd. На Vercel файловой системы нет — там работают
 * TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (см. README).
 */
function resolveDataDir(): string {
  if (process.env.FRYFLOW_DATA_DIR) return process.env.FRYFLOW_DATA_DIR;
  const cwd = process.cwd();
  if (cwd.endsWith(path.join(".next", "standalone"))) {
    return path.resolve(cwd, "..", "..", ".data");
  }
  return path.join(cwd, ".data");
}

const DATA_DIR = resolveDataDir();

/** Каталог записи на проде без постоянной ФС (Vercel): .data недоступен
 *  для записи — работаем в /tmp текущего инстанса (best-effort, живёт
 *  пока инстанс тёплый; полноценный режим — с Supabase). */
let writeDir: string | null = null;

async function ensureWriteDir(): Promise<string> {
  if (writeDir) return writeDir;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    /* проверяем, что писать реально можно (Vercel: /var/task только чтение) */
    const probe = path.join(DATA_DIR, ".write-probe");
    await fs.writeFile(probe, "ok", "utf-8");
    await fs.rm(probe, { force: true });
    writeDir = DATA_DIR;
  } catch {
    const tmp = "/tmp/fryflow-data";
    try {
      await fs.mkdir(tmp, { recursive: true });
    } catch {
      /* и /tmp недоступен — пусть падает у вызывающего (try/catch выше по стеку) */
    }
    writeDir = tmp;
  }
  return writeDir;
}

/** Читаем файл из обоих возможных каталогов (после падения на /tmp). */
async function readDataJson(file: string): Promise<unknown | null> {
  const dirs = writeDir ? [writeDir, DATA_DIR] : [DATA_DIR, "/tmp/fryflow-data"];
  for (const dir of dirs) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      return JSON.parse(raw) as unknown;
    } catch {
      /* следующий каталог */
    }
  }
  return null;
}

async function writeDataJson(file: string, data: unknown): Promise<void> {
  const dir = await ensureWriteDir();
  await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2), "utf-8");
}

/* ── Конфиг ──────────────────────────────────────────────── */

export interface TelegramConfig {
  /** Токен бота от @BotFather — только на сервере. */
  botToken: string;
  /** Chat ID владельца (куда шлём критичные алерты и тест). */
  chatId: string;
  /** Chat ID групп для автопостинга (через запятую в настройках). */
  groups: string[];
  /** Интервал автопостинга: 2 / 3 / 7 дней. */
  intervalDays: 2 | 3 | 7;
  /** Базовый шаблон поста; {stock} — подставка остатков. */
  template: string;
  /** Когда публиковали последний пост (ms). */
  lastPostAt: number;
  /** true — вебхук получал живые апдейты от Telegram. */
  webhookActive: boolean;
}

export const DEFAULT_TEMPLATE =
  "Оптовикам юга: замороженный картофель фри 2,5 кг — 300 ₽/уп от 10 коробок (120 ₽/кг). Своя доставка за день, счёт за минуту. {stock}";

export const DEFAULT_CONFIG: TelegramConfig = {
  botToken: "",
  chatId: "",
  groups: [],
  intervalDays: 3,
  template: DEFAULT_TEMPLATE,
  lastPostAt: 0,
  webhookActive: false,
};

export async function readConfig(): Promise<TelegramConfig> {
  let cfg: TelegramConfig;
  const raw = (await readDataJson("telegram.json")) as Partial<TelegramConfig> | null;
  cfg = raw ? { ...DEFAULT_CONFIG, ...raw } : { ...DEFAULT_CONFIG };
  /* Фолбэк на переменные окружения — для деплоя (Vercel), где
   * файловой системы нет. Файл (.data/telegram.json) приоритетнее. */
  if (!cfg.botToken && process.env.TELEGRAM_BOT_TOKEN) {
    cfg.botToken = process.env.TELEGRAM_BOT_TOKEN;
  }
  if (!cfg.chatId && process.env.TELEGRAM_CHAT_ID) {
    cfg.chatId = process.env.TELEGRAM_CHAT_ID;
  }
  return cfg;
}

export async function writeConfig(
  patch: Partial<TelegramConfig>
): Promise<TelegramConfig> {
  const next = { ...(await readConfig()), ...patch };
  await writeDataJson("telegram.json", next);
  return next;
}

/** Маска токена для UI: «12345…AbCd» (сам токен клиенту не отдаём). */
export function maskToken(token: string): string {
  if (!token) return "";
  const head = token.slice(0, 5);
  const tail = token.slice(-4);
  return `${head}…${tail}`;
}

/** Что уходит клиенту: без токена, только признаки и настройки. */
export function publicConfig(cfg: TelegramConfig) {
  return {
    connected: Boolean(cfg.botToken && cfg.chatId),
    hasToken: Boolean(cfg.botToken),
    tokenHint: maskToken(cfg.botToken),
    chatId: cfg.chatId,
    groups: cfg.groups,
    intervalDays: cfg.intervalDays,
    template: cfg.template,
    lastPostAt: cfg.lastPostAt,
    webhookActive: cfg.webhookActive,
    autopostReady: Boolean(cfg.botToken && cfg.groups.length > 0),
  };
}

/* ── Отправка сообщений ──────────────────────────────────── */

const API_BASE = "https://api.telegram.org";

/** Человекочитаемая ошибка Telegram — для инлайн-ошибок в настройках. */
function humanError(status: number, description: string): string {
  const d = description.toLowerCase();
  if (d.includes("not found") && status === 404)
    return "Бот не найден — проверьте токен (копируйте целиком из @BotFather).";
  if (d.includes("chat not found"))
    return "Чат не найден — напишите боту первым (Start) и повторите, либо проверьте Chat ID.";
  if (d.includes("unauthorized") || status === 401)
    return "Токен неверный или отозван — создайте новый через @BotFather /revoke.";
  if (d.includes("blocked"))
    return "Бот заблокирован этим пользователем — разблокируйте и повторите.";
  if (d.includes("forbidden") || status === 403)
    return "Бот не может писать в этот чат (нет прав администратора для групп?).";
  if (d.includes("flood"))
    return "Слишком часто — Telegram просит подождать пару секунд.";
  return `Telegram ответил ошибкой: ${description || status}`;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  /* Совместимость: произвольный текст уходит как HTML с экранированием
   * (задача 25 — parse_mode HTML у всех сообщений). */
  const r = await sendTgMessage(token, chatId, { text: escapeHtml(text) });
  return { ok: r.ok, ...(r.error ? { error: r.error } : {}) };
}

/* ── Bot API для inline-кнопок (задача 25) ───────────────── */

/** Голый вызов Bot API: { ok, result?, error? } с человеческой ошибкой. */
async function tgApi<T>(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; result?: T; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; result?: T; description?: string }
      | null;
    if (data?.ok) return { ok: true, result: data.result };
    return { ok: false, error: humanError(res.status, data?.description ?? "") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timeout|abort/i.test(msg))
      return { ok: false, error: "Telegram не ответил за 10 секунд — проверьте сеть." };
    return {
      ok: false,
      error: "Не удалось связаться с Telegram — проверьте подключение к сети.",
    };
  }
}

/** Итог отправки: id созданных сообщений (для editMessageReplyMarkup). */
export interface TgSendResult {
  ok: boolean;
  error?: string;
  messageIds: number[];
}

/**
 * Отправка сообщения по шаблону (задача 25): parse_mode HTML,
 * inline-кнопки (reply_markup), кликабельные tel:-ссылки в тексте.
 * Длинный текст (> ~3900 симв.) автоматически режется на несколько
 * сообщений — кнопки уезжают на последнее (лимит Telegram 4096).
 */
export async function sendTgMessage(
  token: string,
  chatId: string,
  msg: TgMessage
): Promise<TgSendResult> {
  const parts = splitTgMessage(msg);
  const messageIds: number[] = [];
  for (const part of parts) {
    const r = await tgApi<{ message_id: number }>(token, "sendMessage", {
      chat_id: chatId,
      text: part.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(part.reply_markup ? { reply_markup: part.reply_markup } : {}),
    });
    if (!r.ok) return { ok: false, error: r.error, messageIds };
    if (r.result?.message_id) messageIds.push(r.result.message_id);
  }
  return { ok: true, messageIds };
}

/** Ответ на нажатие кнопки: снимает «часики» (вызывать обязательно). */
export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  opts: { text?: string; showAlert?: boolean; url?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  return tgApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(opts.text ? { text: opts.text.slice(0, 200) } : {}),
    ...(opts.showAlert ? { show_alert: true } : {}),
    ...(opts.url ? { url: opts.url } : {}),
  });
}

/** Убирает/меняет кнопки под сообщением (пустая клавиатура — убрать все). */
export async function editMessageReplyMarkup(
  token: string,
  chatId: string | number,
  messageId: number,
  markup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
): Promise<{ ok: boolean; error?: string }> {
  return tgApi(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: markup,
  });
}

/** Кто наш бот: @username для подписей в автопостах и тестовом сообщении. */
export async function getMe(
  token: string
): Promise<{ ok: boolean; username?: string; error?: string }> {
  const r = await tgApi<{ username?: string }>(token, "getMe", {});
  return {
    ok: r.ok,
    ...(r.result?.username ? { username: r.result.username } : {}),
    ...(r.error ? { error: r.error } : {}),
  };
}

/* ── Черновики заявок (создаются вебхуком) ────────────────── */

export interface TelegramDraft {
  /** Уникальный id заявки (синхронизируется с CRM на клиенте). */
  id: string;
  /** Имя клиента: из Telegram или из текста заявки. */
  clientName: string;
  /** Коробок к отгрузке (по 2,5 кг). */
  boxes: number;
  /** Дата доставки yyyy-MM-dd. */
  deliveryDate: string;
  /** Исходное сообщение клиента — попадает в комментарий заказа. */
  message: string;
  /** Кто писал (Telegram-имя), для подписи в карточке. */
  fromName: string;
  /** ISO-время получения. */
  receivedAt: string;
  /** Жизненный цикл заявки (задача 25): pending → confirmed/rejected
   *  (кнопки в Telegram) → resolved (приложение применило). */
  status?: "pending" | "confirmed" | "rejected" | "resolved";
  /** Chat ID клиента в Telegram — для напоминаний об оплате. */
  chatId?: string;
}

/** Supabase-режим: заявки живут в таблице order_drafts (schema.sql),
 *  мок-режим — в файле .data/telegram-drafts.json. */

function draftToRow(d: TelegramDraft) {
  return {
    id: d.id,
    client_name: d.clientName,
    boxes: d.boxes,
    delivery_date: d.deliveryDate,
    message: d.message,
    from_name: d.fromName,
    received_at: d.receivedAt,
    status: d.status ?? "pending",
    ...(d.chatId ? { chat_id: d.chatId } : {}),
  };
}

function rowToDraft(r: Record<string, unknown>): TelegramDraft {
  return {
    id: String(r.id),
    clientName: String(r.client_name ?? "Клиент"),
    boxes: Number(r.boxes ?? 10),
    deliveryDate: String(r.delivery_date ?? ""),
    message: String(r.message ?? ""),
    fromName: String(r.from_name ?? "Telegram"),
    receivedAt: String(r.received_at ?? new Date().toISOString()),
    ...(r.status ? { status: r.status as TelegramDraft["status"] } : {}),
    ...(r.chat_id ? { chatId: String(r.chat_id) } : {}),
  };
}

/** Все заявки из хранилища (любого статуса — для поиска по id). */
async function readAllDrafts(): Promise<TelegramDraft[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from(TABLES.drafts)
      .select("*")
      .order("received_at", { ascending: false });
    return (data ?? []).map(rowToDraft);
  }
  const raw = await readDataJson("telegram-drafts.json");
  return Array.isArray(raw) ? (raw as TelegramDraft[]) : [];
}

/** Заявка по id (для кнопок «Подтвердить/Отклонить» в Telegram). */
export async function findDraft(id: string): Promise<TelegramDraft | null> {
  const all = await readAllDrafts();
  return all.find((d) => d.id === id) ?? null;
}

export async function addDraft(draft: TelegramDraft): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.from(TABLES.drafts).insert(draftToRow(draft));
    return;
  }
  const list = await readAllDrafts();
  list.unshift(draft);
  await writeDataJson("telegram-drafts.json", list);
}

/** Меняет статус заявки (кнопки Telegram: confirmed / rejected). */
export async function setDraftStatus(
  id: string,
  status: NonNullable<TelegramDraft["status"]>
): Promise<boolean> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from(TABLES.drafts)
      .update({ status })
      .eq("id", id);
    return !error;
  }
  const list = await readAllDrafts();
  let found = false;
  const next = list.map((d) => {
    if (d.id !== id) return d;
    found = true;
    return { ...d, status };
  });
  if (!found) return false;
  await writeDataJson("telegram-drafts.json", next);
  return true;
}

export async function removeDraft(id: string): Promise<boolean> {
  /* Не удаляем, а помечаем — история заявок не теряется
   * (и chat_id клиента живёт для напоминаний об оплате). */
  return setDraftStatus(id, "resolved");
}

/** Незакрытые заявки для приложения: pending — создать черновик,
 *  confirmed/rejected — применить решение кнопок Telegram. */
export async function listDrafts(): Promise<TelegramDraft[]> {
  const all = await readAllDrafts();
  return all.filter((d) => (d.status ?? "pending") !== "resolved");
}

/* ── Офлайн-парсер заявок клиентов ────────────────────────── */

/**
 * Парсинг сообщения клиента: «Привет! Нужно 15 коробок фри
 * на четверг» → { boxes: 15, deliveryDate: <ближайший четверг> }.
 * Понимает: N коробок/уп/шт, N кг (делит на 2,5), сегодня/
 * завтра/послезавтра, дни недели, дд.мм(.гггг). Не нашёл —
 * берёт 10 уп (минимальный опт) на завтра и честно ставит флаг.
 */
export function parseOrderRequest(
  text: string,
  now: Date = new Date()
): { boxes: number; deliveryDate: string; confident: boolean } {
  const t = text.toLowerCase();

  /* Коробки: «15 коробок», «20 уп», «12 упаковок», «фуру» = 800 уп? — нет, фуры для регионов; берём по слову. */
  let boxes = 0;
  const boxMatch = t.match(/(\d{1,4})\s*(?:уп|упак|короб|кор|бокс|шт|пал)/);
  const kgMatch = t.match(/(\d{1,5}(?:[.,]\d)?)\s*кг/);
  if (boxMatch) boxes = Number(boxMatch[1]);
  else if (kgMatch) boxes = Math.round(Number(kgMatch[1].replace(",", ".")) / 2.5);

  let date: Date | null = null;
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };

  if (/сегодня/.test(t)) date = day(0);
  else if (/послезавтра/.test(t)) date = day(2);
  else if (/завтра/.test(t)) date = day(1);
  else {
    /* «в четверг», «к пятнице» — ближайший будущий день недели. */
    const weekdays: Array<[RegExp, number]> = [
      [/понедельник/, 1],
      [/вторник/, 2],
      [/сред[уу]|среда/, 3],
      [/четверг/, 4],
      [/пятниц/, 5],
      [/суббот/, 6],
      [/воскресенье|воскресенье/, 0],
    ];
    for (const [re, wd] of weekdays) {
      if (re.test(t)) {
        const current = now.getDay();
        let diff = (wd - current + 7) % 7;
        if (diff === 0) diff = 7; // «в пятницу» в пятницу = через неделю
        date = day(diff);
        break;
      }
    }
    if (!date) {
      /* «20.11», «20.11.2026» */
      const dm = t.match(/(\d{1,2})[.](\d{1,2})(?:[.](\d{2,4}))?/);
      if (dm) {
        const dd = Number(dm[1]);
        const mm = Number(dm[2]);
        const yyyy = dm[3]
          ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3])
          : now.getFullYear();
        const parsed = new Date(yyyy, mm - 1, dd);
        if (!Number.isNaN(parsed.getTime())) {
          // дата в прошлом — значит, на следующий год
          date = parsed.getTime() < now.getTime() && !dm[3]
            ? new Date(yyyy + 1, mm - 1, dd)
            : parsed;
        }
      }
    }
  }

  const confident = boxes > 0;
  return {
    boxes: boxes > 0 ? boxes : 10, // минимальный опт — безопасный дефолт
    deliveryDate: (date ?? day(1)).toISOString().slice(0, 10),
    confident,
  };
}

/* ── Автопост: анти-спам (задача 25 — шаблон в telegram-templates) ── */

/** Шаблон без {stock} — остаток уходит в отдельную строку поста.
 *  Плейсхолдер вырезаем, чтобы не светился в тексте. */
export function stripStockPlaceholder(template: string): string {
  return template.replace(/\s*\{stock\}\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
}

/* ── Вебхук: регистрация через setWebhook (задача 24) ────── */

/** Секрет вебхука: Telegram шлёт его в заголовке каждого апдейта —
 *  подделать запрос извне нельзя. Берём из env (прод) — единый
 *  источник для setWebhook и проверки в роуте. */
export function webhookSecret(): string {
  return (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
}

export async function setTelegramWebhook(
  token: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const secret = webhookSecret();
    const res = await fetch(`${API_BASE}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        ...(secret ? { secret_token: secret } : {}),
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; description?: string }
      | null;
    if (data?.ok) return { ok: true };
    return { ok: false, error: humanError(res.status, data?.description ?? "") };
  } catch {
    return {
      ok: false,
      error: "Не удалось связаться с Telegram — проверьте подключение к сети.",
    };
  }
}

export async function deleteTelegramWebhook(
  token: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; description?: string }
      | null;
    if (data?.ok) return { ok: true };
    return { ok: false, error: humanError(res.status, data?.description ?? "") };
  } catch {
    return { ok: false, error: "Не удалось связаться с Telegram." };
  }
}

/* ── Снапшот данных приложения (задача 24) ───────────────── */

/** Перезвон из журнала звонков — для утреннего дайджеста. */
export interface SnapshotCallback {
  clientName: string;
  phone: string;
  /** Адрес клиента (до 80 символов) — для дайджеста. */
  address: string;
  /** yyyy-MM-dd. */
  date: string;
  overdue: boolean;
}

/** Ключевые цифры недели — для отчёта владельцу. */
export interface WeeklyStats {
  periodStart: string;
  periodEnd: string;
  /** Выручка за 7 дней, ₽ (сумма заказов). */
  revenue: number;
  /** Маржа за 7 дней, ₽. */
  margin: number;
  /** Маржа, %. */
  marginPct: number;
  ordersCount: number;
  newClients: number;
  topDeals: Array<{ clientName: string; amount: number }>;
  problemClients: Array<{ clientName: string; reason: string }>;
  /** Остатки склада на момент снапшота. */
  stockKg: number;
  stockPacks: number;
}

/** Снимок живых данных приложения: приложение шлёт при каждом открытии
 *  (троттлинг на клиенте) — cron в 9:00 строит по нему дайджест и отчёт.
 *  На Vercel без БД живёт в /tmp инстанса (best-effort). */
export interface TelegramSnapshot {
  callbacks: SnapshotCallback[];
  stats: WeeklyStats | null;
  syncedAt: string;
}

export async function readSnapshot(): Promise<TelegramSnapshot | null> {
  const raw = (await readDataJson("telegram-snapshot.json")) as TelegramSnapshot | null;
  if (!raw || typeof raw !== "object") return null;
  return {
    callbacks: Array.isArray(raw.callbacks) ? raw.callbacks : [],
    stats: raw.stats ?? null,
    syncedAt: raw.syncedAt ?? "",
  };
}

export async function writeSnapshot(snap: TelegramSnapshot): Promise<void> {
  await writeDataJson("telegram-snapshot.json", snap);
}

/* ── Свежесть снапшота (дайджест/отчёт считаются в шаблонах) ── */

/** true — снапшот свежий (моложе 36 часов): по нему можно слать
 *  дайджест с перезвонами и отчёт с цифрами. */
export function snapshotFresh(snap: TelegramSnapshot | null): boolean {
  return Boolean(snap?.syncedAt && Date.now() - Date.parse(snap.syncedAt) <= 36 * 3600_000);
}

/* ── Алерты (задача 25: контекст для кнопок критичных сообщений) ── */

/**
 * Критичный алерт, ушедший владельцу в Telegram. Хранит контекст
 * для inline-кнопок: «📞 Позвонить» (tel:), «💬 Напомнить» (клиенту
 * в Telegram, если заказ пришёл оттуда) и «✅ Оплачено» (действие
 * подхватит приложение при следующей синхронизации).
 */
export interface TelegramAlert {
  id: string;
  /** id заказа в CRM (ord-1001) — ключ для кнопок remind/paid. */
  orderId: string;
  /** id клиента в CRM — для кнопки «Позвонить». */
  clientId: string;
  clientName: string;
  phone: string;
  /** Сумма долга, ₽. */
  amount: number;
  /** Дней просрочки. */
  days: number;
  /** Chat ID клиента (если заказ пришёл из Telegram) — куда слать напоминание. */
  clientChatId?: string;
  /** Когда владелец отметил «Оплачено» кнопкой (ms). */
  paidAt?: number;
  /** Когда приложение применило оплату (ms) — после этого не отдаём в синхронизацию. */
  appliedAt?: number;
  /** Когда отправляли напоминание (ms). */
  remindedAt?: number;
  createdAt: string;
}

async function readAlerts(): Promise<TelegramAlert[]> {
  const raw = await readDataJson("telegram-alerts.json");
  return Array.isArray(raw) ? (raw as TelegramAlert[]) : [];
}

async function writeAlerts(list: TelegramAlert[]): Promise<void> {
  /* Храним 50 свежих — алерты короткоживущие (до применения оплаты). */
  await writeDataJson("telegram-alerts.json", list.slice(0, 50));
}

export async function addAlert(alert: Omit<TelegramAlert, "id" | "createdAt">): Promise<void> {
  const list = await readAlerts();
  /* Один заказ — один живой алерт: старый перезаписываем. */
  const next = list.filter(
    (a) => a.orderId !== alert.orderId || a.appliedAt || a.paidAt
  );
  next.unshift({
    ...alert,
    id: `alr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  });
  await writeAlerts(next);
}

/** Последний алерт по заказу (для кнопок remind/paid). */
export async function findAlertByOrder(orderId: string): Promise<TelegramAlert | null> {
  const list = await readAlerts();
  return list.find((a) => a.orderId === orderId) ?? null;
}

/** Последний алерт клиента (для кнопки «Позвонить»). */
export async function findAlertByClient(clientId: string): Promise<TelegramAlert | null> {
  const list = await readAlerts();
  return list.find((a) => a.clientId === clientId) ?? null;
}

export async function markAlertPaid(orderId: string): Promise<boolean> {
  const list = await readAlerts();
  let found = false;
  const next = list.map((a) => {
    if (a.orderId !== orderId) return a;
    found = true;
    return { ...a, paidAt: Date.now() };
  });
  if (!found) return false;
  await writeAlerts(next);
  return true;
}

export async function markAlertReminded(orderId: string): Promise<boolean> {
  const list = await readAlerts();
  let found = false;
  const next = list.map((a) => {
    if (a.orderId !== orderId) return a;
    found = true;
    return { ...a, remindedAt: Date.now() };
  });
  if (!found) return false;
  await writeAlerts(next);
  return true;
}

/** Заказы, отмеченные «Оплачено» кнопкой в Telegram и ещё не применённые
 *  в приложении — их отдаём синхронизации (GET /api/telegram/drafts). */
export async function listUnappliedPaid(): Promise<TelegramAlert[]> {
  const list = await readAlerts();
  return list.filter((a) => a.paidAt && !a.appliedAt);
}

/** Приложение применило оплату — больше не отдаём в синхронизацию. */
export async function markAlertsApplied(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const list = await readAlerts();
  const next = list.map((a) => (set.has(a.id) ? { ...a, appliedAt: Date.now() } : a));
  await writeAlerts(next);
}
