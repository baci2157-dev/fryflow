"use client";

import { parseClientsFile, runClientsImport, type ImportOutcome, type ImportProgress } from "@/lib/import-clients";
import { useCrmStore } from "@/lib/clients-store";
import { purgeDemoData } from "@/lib/purge-demo";

/**
 * Авто-сид базы владельца: 330 точек Ростова-на-Дону.
 *
 * Файл лежит в public/seed/clients.json и грузится асинхронно —
 * бандл не раздувается, данные обновляются без пересборки JS.
 * Строки проходят тот же конвейер, что и ручной импорт
 * (валидация → дедуп name+address → геокодинг Nominatim).
 *
 * Когда срабатывает (ensureBaseSeeded, вызывается из AppShell
 * после rehydrate):
 *   • localStorage пуст / клиентов нет → грузим 330 точек;
 *   • в базе только демо-карточки (id cl-*, старый первый запуск)
 *     → демо аккуратно сносится (purgeDemoData) и грузится база;
 *   • база частичная (< 100 точек — зависший на геокодинге импорт,
 *     обрыв сети при первом запуске) → сид ДОГОНЯЕТ базу: дедуп
 *     name+address не создаёт дублей и не трогает ручные правки
 *     (задача 19.5 — раньше «есть хоть одна карточка — не трогаем»
 *     навсегда оставляло телефон на 18–21 точках);
 *   • есть реальная база (≥ 100 точек) → ничего не делаем, данные
 *     владельца неприкосновенны.
 *
 * Если после всего база всё ещё < 100 (файл сида недоступен, сеть
 * оборвалась) — факт фиксируется в seedRuntime, и AppShell показывает
 * ленту-фолбэк «Загрузить базу (330 точек)» (SeedFallbackBanner).
 *
 * Кнопка «Восстановить базу (330 точек)» в Настройках вызывает
 * seedClientsBase напрямую: дедуп сам вернёт только недостающие
 * точки, ручные правки и добавленные клиенты не трогает.
 */

/** Сид базы — статика из public, кэш не нужен (данные обновляемы). */
const SEED_URL = "/seed/clients.json";

/** Один запуск сида: fetch → валидация → дедуп → геокодинг → стор. */
export async function seedClientsBase(
  onProgress: ImportProgress = () => {}
): Promise<ImportOutcome> {
  const res = await fetch(SEED_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Файл базы недоступен (HTTP ${res.status})`);
  }
  const text = await res.text();
  const parsed = parseClientsFile(text);
  return runClientsImport(parsed, onProgress);
}

/** В базе только демо-карточки? (стабильные id cl-* из demo-data) */
function isPureDemoState(): boolean {
  const clients = useCrmStore.getState().clients;
  return (
    clients.length > 0 && clients.every((c) => c.id.startsWith("cl-"))
  );
}

/** Порог «частичной» базы: всё, что ниже, сид догоняет автоматически. */
const MIN_FULL_BASE = 100;

/** Рантайм-статус последнего запуска сида (не персистится) —
 * читает SeedFallbackBanner, чтобы показать кнопку ручной догрузки. */
export const seedRuntime = { attempted: false, error: "" };

/* Защита от параллельного запуска (две вкладки, StrictMode-дубль). */
let seedPromise: Promise<void> | null = null;

/**
 * Первый запуск: подложить базу из 330 точек, если данных нет.
 * Вызывается из AppShell после rehydrate; ошибок не роняет —
 * приложение остаётся работоспособным, сид можно повторить
 * кнопкой в Настройках или перезагрузкой страницы.
 */
export async function ensureBaseSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  const { clients, seeding } = useCrmStore.getState();
  if (seeding) return;
  const pureDemo = isPureDemoState();
  /* Частичная база (< 100) догоняется сидом: дедуп вернёт только
   * недостающие точки, существующие карточки и правки не трогаем. */
  if (clients.length >= MIN_FULL_BASE && !pureDemo) return;

  seedPromise = (async () => {
    useCrmStore.setState({ seeding: true });
    seedRuntime.attempted = true;
    seedRuntime.error = "";
    try {
      /* Старый мир: 18 демо-карточек → честно сносим демо
       * (клиенты, звонки, заказы, движения склада) и кладём базу. */
      if (pureDemo) purgeDemoData();
      const outcome = await seedClientsBase();
      if (outcome.imported > 0) {
        console.info(
          `[seed] база владельца загружена: +${outcome.imported} точек` +
            (outcome.warnings.length > 0
              ? `, ${outcome.warnings.length} без точных координат`
              : "")
        );
      }
    } catch (e) {
      seedRuntime.error = e instanceof Error ? e.message : String(e);
      console.warn("[seed] база не загрузилась:", e);
    } finally {
      useCrmStore.setState({ seeding: false });
      seedPromise = null;
    }
  })();

  return seedPromise;
}
