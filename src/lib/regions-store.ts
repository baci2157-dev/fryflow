"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { demoRegions } from "@/lib/demo-regions";
import type { RegionalPartner, RegionalStatus } from "@/types/models";

/**
 * Стор региональных оптовиков (задача 7).
 *
 * «Регионы» — второй эшелон роста FryFlow: оптовики Краснодара,
 * Волгограда и Ставрополя берут фурами. Статус меняется прямо
 * в списке (Первый контакт → Тест → Фура), данные живут
 * в localStorage (fryflow-regions-v1).
 */

interface RegionsState {
  partners: RegionalPartner[];
  hydrated: boolean;

  /** Смена статуса прямо в списке (чип-дропдаун в карточке/строке). */
  setStatus: (id: string, status: RegionalStatus) => void;
  /** Заметка менеджера — редактируется на месте. */
  setNotes: (id: string, notes: string) => void;

  /** Сброс к демо-базе (Настройки → «Демо-данные»). */
  resetDemo: () => void;
}

export const useRegionsStore = create<RegionsState>()(
  persist(
    (set) => ({
      partners: demoRegions(),
      hydrated: false,

      setStatus: (id, status) =>
        set((s) => ({
          partners: s.partners.map((p) =>
            p.id === id ? { ...p, status } : p
          ),
        })),

      setNotes: (id, notes) =>
        set((s) => ({
          partners: s.partners.map((p) =>
            p.id === id ? { ...p, notes } : p
          ),
        })),

      resetDemo: () =>
        set({ partners: demoRegions(), hydrated: true }),
    }),
    {
      name: "fryflow-regions-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ partners: s.partners }),
      onRehydrateStorage: () => () => {
        useRegionsStore.setState({ hydrated: true });
      },
    }
  )
);

/* ── Селекторы ────────────────────────────────────────────── */

export interface RegionsSummary {
  partners: number;
  /** Суммарный объём, тонн. */
  tons: number;
  /** Партнёры в статусе «Фура». */
  trucks: number;
  tests: number;
  first: number;
  byCity: Array<{ city: string; partners: number; tons: number }>;
}

export function regionsSummary(partners: RegionalPartner[]): RegionsSummary {
  const byCity = new Map<string, { partners: number; tons: number }>();
  let tons = 0;
  let trucks = 0;
  let tests = 0;
  let first = 0;
  for (const p of partners) {
    tons += p.volumeTons;
    if (p.status === "truck") trucks++;
    else if (p.status === "test") tests++;
    else first++;
    const city = byCity.get(p.city) ?? { partners: 0, tons: 0 };
    city.partners++;
    city.tons += p.volumeTons;
    byCity.set(p.city, city);
  }
  return {
    partners: partners.length,
    tons: Math.round(tons * 10) / 10,
    trucks,
    tests,
    first,
    byCity: [...byCity.entries()]
      .map(([city, v]) => ({ city, ...v }))
      .sort((a, b) => b.partners - a.partners),
  };
}

/** Русская плюрализация: 1 партнёр, 2 партнёра, 5 партнёров. */
export function pluralRu(n: number, one: string, few: string, many: string) {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d100 >= 11 && d100 <= 14) return many;
  if (d10 === 1) return one;
  if (d10 >= 2 && d10 <= 4) return few;
  return many;
}

/** «112,5 т» — ru-RU, максимум один знак после запятой. */
export function formatTons(tons: number) {
  return `${tons.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} т`;
}
