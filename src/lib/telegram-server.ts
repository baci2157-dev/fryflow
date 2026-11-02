import { promises as fs } from "fs";
import path from "path";

import { getSupabase, TABLES } from "@/lib/supabase";

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
const CONFIG_FILE = path.join(DATA_DIR, "telegram.json");
const DRAFTS_FILE = path.join(DATA_DIR, "telegram-drafts.json");

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

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readConfig(): Promise<TelegramConfig> {
  let cfg: TelegramConfig;
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    cfg = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<TelegramConfig>) };
  } catch {
    cfg = { ...DEFAULT_CONFIG };
  }
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
  await ensureDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
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
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; description?: string }
      | null;
    if (data?.ok) return { ok: true };
    return {
      ok: false,
      error: humanError(res.status, data?.description ?? ""),
    };
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
    status: "pending",
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
  };
}

async function readDrafts(): Promise<TelegramDraft[]> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from(TABLES.drafts)
      .select("*")
      .eq("status", "pending")
      .order("received_at", { ascending: false });
    return (data ?? []).map(rowToDraft);
  }
  try {
    const raw = await fs.readFile(DRAFTS_FILE, "utf-8");
    return JSON.parse(raw) as TelegramDraft[];
  } catch {
    return [];
  }
}

export async function addDraft(draft: TelegramDraft): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.from(TABLES.drafts).insert(draftToRow(draft));
    return;
  }
  const list = await readDrafts();
  list.unshift(draft);
  await ensureDir();
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(list, null, 2), "utf-8");
}

export async function removeDraft(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (sb) {
    /* Не удаляем, а помечаем — история заявок не теряется. */
    const { error } = await sb
      .from(TABLES.drafts)
      .update({ status: "resolved" })
      .eq("id", id);
    return !error;
  }
  const list = await readDrafts();
  const next = list.filter((d) => d.id !== id);
  if (next.length === list.length) return false;
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(next, null, 2), "utf-8");
  return true;
}

export async function listDrafts(): Promise<TelegramDraft[]> {
  return readDrafts();
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

/* ── Автопост: анти-спам переписывание шаблона ────────────── */

const OPENERS = [
  "Свежая поставка на складе!",
  "Внимание, оптовики 📢",
  "Заправляйте фритюрницы — груз пришёл 🚚",
  "Хватит переплачивать посредникам.",
  "Прямая поставка с завода, без лишних звеньев.",
];

const CLOSERS = [
  "Пишите в личку — счёт за минуту.",
  "Бронируйте объём в личке, остатки не резиновые.",
  "Ответим в чате и привезём завтра.",
  "Первым десяти — доставка по городу бесплатно.",
];

/** Подставляем актуальные остатки в {stock}. */
export function applyStock(
  template: string,
  stockKg: number,
  stockPacks: number
): string {
  const stockLine = `На складе сейчас: ${new Intl.NumberFormat("ru-RU").format(
    stockKg
  )} кг (${new Intl.NumberFormat("ru-RU").format(stockPacks)} уп. по 2,5 кг).`;
  return template.replace(/\{stock\}/gi, stockLine.trim());
}

/** Офлайн-вариация шаблона: новая обёртка, тот же смысл (анти-спам). */
export function varyTemplate(
  template: string,
  stockKg: number,
  stockPacks: number,
  seed = Date.now()
): string {
  const opener = OPENERS[seed % OPENERS.length];
  const closer = CLOSERS[Math.floor(seed / OPENERS.length) % CLOSERS.length];
  const body = applyStock(template, stockKg, stockPacks);
  return `${opener} ${body} ${closer}`;
}

/** Ответ бота клиенту после заявки — «человеческое» подтверждение. */
export const DRAFT_REPLY =
  "Заявку принял, менеджер подтвердит в течение часа. Если нужно срочно — звоните: +7 (918) 500-40-30.";
