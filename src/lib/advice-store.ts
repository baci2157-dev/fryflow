"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { AdviceCategory } from "@/lib/ai-prompts";

/**
 * Стор последнего совета ИИ-Директора (задача 7).
 *
 * Виджет «Совет от ИИ» на Дашборде показывает последний совет —
 * сгенерированный по триггеру (раз в N часов) или вручную (кнопка
 * «Обновить»). Критичный совет, отправленный владельцу в Telegram,
 * помечается бейджем. История хранится в localStorage
 * (fryflow-advice-v1): закрыли вкладку — совет на месте.
 */

export interface AdviceRecord {
  text: string;
  category: AdviceCategory | null;
  /** Ключевые слова: «просрочка», «склад заканчивается», «срочно»… */
  critical: boolean;
  /** true — критичный совет ушёл в Telegram (владелец был неактивен). */
  sentToTelegram: boolean;
  source: "zai" | "offline";
  /** Как сгенерирован: по триггеру (auto) или кнопкой (manual). */
  trigger: "auto" | "manual";
  /** true — совет создан, пока пользователь был неактивен. */
  inactive: boolean;
  createdAt: string;
}

interface AdviceState {
  /** true после восстановления из localStorage (для скелетонов). */
  hydrated: boolean;
  last: AdviceRecord | null;
  /** Когда генерировали последний совет (ms) — основа интервала 2/3/4 ч. */
  lastGeneratedAt: number;
  /** Индекс в банке промптов — ротация вопросов при каждом срабатывании. */
  promptIndex: number;
  /** Флаг процесса — не даёт гонкам задвоить генерацию (не персистится). */
  generating: boolean;

  setAdvice: (rec: AdviceRecord, promptIndex: number) => void;
  setGenerating: (v: boolean) => void;
  /** Учитываем отправку в Telegram уже после сохранения совета. */
  markSent: () => void;
  reset: () => void;
}

const initial = {
  hydrated: false,
  last: null as AdviceRecord | null,
  lastGeneratedAt: 0,
  promptIndex: -1,
  generating: false,
};

export const useAdviceStore = create<AdviceState>()(
  persist(
    (set) => ({
      ...initial,

      setAdvice: (rec, promptIndex) =>
        set({ last: rec, lastGeneratedAt: Date.now(), promptIndex }),

      setGenerating: (generating) => set({ generating }),

      markSent: () =>
        set((s) =>
          s.last ? { last: { ...s.last, sentToTelegram: true } } : s
        ),

      reset: () => set({ ...initial, hydrated: true }),
    }),
    {
      name: "fryflow-advice-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        last: s.last,
        lastGeneratedAt: s.lastGeneratedAt,
        promptIndex: s.promptIndex,
      }),
      onRehydrateStorage: () => () => {
        useAdviceStore.setState({ hydrated: true });
      },
    }
  )
);
