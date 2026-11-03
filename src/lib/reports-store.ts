"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Хранилище отчётов (задача 24): «Показать отчёт» в Настройках → Отчёты
 * генерирует недельный отчёт (Мозг добавляет выводы) и сохраняет его
 * здесь. Живёт в localStorage (fryflow-reports-v1), гидратация — как у
 * остальных сторов: skipHydration + rehydrate() в AppShell.
 */

export interface WeeklyReport {
  id: string;
  /** Когда построен (ISO). */
  createdAt: string;
  /** Период: «28 окт — 3 ноя». */
  period: string;
  /** Полный текст отчёта (для повторного показа и отправки). */
  text: string;
  /** HTML-версия для Telegram (задача 25): тот же отчёт с кнопками. */
  html?: string;
  /** Отправлялся ли в Telegram. */
  sentToTelegram: boolean;
}

interface ReportsState {
  reports: WeeklyReport[];
  hydrated: boolean;
  /** Сохранить отчёт (свежие — сверху, храним 12). */
  addReport: (r: Omit<WeeklyReport, "id" | "sentToTelegram">) => WeeklyReport;
  markSent: (id: string) => void;
  /** Удалить отчёт из списка. */
  remove: (id: string) => void;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useReportsStore = create<ReportsState>()(
  persist(
    (set) => ({
      reports: [],
      hydrated: false,

      addReport: (r) => {
        const report: WeeklyReport = { ...r, id: newId(), sentToTelegram: false };
        set((s) => ({ reports: [report, ...s.reports].slice(0, 12) }));
        return report;
      },

      markSent: (id) =>
        set((s) => ({
          reports: s.reports.map((r) =>
            r.id === id ? { ...r, sentToTelegram: true } : r
          ),
        })),

      remove: (id) =>
        set((s) => ({ reports: s.reports.filter((r) => r.id !== id) })),
    }),
    {
      name: "fryflow-reports-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ reports: s.reports }),
      onRehydrateStorage: () => () => {
        useReportsStore.setState({ hydrated: true });
      },
    }
  )
);
