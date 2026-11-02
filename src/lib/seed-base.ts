"use client";

import { parseClientsFile, runClientsImport, type ImportOutcome, type ImportProgress } from "@/lib/import-clients";
import { useCrmStore } from "@/lib/clients-store";
import { purgeDemoData } from "@/lib/purge-demo";

/**
 * Авто-сид базы владельца: 223 точки Ростова-на-Дону.
 *
 * Файл лежит в public/seed/clients.json и грузится асинхронно —
 * бандл не раздувается, данные обновляются без пересборки JS.
 * Строки проходят тот же конвейер, что и ручной импорт
 * (валидация → дедуп name+address → геокодинг Nominatim).
 *
 * Когда срабатывает (ensureBaseSeeded, вызывается из AppShell
 * после rehydrate):
 *   • localStorage пуст / клиентов нет → грузим 223 точки;
 *   • в базе только демо-карточки (id cl-*, старый первый запуск)
 *     → демо аккуратно сносится (purgeDemoData) и грузится база;
 *   • есть реальные клиенты → ничего не делаем, данные владельца
 *     неприкосновенны.
 *
 * Кнопка «Восстановить базу (223 точки)» в Настройках вызывает
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

/* Защита от параллельного запуска (две вкладки, StrictMode-дубль). */
let seedPromise: Promise<void> | null = null;

/**
 * Первый запуск: подложить базу из 223 точек, если данных нет.
 * Вызывается из AppShell после rehydrate; ошибок не роняет —
 * приложение остаётся работоспособным, сид можно повторить
 * кнопкой в Настройках или перезагрузкой страницы.
 */
export async function ensureBaseSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  const { clients, seeding } = useCrmStore.getState();
  if (seeding) return;
  const pureDemo = isPureDemoState();
  if (clients.length > 0 && !pureDemo) return;

  seedPromise = (async () => {
    useCrmStore.setState({ seeding: true });
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
      console.warn("[seed] база не загрузилась:", e);
    } finally {
      useCrmStore.setState({ seeding: false });
      seedPromise = null;
    }
  })();

  return seedPromise;
}
