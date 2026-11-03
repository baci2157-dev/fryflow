"use client";

import { useCrmStore } from "@/lib/clients-store";
import { useDiscoveryStore } from "@/lib/discovery-store";
import type { Client } from "@/types/models";

/**
 * Миграции данных владельца (задача 24).
 *
 * Зачем: сид доезжает только до «свежих» устройств — на телефоне владельца
 * база уже загружена (≥ 100 точек), ensureBaseSeeded её не трогает.
 * Правки координат/адресов/телефона из задачи 24 доставляет эта миграция:
 * она проходит по localStorage-базе один раз (флаг по версии) и правит
 * строки, добавленные старым генератором.
 *
 * Порядок в AppShell: rehydrate → runDataMigrations() → ensureBaseSeeded().
 * Миграция ДО сида: патчит старые формы адресов, после чего дедуп сида
 * (name+address) видит те же строки и не создаёт дублей.
 *
 * Что делает v24:
 *  • удаляет адрес-фантом «ул. 1-я Ковровая, 65/1» (в 2ГИС не существует,
 *    в городе только дачная улица СНТ «Изумруд»; попал на устройства через
 *    «Найдено ИИ») — из базы клиентов и из списка находок Разведчика;
 *  • 14 точек пр. Соколова: «ул.» → «пр.», район → Кировский (по Nominatim),
 *    координаты — дом-точки Nominatim (27/42/47/80) или интерполяция вдоль
 *    улицы (старый генератор раскидывал их по Текучёва/Ржевской/Мечникова);
 *  • «Штефан Бургер (ул. Королёва, 51)» → пр. Королёва, 51: телефон сети
 *    +7 (863) 229-54-54 (2ГИС), координаты сегмента проспекта.
 */

/** Версия применённых миграций (localStorage). */
const MIGRATIONS_KEY = "fryflow-data-migrations";
const CURRENT_VERSION = 24;

/** Нормализация для матчинга: регистр, ё→е, пунктуация, пробелы. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'".,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface RowPatch {
  /** Точное имя клиента (как в старой базе). */
  name: string;
  /** Старый адрес (как в старой базе). */
  oldAddress: string;
  patch: Partial<Client> & { address: string; district: string };
}

/**
 * Правки строк (результат Nominatim-прогона задачи 24; jitter детерминированный
 * по name+новому адресу — тот же алгоритм, что в конвейере сида).
 */
const ROW_PATCHES: RowPatch[] = [
  { name: "Турецкая Лавка 30", oldAddress: "пр. Соколова, 80",
    patch: { address: "пр. Соколова, 80", district: "Кировский",
      coordinates: { lat: 47.232741, lng: 39.717582 } } },
  { name: "Штефан Бургер (ул. Королёва, 51)", oldAddress: "ул. Королёва, 51",
    patch: { name: "Штефан Бургер (пр. Королёва, 51)", address: "пр. Королёва, 51",
      district: "Ворошиловский",
      coordinates: { lat: 47.296195, lng: 39.71365 },
      phone: "+7 (863) 229-54-54",
      notes: "Телефон сети уточнён по 2ГИС (задача 24)" } },
  { name: "Шаурма Восход 31", oldAddress: "пр. Соколова, 104",
    patch: { address: "пр. Соколова, 104", district: "Кировский",
      coordinates: { lat: 47.234415, lng: 39.71667 } } },
  { name: "Штефан Бургер (пр. Соколова, 144)", oldAddress: "пр. Соколова, 144",
    patch: { address: "пр. Соколова, 144", district: "Кировский",
      coordinates: { lat: 47.235218, lng: 39.716006 } } },
  { name: "Шаурма Shop (ул. Соколова, 91)", oldAddress: "ул. Соколова, 91",
    patch: { name: "Шаурма Shop (пр. Соколова, 91)", address: "пр. Соколова, 91",
      district: "Кировский",
      coordinates: { lat: 47.232831, lng: 39.717964 } } },
  { name: "Сити-Фуд 2", oldAddress: "ул. Соколова, 119",
    patch: { address: "пр. Соколова, 119", district: "Кировский",
      coordinates: { lat: 47.234147, lng: 39.71692 } } },
  { name: "Гриль-Барbecue 7", oldAddress: "пр. Соколова, 152",
    patch: { address: "пр. Соколова, 152", district: "Кировский",
      coordinates: { lat: 47.235471, lng: 39.716312 } } },
  { name: "Шаурма Дяди Дена 9", oldAddress: "ул. Соколова, 47",
    patch: { address: "пр. Соколова, 47", district: "Кировский",
      coordinates: { lat: 47.228096, lng: 39.718525 } } },
  { name: "Гастро-Ряд 8", oldAddress: "ул. Соколова, 27",
    patch: { address: "пр. Соколова, 27", district: "Кировский",
      coordinates: { lat: 47.225521, lng: 39.720477 } } },
  { name: "Турецкая Лавка 30", oldAddress: "ул. Соколова, 90",
    patch: { address: "пр. Соколова, 90", district: "Кировский",
      coordinates: { lat: 47.232423, lng: 39.718691 } } },
  { name: "Гост-Китчен 5", oldAddress: "пр. Соколова, 165",
    patch: { address: "пр. Соколова, 165", district: "Кировский",
      coordinates: { lat: 47.235602, lng: 39.716792 } } },
  { name: "Кухня-Призрак 2", oldAddress: "пр. Соколова, 144",
    patch: { address: "пр. Соколова, 144", district: "Кировский",
      coordinates: { lat: 47.234437, lng: 39.716705 } } },
  { name: "Шиша-Лаунж 2", oldAddress: "пр. Соколова, 42",
    patch: { address: "пр. Соколова, 42", district: "Кировский",
      coordinates: { lat: 47.22552, lng: 39.720805 } } },
  { name: "Король Кебаба 20", oldAddress: "пр. Соколова, 112",
    patch: { address: "пр. Соколова, 112", district: "Кировский",
      coordinates: { lat: 47.234339, lng: 39.716575 } } },
  { name: "Шаурма на Соколова", oldAddress: "ул. Соколова, 80",
    patch: { address: "пр. Соколова, 80", district: "Кировский",
      coordinates: { lat: 47.232984, lng: 39.717852 } } },
];

/** Адреса-фантомы: в городе не существуют — сносим где найдём. */
const PHANTOM_ADDRESS_PARTS = ["ковровая"];

function isPhantomAddress(address: string): boolean {
  const a = norm(address);
  return PHANTOM_ADDRESS_PARTS.some((p) => a.includes(p));
}

/** Применена ли уже миграция текущей версии. */
export function migrationsApplied(): boolean {
  try {
    return (
      Number(localStorage.getItem(MIGRATIONS_KEY) ?? "0") >= CURRENT_VERSION
    );
  } catch {
    return false;
  }
}

/**
 * Прогон миграций v24. Идемпотентен,guarded по версии: ручные правки
 * владельца после первого прогона миграция не трогает.
 */
export function runDataMigrations(): void {
  if (migrationsApplied()) return;
  try {
    localStorage.setItem(MIGRATIONS_KEY, String(CURRENT_VERSION));
  } catch {
    /* localStorage недоступен — миграцию всё равно пробуем применить */
  }

  const { clients, updateClient, deleteClient } = useCrmStore.getState();
  const byKey = new Map<string, Client>(
    clients.map((c) => [`${norm(c.name)}||${norm(c.address)}`, c] as const)
  );

  let patched = 0;
  let removed = 0;

  /* 1. Точечные правки строк старого генератора. */
  for (const { name, oldAddress, patch } of ROW_PATCHES) {
    const key = `${norm(name)}||${norm(oldAddress)}`;
    const client = byKey.get(key);
    if (!client) continue;
    updateClient(client.id, patch);
    patched++;
  }

  /* 2. Адрес-фантом «1-я Ковровая, 65/1» — удалить откуда угодно. */
  for (const c of useCrmStore.getState().clients) {
    if (isPhantomAddress(c.address)) {
      deleteClient(c.id);
      removed++;
    }
  }
  /* 3. Тот же фантом из находок Разведчика («Найдено ИИ»). */
  const leads = useDiscoveryStore.getState().leads;
  const freshLeads = leads.filter((l) => !isPhantomAddress(l.address));
  if (freshLeads.length !== leads.length) {
    useDiscoveryStore.setState({ leads: freshLeads });
  }

  if (patched > 0 || removed > 0) {
    console.info(
      `[migrations] v24: правок строк — ${patched}, удалено фантомов — ${removed}`
    );
  }
}
