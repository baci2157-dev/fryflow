"use client";

import { geocodeAddress } from "@/lib/geocode";
import { formatPhoneInput } from "@/components/crm/client-form-dialog";
import { useCrmStore, type NewClientInput } from "@/lib/clients-store";
import {
  DISTRICTS,
  type Client,
  type ClientStatus,
  type ClientType,
  type PriorityTier,
} from "@/types/models";

/**
 * Массовый импорт клиентов из JSON (задача 9).
 *
 * Формат: массив объектов
 *   { name, address, district, phone, type, priority_tier,
 *     coordinates: {lat, lng}, notes }
 *
 * Конвейер записи:
 *   валидация → дедупликация (name+address) → геокодинг адресов
 *   без координат (Nominatim, ≤1 запрос/сек) → addClient в стор.
 *
 * Прогресс гонится колбэком — диалог показывает «Импортировано
 * 45 из 120». Ошибки валидации не роняют всю загрузку: каждая
 * запись разбирается сама по себе, в конце — список с причинами.
 */

/* ── Типы ────────────────────────────────────────────────── */

/** Одна строка импортного файла «как есть» — все поля опциональны. */
export interface ClientImportRow {
  name?: unknown;
  address?: unknown;
  district?: unknown;
  phone?: unknown;
  type?: unknown;
  priority_tier?: unknown;
  priorityTier?: unknown;
  coordinates?: unknown;
  notes?: unknown;
  status?: unknown;
}

/** Причина отбраковки строки. */
export interface ImportIssue {
  /** Имя записи (если удалось прочитать) или «Строка N». */
  name: string;
  reason: string;
}

/** Итог импорта для сводки диалога. */
export interface ImportOutcome {
  /** Сколько записей добавлено в базу. */
  imported: number;
  /** Дубли (name+address) — пропущены. */
  duplicates: number;
  /** Отбракованы валидацией. */
  errors: ImportIssue[];
  /** Добавлены, но с оговоркой (геокодинг не нашёл адрес). */
  warnings: ImportIssue[];
}

export type ImportProgress = (done: number, total: number, label: string) => void;

/* ── Валидация одной строки ──────────────────────────────── */

const CLIENT_TYPES: readonly ClientType[] = [
  "shawarma",
  "burger",
  "canteen",
  "bar",
  "hookah",
  "foodcourt",
  "darkkitchen",
];
const TIERS: readonly PriorityTier[] = ["green", "yellow", "red"];
const STATUSES: readonly ClientStatus[] = [
  "cold",
  "no_answer",
  "callback",
  "trial",
  "regular",
  "refused",
];

/** fallback-координаты: центр Ростова — пока адрес не геокодирован. */
const ROSTOV_CENTER = { lat: 47.2225, lng: 39.7188 };

/** Нормализация телефона: любые «8…»/«918…» → «+7 (918) …» или «». */
function normPhone(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 11 && digits.length > 0 && raw.trim() !== "") {
    // короткий/битый номер — приводим к маске что есть
    return formatPhoneInput(raw);
  }
  return formatPhoneInput(raw);
}

/**
 * Разбор строки файла. Возвращает либо готовый NewClientInput,
 * либо причину отказа. Дефолты для пропущенных полей: тип —
 * шаурмичная, приоритет — yellow, статус — холодный.
 */
function parseRow(
  row: ClientImportRow,
  index: number
):
  | { ok: true; input: NewClientInput; hasCoords: boolean }
  | { ok: false; name: string; reason: string } {
  const fallbackName = `Строка ${index + 1}`;

  if (typeof row !== "object" || row === null) {
    return { ok: false, name: fallbackName, reason: "Не объект" };
  }

  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (name.length < 2) {
    return { ok: false, name: fallbackName, reason: "Не указано название" };
  }
  if (name.length > 120) {
    return { ok: false, name, reason: "Название длиннее 120 символов" };
  }

  const address = typeof row.address === "string" ? row.address.trim() : "";
  if (address.length < 3) {
    return { ok: false, name, reason: "Не указан адрес" };
  }

  const district = typeof row.district === "string" ? row.district.trim() : "";
  if (!district) {
    return { ok: false, name, reason: "Не указан район" };
  }
  // Район должен совпадать со справочником Ростова (без учёта регистра).
  const districtHit = DISTRICTS.find(
    (d) => d.toLowerCase() === district.toLowerCase()
  );
  if (!districtHit) {
    return {
      ok: false,
      name,
      reason: `Неизвестный район «${district}» — нужно из списка: ${DISTRICTS.join(", ")}`,
    };
  }

  const type =
    typeof row.type === "string" && CLIENT_TYPES.includes(row.type as ClientType)
      ? (row.type as ClientType)
      : "shawarma";

  const tierRaw = row.priority_tier ?? row.priorityTier;
  const priorityTier =
    typeof tierRaw === "string" && TIERS.includes(tierRaw as PriorityTier)
      ? (tierRaw as PriorityTier)
      : "yellow";

  const status =
    typeof row.status === "string" && STATUSES.includes(row.status as ClientStatus)
      ? (row.status as ClientStatus)
      : "cold";

  // Координаты: {lat, lng} числами. Строки «47.2, 39.7» тоже принимаем.
  let lat: number | undefined;
  let lng: number | undefined;
  const co = row.coordinates as { lat?: unknown; lng?: unknown } | undefined;
  if (co && typeof co === "object") {
    const la = Number(co.lat);
    const ln = Number(co.lng);
    if (Number.isFinite(la) && Math.abs(la) <= 90) lat = la;
    if (Number.isFinite(ln) && Math.abs(ln) <= 180) lng = ln;
  }
  const hasCoords = lat !== undefined && lng !== undefined;

  return {
    ok: true,
    hasCoords,
    input: {
      name,
      address,
      district: districtHit,
      phone: normPhone(row.phone),
      type,
      status,
      priorityTier,
      notes: typeof row.notes === "string" ? row.notes.trim() : "",
      coordinates: hasCoords
        ? { lat: Math.round(lat! * 1e6) / 1e6, lng: Math.round(lng! * 1e6) / 1e6 }
        : { ...ROSTOV_CENTER },
    },
  };
}

/* ── Парсинг файла ───────────────────────────────────────── */

export interface ParsedClientsFile {
  /** Прошедшие валидацию (но ещё не дедуплицированы). */
  valid: Array<{ input: NewClientInput; hasCoords: boolean; name: string }>;
  /** Отбракованные с причинами. */
  errors: ImportIssue[];
  /** Всего строк в файле. */
  total: number;
}

/** Разбор JSON-текста файла клиентов. Бросает Error при битом JSON. */
export function parseClientsFile(text: string): ParsedClientsFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Файл не является корректным JSON");
  }

  const rows: unknown[] | null = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { clients?: unknown[] }).clients)
      ? ((data as { clients: unknown[] }).clients)
      : null;
  if (!rows) {
    throw new Error(
      "Ожидается массив объектов или { \"clients\": [...] } — проверьте формат файла"
    );
  }

  const valid: ParsedClientsFile["valid"] = [];
  const errors: ImportIssue[] = [];

  rows.forEach((raw, i) => {
    const parsed = parseRow(raw as ClientImportRow, i);
    if (parsed.ok) {
      valid.push({
        input: parsed.input,
        hasCoords: parsed.hasCoords,
        name: parsed.input.name,
      });
    } else {
      errors.push({ name: parsed.name, reason: parsed.reason });
    }
  });

  return { valid, errors, total: rows.length };
}

/* ── Прогон импорта: дедуп + геокодинг + запись в стор ────── */

const key = (name: string, address: string) =>
  `${name.toLowerCase()}|${address.toLowerCase()}`;

/** Пауза для Nominatim: политика — максимум 1 запрос в секунду. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Импорт разобранного файла в CRM. Показывает прогресс, геокодирует
 * адреса без координат, не создаёт дубликаты по name+address
 * (в том числе внутри самого файла).
 */
export async function runClientsImport(
  parsed: ParsedClientsFile,
  onProgress: ImportProgress
): Promise<ImportOutcome> {
  const existing = new Set(
    useCrmStore.getState().clients.map((c: Client) => key(c.name, c.address))
  );

  const addClient = useCrmStore.getState().addClient;

  let imported = 0;
  let duplicates = 0;
  const warnings: ImportIssue[] = [];
  const queue = parsed.valid;
  const total = queue.length;
  let geocodedInRow = 0; // после геокодинга держим паузу 1,1 с

  for (let i = 0; i < queue.length; i++) {
    const { input, hasCoords, name } = queue[i];
    const dedupKey = key(input.name, input.address);

    onProgress(i, total, name);

    if (existing.has(dedupKey)) {
      duplicates++;
      continue;
    }

    if (!hasCoords) {
      // Nominatim: не чаще раза в секунду — иначе банит по политике.
      if (geocodedInRow > 0) await sleep(1100);
      geocodedInRow++;
      try {
        const suggestions = await geocodeAddress(input.address);
        if (suggestions.length > 0) {
          input.coordinates = {
            lat: Math.round(suggestions[0].lat * 1e6) / 1e6,
            lng: Math.round(suggestions[0].lng * 1e6) / 1e6,
          };
        } else {
          warnings.push({
            name,
            reason: "Nominatim не нашёл адрес — поставили центр Ростова, поправьте в карточке",
          });
        }
      } catch {
        warnings.push({
          name,
          reason: "Nominatim недоступен — поставили центр Ростова, поправьте в карточке",
        });
      }
    }

    addClient(input);
    existing.add(dedupKey);
    imported++;
  }

  onProgress(total, total, "готово");

  return { imported, duplicates, errors: parsed.errors, warnings };
}

/* ── Шаблон файла для кнопки «Скачать пример» ─────────────── */

export const CLIENT_IMPORT_SAMPLE = JSON.stringify(
  [
    {
      name: "Шаурма №1",
      address: "ул. Зорге, 19",
      district: "Советский",
      phone: "+7 918 555-01-02",
      type: "shawarma",
      priority_tier: "green",
      coordinates: { lat: 47.2448, lng: 39.7025 },
      notes: "Объём 20 коробок в неделю, просят счёт на юрлицо",
    },
    {
      name: "Бургерная «Плот»",
      address: "пр. Стачки, 45",
      district: "Ленинский",
      phone: "89185550304",
      type: "burger",
      priority_tier: "yellow",
      notes: "Координаты подставит геокодинг Nominatim",
    },
  ],
  null,
  2
);
