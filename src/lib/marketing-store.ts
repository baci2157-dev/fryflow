"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Стор истории автопостинга (задача 8, бонус — «Маркетинг»).
 *
 * Календарь автопостинга строится из настроек сервера (интервал,
 * lastPostAt), а здесь живёт локальный журнал публикаций с этого
 * устройства: что и когда реально ушло в группы — для календаря
 * и истории в разделе «Маркетинг». localStorage (fryflow-marketing-v1).
 */

export interface MarketingLogEntry {
  /** Когда опубликовали (ms). */
  at: number;
  /** Итоговый текст поста (после ИИ-переписывания). */
  text: string;
  /** Сколько групп получили пост. */
  posted: number;
  /** Всего групп в настройке. */
  total: number;
}

interface MarketingState {
  log: MarketingLogEntry[];
  hydrated: boolean;
  addLog: (entry: MarketingLogEntry) => void;
  clearLog: () => void;
}

export const useMarketingStore = create<MarketingState>()(
  persist(
    (set) => ({
      log: [],
      hydrated: false,

      addLog: (entry) =>
        set((s) => ({ log: [entry, ...s.log].slice(0, 20) })),

      clearLog: () => set({ log: [] }),
    }),
    {
      name: "fryflow-marketing-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ log: s.log }),
      onRehydrateStorage: () => () => {
        useMarketingStore.setState({ hydrated: true });
      },
    }
  )
);
